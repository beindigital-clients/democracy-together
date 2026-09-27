// @vitest-environment edge-runtime
import { describe, it, expect } from 'vitest';
import { convexTest } from 'convex-test';
import schema from './schema';
import { api } from './_generated/api';
import type { Id } from './_generated/dataModel';

const modules = import.meta.glob([
  './**/*.ts',
  './**/*.js',
  '!./**/*.test.ts',
  '!./**/*.d.ts',
  '!./auth.ts',
  '!./auth.config.ts',
  '!./http.ts',
]);

// Profils de personnes (chantier « social ») : visibilité, énumération,
// photo, préférences de notification. Chaque refus est vérifié par le
// chemin que prendrait un tiers — anonyme, visiteur, autre membre.

type T = ReturnType<typeof convexTest>;

async function person(t: T, email: string, role = 'membre', name = email) {
  const id = await t.run((ctx) =>
    ctx.db.insert('users', { email, role: role as never, name }),
  );
  return { id, as: t.withIdentity({ subject: `${id}|s` }) };
}

const BASE = {
  handle: '',
  bio: '',
  jobTitle: '',
  country: '',
  themes: [] as string[],
  languages: [] as string[],
  links: [] as { kind: 'website'; url: string }[],
  mutedNotificationTypes: [] as string[],
  messageEmail: false,
};

async function saveProfile(
  as: ReturnType<T['withIdentity']>,
  over: Partial<typeof BASE> & {
    displayName: string;
    visibility: 'private' | 'members' | 'public';
    messagePolicy?: 'nobody' | 'followed' | 'members';
  },
) {
  return await as.mutation(api.social.profiles.saveProfile, {
    ...BASE,
    messagePolicy: 'members',
    ...over,
  });
}

describe('Profil — visibilité', () => {
  it('public : lisible anonymement, et rien de privé ne sort', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'a@test.org');
    const { handle } = await saveProfile(a.as, {
      displayName: 'Awa Diallo',
      visibility: 'public',
      bio: 'Chercheuse en gouvernance.',
      mutedNotificationTypes: ['social_follow'],
    });
    expect(handle).toBe('awa-diallo');
    const pub = await t.query(api.social.profiles.getByHandle, { handle });
    expect(pub?.displayName).toBe('Awa Diallo');
    expect(pub?.indexable).toBe(true);
    // Projection fermée : ni identifiant de compte, ni préférences.
    for (const k of [
      'userId',
      'mutedNotificationTypes',
      'messagePolicy',
      'photoId',
      'visibility',
      'messageEmail',
    ]) {
      expect(pub).not.toHaveProperty(k);
    }
  });

  it('privé : invisible de tous, sauf de soi — et indiscernable d’un handle inconnu', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'a@test.org');
    const b = await person(t, 'b@test.org');
    const admin = await person(t, 'admin@test.org', 'admin');
    const { handle } = await saveProfile(a.as, {
      displayName: 'Profil Secret',
      visibility: 'private',
    });
    expect(
      await t.query(api.social.profiles.getByHandle, { handle }),
    ).toBeNull();
    expect(
      await b.as.query(api.social.profiles.getByHandle, { handle }),
    ).toBeNull();
    expect(
      await admin.as.query(api.social.profiles.getByHandle, { handle }),
    ).toBeNull();
    expect(
      await b.as.query(api.social.profiles.relationship, { handle }),
    ).toBeNull();
    // Même réponse qu'un handle qui n'existe pas.
    expect(
      await b.as.query(api.social.profiles.getByHandle, {
        handle: 'personne-inexistante',
      }),
    ).toBeNull();
    // Le propriétaire, lui, se voit.
    expect(
      (await a.as.query(api.social.profiles.getByHandle, { handle }))
        ?.displayName,
    ).toBe('Profil Secret');
  });

  it('membres : réservé aux membres connectés (ni anonyme, ni visiteur), non indexable', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'a@test.org');
    const b = await person(t, 'b@test.org');
    const visiteur = await person(t, 'v@test.org', 'visiteur');
    const { handle } = await saveProfile(a.as, {
      displayName: 'Réservé Membres',
      visibility: 'members',
    });
    expect(
      await t.query(api.social.profiles.getByHandle, { handle }),
    ).toBeNull();
    expect(
      await visiteur.as.query(api.social.profiles.getByHandle, { handle }),
    ).toBeNull();
    const seen = await b.as.query(api.social.profiles.getByHandle, { handle });
    expect(seen?.displayName).toBe('Réservé Membres');
    expect(seen?.indexable).toBe(false);
  });

  it('un propriétaire rétrogradé en visiteur disparaît, même en public', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'a@test.org');
    const { handle } = await saveProfile(a.as, {
      displayName: 'Ancien Membre',
      visibility: 'public',
    });
    await t.run((ctx) => ctx.db.patch(a.id, { role: 'visiteur' }));
    expect(
      await t.query(api.social.profiles.getByHandle, { handle }),
    ).toBeNull();
  });

  it('bloqué par le propriétaire : le profil devient invisible pour le bloqué', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'a@test.org');
    const b = await person(t, 'b@test.org');
    const { handle } = await saveProfile(a.as, {
      displayName: 'Awa Diallo',
      visibility: 'public',
    });
    await a.as.mutation(api.social.messages.block, { userId: b.id });
    expect(
      await b.as.query(api.social.profiles.getByHandle, { handle }),
    ).toBeNull();
  });
});

describe('Annuaire des personnes — énumération', () => {
  async function seed() {
    const t = convexTest(schema, modules);
    const viewer = await person(t, 'viewer@test.org');
    const pub = await person(t, 'pub@test.org');
    const mem = await person(t, 'mem@test.org');
    const priv = await person(t, 'priv@test.org');
    await saveProfile(pub.as, {
      displayName: 'Kofi Mensah',
      visibility: 'public',
      country: 'gh',
      themes: ['elections'],
      languages: ['en'],
    });
    await saveProfile(mem.as, {
      displayName: 'Kofi Membre',
      visibility: 'members',
      country: 'SN',
      themes: ['jeunesse'],
      languages: ['fr'],
    });
    await saveProfile(priv.as, {
      displayName: 'Kofi Prive',
      visibility: 'private',
      country: 'SN',
      themes: ['jeunesse'],
      languages: ['fr'],
    });
    return { t, viewer };
  }

  it('un profil privé ne sort jamais, même cherché par son nom exact', async () => {
    const { viewer } = await seed();
    const all = await viewer.as.query(api.social.profiles.search, {});
    const names = all.items.map((i) => i.displayName).sort();
    expect(names).toEqual(['Kofi Membre', 'Kofi Mensah']);
    const exact = await viewer.as.query(api.social.profiles.search, {
      q: 'Kofi Prive',
    });
    expect(exact.items.map((i) => i.displayName)).not.toContain('Kofi Prive');
    const bySn = await viewer.as.query(api.social.profiles.search, {
      country: 'SN',
      theme: 'jeunesse',
    });
    expect(bySn.items.map((i) => i.displayName)).toEqual(['Kofi Membre']);
  });

  it('filtres thème, langue, pays et recherche plein texte', async () => {
    const { viewer } = await seed();
    const en = await viewer.as.query(api.social.profiles.search, {
      language: 'en',
    });
    expect(en.items.map((i) => i.handle)).toEqual(['kofi-mensah']);
    const gh = await viewer.as.query(api.social.profiles.search, {
      country: 'gh',
    });
    expect(gh.items.map((i) => i.displayName)).toEqual(['Kofi Mensah']);
    const q = await viewer.as.query(api.social.profiles.search, {
      q: 'mensah',
    });
    expect(q.items.map((i) => i.displayName)).toEqual(['Kofi Mensah']);
  });

  it('réservé aux membres : anonyme et visiteur reçoivent une liste vide', async () => {
    const { t } = await seed();
    const visiteur = await person(t, 'v@test.org', 'visiteur');
    expect((await t.query(api.social.profiles.search, {})).items).toEqual([]);
    expect(
      (await visiteur.as.query(api.social.profiles.search, {})).items,
    ).toEqual([]);
  });

  it('le sitemap ne liste que les profils publics', async () => {
    const { t } = await seed();
    const handles = await t.query(api.social.profiles.listPublicHandles, {});
    expect(handles.map((h) => h.handle)).toEqual(['kofi-mensah']);
  });
});

describe('Profil — validation', () => {
  it('handle : réservé, invalide ou déjà pris sont refusés', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'a@test.org');
    const b = await person(t, 'b@test.org');
    await saveProfile(a.as, {
      displayName: 'Awa',
      visibility: 'members',
      handle: 'awa-d',
    });
    await expect(
      saveProfile(b.as, {
        displayName: 'Bob',
        visibility: 'members',
        handle: 'awa-d',
      }),
    ).rejects.toThrow(/HANDLE_TAKEN/);
    await expect(
      saveProfile(b.as, {
        displayName: 'Bob',
        visibility: 'members',
        handle: 'admin',
      }),
    ).rejects.toThrow(/INVALID_HANDLE/);
    await expect(
      saveProfile(b.as, {
        displayName: 'Bob',
        visibility: 'members',
        handle: 'A B',
      }),
    ).rejects.toThrow(/INVALID_HANDLE/);
  });

  it('un handle dérivé déjà pris reçoit un suffixe, et reste stable quand le nom change', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'a@test.org');
    const b = await person(t, 'b@test.org');
    await saveProfile(a.as, {
      displayName: 'Awa Diallo',
      visibility: 'members',
    });
    const { handle } = await saveProfile(b.as, {
      displayName: 'Awa Diallo',
      visibility: 'members',
    });
    expect(handle).toBe('awa-diallo-2');
    const again = await saveProfile(b.as, {
      displayName: 'Awa D. Diallo',
      visibility: 'members',
    });
    expect(again.handle).toBe('awa-diallo-2');
  });

  it('liens : https uniquement, sans identifiants embarqués', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'a@test.org');
    for (const url of [
      'http://exemple.org',
      'javascript:alert(1)',
      'data:text/html;base64,AAAA',
      'https://user:pass@exemple.org',
    ]) {
      await expect(
        saveProfile(a.as, {
          displayName: 'Awa',
          visibility: 'members',
          links: [{ kind: 'website', url }],
        }),
      ).rejects.toThrow(/INVALID_LINK/);
    }
    await saveProfile(a.as, {
      displayName: 'Awa',
      visibility: 'members',
      links: [{ kind: 'website', url: 'https://exemple.org/awa' }],
    });
  });

  it('bornes : biographie trop longue, thème ou langue hors vocabulaire', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'a@test.org');
    await expect(
      saveProfile(a.as, {
        displayName: 'Awa',
        visibility: 'members',
        bio: 'x'.repeat(1001),
      }),
    ).rejects.toThrow(/INVALID_BIO/);
    await expect(
      saveProfile(a.as, {
        displayName: 'Awa',
        visibility: 'members',
        themes: ['astrologie'],
      }),
    ).rejects.toThrow(/INVALID_THEMES/);
    await expect(
      saveProfile(a.as, {
        displayName: 'Awa',
        visibility: 'members',
        languages: ['klingon'],
      }),
    ).rejects.toThrow(/INVALID_LANGUAGES/);
    await expect(
      saveProfile(a.as, {
        displayName: 'Awa',
        visibility: 'members',
        mutedNotificationTypes: ['nimporte_quoi'],
      }),
    ).rejects.toThrow(/INVALID_PREFS/);
  });

  it('un anonyme ne peut pas enregistrer de profil', async () => {
    const t = convexTest(schema, modules);
    await expect(
      t.mutation(api.social.profiles.saveProfile, {
        ...BASE,
        displayName: 'Anonyme',
        visibility: 'public',
        messagePolicy: 'members',
      }),
    ).rejects.toThrow();
  });
});

describe('Photo — type et contenu réels', () => {
  const PNG = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48,
    0x44, 0x52,
  ]);

  async function withUpload(type: string, bytes: Uint8Array) {
    const t = convexTest(schema, modules);
    const a = await person(t, 'a@test.org');
    await saveProfile(a.as, {
      displayName: 'Awa Diallo',
      visibility: 'public',
    });
    const storageId = await t.run((ctx) =>
      ctx.storage.store(new Blob([bytes as BlobPart], { type })),
    );
    return { t, a, storageId };
  }

  it('accepte un vrai PNG déclaré image/png', async () => {
    const { t, a, storageId } = await withUpload('image/png', PNG);
    await a.as.action(api.social.profiles.setPhoto, { storageId });
    const mine = await a.as.query(api.social.profiles.getMine, {});
    expect(mine?.photoUrl).toBeTruthy();
    const pub = await t.query(api.social.profiles.getByHandle, {
      handle: 'awa-diallo',
    });
    expect(pub?.photoUrl).toBeTruthy();
  });

  it('refuse un SVG déguisé en PNG — et l’efface du stockage', async () => {
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
    );
    const { t, a, storageId } = await withUpload('image/png', svg);
    await expect(
      a.as.action(api.social.profiles.setPhoto, { storageId }),
    ).rejects.toThrow(/INVALID_PHOTO/);
    expect(
      await t.run((ctx) => ctx.db.system.get('_storage', storageId)),
    ).toBeNull();
    expect(
      (await a.as.query(api.social.profiles.getMine, {}))?.photoUrl,
    ).toBeNull();
  });

  it('refuse un vrai PNG déclaré text/html (le stockage le servirait en HTML)', async () => {
    const { a, storageId } = await withUpload('text/html', PNG);
    await expect(
      a.as.action(api.social.profiles.setPhoto, { storageId }),
    ).rejects.toThrow(/INVALID_PHOTO/);
  });

  it('refuse un fichier trop lourd', async () => {
    const big = new Uint8Array(2 * 1024 * 1024 + 1);
    big.set(PNG);
    const { a, storageId } = await withUpload('image/png', big);
    await expect(
      a.as.action(api.social.profiles.setPhoto, { storageId }),
    ).rejects.toThrow(/INVALID_PHOTO/);
  });

  it('on ne rattache pas la photo d’autrui', async () => {
    const { t, a, storageId } = await withUpload('image/png', PNG);
    await a.as.action(api.social.profiles.setPhoto, { storageId });
    const b = await person(t, 'b@test.org');
    await saveProfile(b.as, { displayName: 'Bob', visibility: 'members' });
    await expect(
      b.as.action(api.social.profiles.setPhoto, { storageId }),
    ).rejects.toThrow(/INVALID_PHOTO/);
  });

  it('pas d’URL de téléversement sans profil', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'a@test.org');
    await expect(
      a.as.mutation(api.social.profiles.generatePhotoUploadUrl, {}),
    ).rejects.toThrow(/PROFILE_REQUIRED/);
  });
});

describe('Préférences de notification', () => {
  it('un type coupé n’est plus créé (suivi), un type actif l’est', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'a@test.org');
    const b = await person(t, 'b@test.org');
    const c = await person(t, 'c@test.org');
    await saveProfile(a.as, {
      displayName: 'Awa',
      visibility: 'members',
      mutedNotificationTypes: ['social_follow'],
    });
    await saveProfile(b.as, { displayName: 'Bob', visibility: 'members' });
    await saveProfile(c.as, { displayName: 'Chloé', visibility: 'members' });

    await b.as.mutation(api.social.follows.follow, { userId: a.id });
    await a.as.mutation(api.social.follows.follow, { userId: c.id });

    const notifsOf = (id: Id<'users'>) =>
      t.run((ctx) =>
        ctx.db
          .query('notifications')
          .withIndex('by_user_and_read', (q) => q.eq('userId', id))
          .collect(),
      );
    expect(await notifsOf(a.id)).toHaveLength(0);
    const forC = await notifsOf(c.id);
    expect(forC).toHaveLength(1);
    expect(forC[0].type).toBe('social_follow');
  });

  it('branché sur les notifications EXISTANTES : un commentaire de Tribune coupé ne notifie plus', async () => {
    const t = convexTest(schema, modules);
    const a = await person(t, 'a@test.org');
    const b = await person(t, 'b@test.org');
    await saveProfile(a.as, {
      displayName: 'Awa',
      visibility: 'members',
      mutedNotificationTypes: ['tribune_comment'],
    });
    const postId = await a.as.mutation(api.tribune.createPost, {
      theme: 'transitions',
      format: 'court',
      lang: 'fr',
      title: 'Sur les transitions',
      body: 'Une contribution courte mais valable.',
    });
    await b.as.mutation(api.tribune.addComment, {
      postId,
      body: 'Un commentaire.',
    });
    const rows = await t.run((ctx) =>
      ctx.db
        .query('notifications')
        .withIndex('by_user_and_read', (q) => q.eq('userId', a.id))
        .collect(),
    );
    expect(rows).toHaveLength(0);
  });
});
