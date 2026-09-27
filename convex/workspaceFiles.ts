import { v, ConvexError } from 'convex/values';
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server';
import type { MutationCtx } from './_generated/server';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import { enforceRateLimit, RATE_LIMITS } from './lib/rateLimit';
import { notify } from './lib/notify';
import { recordAudit } from './lib/audit';
import { AUDIT } from './lib/auditActions';
import { WORKSPACE_FILE_LIMITS, workspaceRoleAtLeast } from './lib/communaute';
import { checkFileContent, sanitizeFileName } from './lib/fileCheck';
import { memberName, requireWorkspaceRole } from './workspaces';

// FICHIERS PARTAGÉS d'un espace collaboratif (F-24, chantier communauté).
//
// Le parcours d'un fichier, et pourquoi il a trois temps :
//   1. `generateUploadUrl` (mutation) — contributeur ou animateur de l'espace,
//      débit limité. Le navigateur envoie le fichier au stockage Convex.
//   2. `attachFile` (ACTION) — seule une action peut LIRE les octets d'un blob
//      (`ctx.storage.get`) ; c'est donc ici que le contenu est vérifié
//      (convex/lib/fileCheck.ts) : extension autorisée ET signature du format.
//   3. `recordFile` (internalMutation) — revérifie droits, taille et quota DANS
//      la transaction qui écrit : entre 2 et 3, un animateur a pu retirer le
//      déposant, ou un autre dépôt a pu consommer le quota.
//
// ACCÈS. Aucune requête ne renvoie un `storageId`. Un fichier ne se lit que
// par `fileVersionUrl`, qui exige d'être membre de l'espace au moment de la
// demande : un non-membre n'obtient jamais d'URL.

const L = WORKSPACE_FILE_LIMITS;

// Un blob refusé n'est effacé QUE s'il est frais et rattaché à rien. Sans
// cette double garde, un appel malveillant passant l'identifiant d'un blob
// d'autrui (une publication en file, un fichier d'un autre espace) obtiendrait
// sa suppression par un simple refus.
const DISCARD_WINDOW_MS = 15 * 60 * 1000;

export const generateUploadUrl = mutation({
  args: { workspaceId: v.id('workspaces') },
  returns: v.string(),
  handler: async (ctx, { workspaceId }) => {
    const { user } = await requireWorkspaceRole(
      ctx,
      workspaceId,
      'contributeur',
    );
    await enforceRateLimit(ctx, {
      key: `workspaceUpload:${user._id}`,
      ...RATE_LIMITS.workspaceUpload,
    });
    return await ctx.storage.generateUploadUrl();
  },
});

type UploadCheck =
  | { ok: true; size: number; sha256: string }
  | { ok: false; code: string; discardable: boolean };

// Contrôles préalables à la lecture des octets. La garde de rôle LÈVE (un
// appelant non autorisé ne déclenche rien, pas même l'effacement du blob) ;
// les autres refus sont RENDUS, avec la possibilité d'effacer le blob.
export const uploadContext = internalQuery({
  args: {
    workspaceId: v.id('workspaces'),
    storageId: v.id('_storage'),
    fileId: v.optional(v.id('workspaceFiles')),
    now: v.number(),
  },
  returns: v.union(
    v.object({ ok: v.literal(true), size: v.number(), sha256: v.string() }),
    v.object({
      ok: v.literal(false),
      code: v.string(),
      discardable: v.boolean(),
    }),
  ),
  handler: async (ctx, args): Promise<UploadCheck> => {
    const { workspace } = await requireWorkspaceRole(
      ctx,
      args.workspaceId,
      'contributeur',
    );
    const meta = await ctx.db.system.get(args.storageId);
    if (!meta) return { ok: false, code: 'INVALID_FILE', discardable: false };
    const used = await ctx.db
      .query('workspaceFileVersions')
      .withIndex('by_storage', (q) => q.eq('storageId', args.storageId))
      .first();
    // Déjà rattaché : ni accepté une seconde fois, ni effacé.
    if (used) return { ok: false, code: 'INVALID_FILE', discardable: false };
    const discardable = args.now - meta._creationTime < DISCARD_WINDOW_MS;
    const refuse = (code: string) => ({
      ok: false as const,
      code,
      discardable,
    });

    if (meta.size === 0) return refuse('FILE_EMPTY');
    if (meta.size > L.maxFileBytes) return refuse('FILE_TOO_LARGE');
    if ((workspace.storageBytes ?? 0) + meta.size > L.quotaBytes) {
      return refuse('QUOTA_EXCEEDED');
    }
    if (args.fileId) {
      const file = await ctx.db.get(args.fileId);
      if (!file || file.workspaceId !== args.workspaceId) {
        return refuse('NOT_FOUND');
      }
      if (file.versionCount >= L.maxVersionsPerFile) {
        return refuse('TOO_MANY_VERSIONS');
      }
    } else if ((workspace.fileCount ?? 0) >= L.maxFiles) {
      return refuse('TOO_MANY_FILES');
    }
    return { ok: true, size: meta.size, sha256: meta.sha256 };
  },
});

// Rattache un blob téléversé à l'espace — nouveau fichier, ou nouvelle
// version de `fileId`. Rend `{ fileId, version }`.
export const attachFile = action({
  args: {
    workspaceId: v.id('workspaces'),
    storageId: v.id('_storage'),
    name: v.string(),
    fileId: v.optional(v.id('workspaceFiles')),
  },
  returns: v.object({ fileId: v.id('workspaceFiles'), version: v.number() }),
  handler: async (
    ctx,
    args,
  ): Promise<{ fileId: Id<'workspaceFiles'>; version: number }> => {
    const name = sanitizeFileName(args.name, L.nameMaxLength);
    const check: UploadCheck = await ctx.runQuery(
      internal.workspaceFiles.uploadContext,
      {
        workspaceId: args.workspaceId,
        storageId: args.storageId,
        ...(args.fileId ? { fileId: args.fileId } : {}),
        now: Date.now(),
      },
    );
    if (!check.ok) {
      if (check.discardable) await ctx.storage.delete(args.storageId);
      throw new ConvexError(check.code);
    }

    // LE CONTENU, pas l'étiquette : les octets doivent porter la signature du
    // format que l'extension annonce.
    const blob = await ctx.storage.get(args.storageId);
    if (!blob) throw new ConvexError('INVALID_FILE');
    const verdict = checkFileContent(
      name,
      new Uint8Array(await blob.arrayBuffer()),
    );
    if (!name || !verdict.ok) {
      await ctx.storage.delete(args.storageId);
      throw new ConvexError(verdict.ok ? 'INVALID_NAME' : verdict.code);
    }

    try {
      return await ctx.runMutation(internal.workspaceFiles.recordFile, {
        workspaceId: args.workspaceId,
        storageId: args.storageId,
        name,
        ...(args.fileId ? { fileId: args.fileId } : {}),
        contentType: verdict.contentType,
        size: check.size,
        sha256: check.sha256,
      });
    } catch (err) {
      // Refusé à l'écriture (droits retirés, quota consommé entre-temps) : le
      // blob n'est rattaché à rien, et il est frais — on le retire.
      await ctx.storage.delete(args.storageId);
      throw err;
    }
  },
});

export const recordFile = internalMutation({
  args: {
    workspaceId: v.id('workspaces'),
    storageId: v.id('_storage'),
    name: v.string(),
    fileId: v.optional(v.id('workspaceFiles')),
    contentType: v.string(),
    size: v.number(),
    sha256: v.string(),
  },
  returns: v.object({ fileId: v.id('workspaceFiles'), version: v.number() }),
  handler: async (ctx, args) => {
    const { user, workspace } = await requireWorkspaceRole(
      ctx,
      args.workspaceId,
      'contributeur',
    );
    const used = await ctx.db
      .query('workspaceFileVersions')
      .withIndex('by_storage', (q) => q.eq('storageId', args.storageId))
      .first();
    if (used) throw new ConvexError('INVALID_FILE');
    const storageBytes = workspace.storageBytes ?? 0;
    if (storageBytes + args.size > L.quotaBytes) {
      throw new ConvexError('QUOTA_EXCEEDED');
    }

    const now = Date.now();
    const author = memberName(user);
    let fileId: Id<'workspaceFiles'>;
    let version: number;
    let fileName: string;
    if (args.fileId) {
      const file = await ctx.db.get(args.fileId);
      if (!file || file.workspaceId !== args.workspaceId) {
        throw new ConvexError('NOT_FOUND');
      }
      if (file.versionCount >= L.maxVersionsPerFile) {
        throw new ConvexError('TOO_MANY_VERSIONS');
      }
      fileId = file._id;
      version = file.currentVersion + 1;
      fileName = file.name;
      await ctx.db.patch(file._id, {
        currentVersion: version,
        versionCount: file.versionCount + 1,
        totalBytes: file.totalBytes + args.size,
        latestSize: args.size,
        latestContentType: args.contentType,
        updatedAt: now,
      });
    } else {
      if ((workspace.fileCount ?? 0) >= L.maxFiles) {
        throw new ConvexError('TOO_MANY_FILES');
      }
      version = 1;
      fileName = args.name;
      fileId = await ctx.db.insert('workspaceFiles', {
        workspaceId: args.workspaceId,
        name: args.name,
        createdBy: user._id,
        createdByName: author,
        currentVersion: 1,
        versionCount: 1,
        totalBytes: args.size,
        latestSize: args.size,
        latestContentType: args.contentType,
        createdAt: now,
        updatedAt: now,
      });
    }

    await ctx.db.insert('workspaceFileVersions', {
      fileId,
      workspaceId: args.workspaceId,
      version,
      storageId: args.storageId,
      size: args.size,
      contentType: args.contentType,
      sha256: args.sha256,
      authorUserId: user._id,
      authorName: author,
      createdAt: now,
    });
    await ctx.db.patch(args.workspaceId, {
      storageBytes: storageBytes + args.size,
      fileCount: (workspace.fileCount ?? 0) + (args.fileId ? 0 : 1),
    });

    // Les autres membres de l'espace sont prévenus. Plafonné : au-delà, un
    // espace est une liste de diffusion, et chaque dépôt n'y mérite pas une
    // alerte par personne.
    const members = await ctx.db
      .query('workspaceMembers')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', args.workspaceId))
      .take(100);
    for (const m of members) {
      if (m.userId === user._id) continue;
      await notify(ctx, {
        userId: m.userId,
        type: 'workspace_file',
        titleKey:
          version === 1 ? 'workspaceFileAdded' : 'workspaceFileVersioned',
        params: { title: workspace.title, file: fileName },
        link: `/espaces/${args.workspaceId}`,
      });
    }
    return { fileId, version };
  },
});

// --- Lecture (membres de l'espace, lecteurs compris) -------------------------

const FILES_MAX = L.maxFiles;

export const listFiles = query({
  args: { workspaceId: v.id('workspaces') },
  returns: v.array(
    v.object({
      _id: v.id('workspaceFiles'),
      name: v.string(),
      createdByName: v.string(),
      // Peut le supprimer : son auteur, ou un animateur.
      canDelete: v.boolean(),
      currentVersion: v.number(),
      updatedAt: v.number(),
      versions: v.array(
        v.object({
          _id: v.id('workspaceFileVersions'),
          version: v.number(),
          size: v.number(),
          contentType: v.string(),
          authorName: v.string(),
          createdAt: v.number(),
        }),
      ),
    }),
  ),
  handler: async (ctx, { workspaceId }) => {
    const { user, role } = await requireWorkspaceRole(
      ctx,
      workspaceId,
      'lecteur',
    );
    const files = await ctx.db
      .query('workspaceFiles')
      .withIndex('by_workspace', (q) => q.eq('workspaceId', workspaceId))
      .take(FILES_MAX);
    const out = [];
    for (const f of files.sort((a, b) => b.updatedAt - a.updatedAt)) {
      const versions = await ctx.db
        .query('workspaceFileVersions')
        .withIndex('by_file_and_version', (q) => q.eq('fileId', f._id))
        .order('desc')
        .take(L.maxVersionsPerFile);
      out.push({
        _id: f._id,
        name: f.name,
        createdByName: f.createdByName,
        canDelete:
          f.createdBy === user._id || workspaceRoleAtLeast(role, 'animateur'),
        currentVersion: f.currentVersion,
        updatedAt: f.updatedAt,
        versions: versions.map((ver) => ({
          _id: ver._id,
          version: ver.version,
          size: ver.size,
          contentType: ver.contentType,
          authorName: ver.authorName,
          createdAt: ver.createdAt,
        })),
      });
    }
    return out;
  },
});

// L'URL d'une version, pour un membre de l'espace SEULEMENT. C'est la seule
// porte vers le contenu d'un fichier.
export const fileVersionUrl = query({
  args: { versionId: v.id('workspaceFileVersions') },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, { versionId }) => {
    const version = await ctx.db.get(versionId);
    if (!version) throw new ConvexError('NOT_FOUND');
    await requireWorkspaceRole(ctx, version.workspaceId, 'lecteur');
    return await ctx.storage.getUrl(version.storageId);
  },
});

// Supprime un fichier ET toutes ses versions (blobs compris). Son auteur ou un
// animateur ; l'animateur qui supprime le fichier d'autrui est journalisé.
export const deleteFile = mutation({
  args: { fileId: v.id('workspaceFiles') },
  returns: v.null(),
  handler: async (ctx, { fileId }) => {
    const file = await ctx.db.get(fileId);
    if (!file) throw new ConvexError('NOT_FOUND');
    const { user, role } = await requireWorkspaceRole(
      ctx,
      file.workspaceId,
      'lecteur',
    );
    const own = file.createdBy === user._id;
    if (!own && !workspaceRoleAtLeast(role, 'animateur')) {
      throw new ConvexError('FORBIDDEN');
    }
    await removeFileCascade(ctx, file);
    if (!own) {
      await recordAudit(ctx, {
        actorId: user._id,
        action: AUDIT.WORKSPACE_FILE_DELETED,
        targetId: file.workspaceId,
        metadata: { fileName: file.name, authorId: file.createdBy },
      });
    }
    return null;
  },
});

// Suppression d'un fichier logique : versions, blobs, compteurs de l'espace.
// Exportée pour la suppression de compte et d'espace (convex/communaute.ts).
export async function removeFileCascade(
  ctx: MutationCtx,
  file: Doc<'workspaceFiles'>,
): Promise<void> {
  const versions = await ctx.db
    .query('workspaceFileVersions')
    .withIndex('by_file_and_version', (q) => q.eq('fileId', file._id))
    .take(L.maxVersionsPerFile + 10);
  let freed = 0;
  for (const ver of versions) {
    freed += ver.size;
    await ctx.storage.delete(ver.storageId);
    await ctx.db.delete(ver._id);
  }
  await ctx.db.delete(file._id);
  const ws = await ctx.db.get(file.workspaceId);
  if (ws) {
    await ctx.db.patch(ws._id, {
      storageBytes: Math.max(0, (ws.storageBytes ?? 0) - freed),
      fileCount: Math.max(0, (ws.fileCount ?? 0) - 1),
    });
  }
}
