'use client';

import { useRef, useState, type ChangeEvent } from 'react';
import { useAction, useConvex, useMutation, useQuery } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { ACCEPTED_EXTENSIONS } from '@convex/lib/fileCheck';
import { WORKSPACE_FILE_LIMITS } from '@convex/lib/communaute';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ProgressBar } from '@/components/ui/progress-bar';
import { uploadWithProgress } from '@/lib/upload';
import { intlLocale } from '@/i18n/locale';
import { formatBytes, useWorkspaceError } from './workspace-errors';

const ACCEPT = ACCEPTED_EXTENSIONS.map((e) => `.${e}`).join(',');

// FICHIERS PARTAGÉS d'un espace (F-24). Monté pour les seuls membres de
// l'espace : le serveur refuse la liste à tout autre compte, et c'est lui qui
// décide — ce composant ne fait que ne pas demander ce qu'on lui refuserait.
//
// Le téléchargement ne passe pas par un lien posé dans la page : l'URL d'une
// version est demandée AU CLIC (`fileVersionUrl`), ce qui revérifie
// l'appartenance à ce moment-là.
export function WorkspaceFiles({
  workspaceId,
  canUpload,
  storageBytes,
  quotaBytes,
}: {
  workspaceId: Id<'workspaces'>;
  canUpload: boolean;
  storageBytes: number;
  quotaBytes: number;
}) {
  const t = useTranslations('workspaces');
  const locale = intlLocale(useLocale());
  const files = useQuery(api.workspaceFiles.listFiles, { workspaceId });
  const generateUploadUrl = useMutation(api.workspaceFiles.generateUploadUrl);
  const attach = useAction(api.workspaceFiles.attachFile);
  const remove = useMutation(api.workspaceFiles.deleteFile);
  const convex = useConvex();
  const errorMessage = useWorkspaceError();

  const input = useRef<HTMLInputElement>(null);
  // Fichier dont on dépose une NOUVELLE VERSION ; null = nouveau fichier.
  const [versionOf, setVersionOf] = useState<Id<'workspaceFiles'> | null>(null);
  const [progress, setProgress] = useState<number | null | undefined>(
    undefined,
  );
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    id: Id<'workspaceFiles'>;
    name: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);

  const fmtDate = (ms: number) =>
    new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(ms);

  function pick(fileId: Id<'workspaceFiles'> | null) {
    setVersionOf(fileId);
    setError(null);
    setStatus(null);
    input.current?.click();
  }

  async function onFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setStatus(null);
    // Contrôle de confort : le serveur refera le sien, sur les octets.
    if (file.size > WORKSPACE_FILE_LIMITS.maxFileBytes) {
      setError(
        t('errFileTooLarge', {
          max: formatBytes(WORKSPACE_FILE_LIMITS.maxFileBytes, locale),
        }),
      );
      return;
    }
    setProgress(0);
    try {
      const url = await generateUploadUrl({ workspaceId });
      const { storageId } = await uploadWithProgress<{
        storageId: Id<'_storage'>;
      }>({
        url,
        file,
        contentType: file.type || 'application/octet-stream',
        onProgress: (p) => setProgress(p.percent),
      });
      const res = await attach({
        workspaceId,
        storageId,
        name: file.name,
        ...(versionOf ? { fileId: versionOf } : {}),
      });
      setStatus(
        res.version > 1
          ? t('fileVersionAdded', { version: res.version })
          : t('fileAdded'),
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setProgress(undefined);
      setVersionOf(null);
    }
  }

  async function download(versionId: Id<'workspaceFileVersions'>) {
    setError(null);
    try {
      const url = await convex.query(api.workspaceFiles.fileVersionUrl, {
        versionId,
      });
      if (url) window.open(url, '_blank', 'noopener');
      else setError(t('errGeneric'));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function onDelete() {
    if (!confirmDelete) return;
    setBusy(true);
    try {
      await remove({ fileId: confirmDelete.id });
      setStatus(t('fileDeleted', { name: confirmDelete.name }));
      setConfirmDelete(null);
    } catch (err) {
      setError(errorMessage(err));
      setConfirmDelete(null);
    } finally {
      setBusy(false);
    }
  }

  const used = Math.min(100, Math.round((storageBytes / quotaBytes) * 100));

  return (
    <section
      aria-labelledby="ws-files-title"
      className="mt-12 border-t border-line pt-8"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 id="ws-files-title" className="font-display text-2xl">
          {t('filesTitle')}
        </h2>
        <p className="font-mono text-[11px] text-muted">
          {t('quotaUsage', {
            used: formatBytes(storageBytes, locale),
            quota: formatBytes(quotaBytes, locale),
            percent: used,
          })}
        </p>
      </div>
      <p className="mt-2 text-sm text-ink-soft">
        {t('filesHint', {
          types: ACCEPTED_EXTENSIONS.join(', '),
          max: formatBytes(WORKSPACE_FILE_LIMITS.maxFileBytes, locale),
        })}
      </p>

      {canUpload ? (
        <div className="mt-4">
          <input
            ref={input}
            type="file"
            accept={ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            onChange={onFile}
            data-testid="ws-file-input"
          />
          <Button
            type="button"
            className="min-h-11"
            disabled={progress !== undefined}
            onClick={() => pick(null)}
          >
            {t('fileUpload')}
          </Button>
        </div>
      ) : (
        <p className="mt-4 text-sm text-muted">{t('filesReadOnly')}</p>
      )}

      {progress !== undefined ? (
        <ProgressBar
          className="mt-4"
          label={t('fileUploading')}
          percent={progress}
          text={
            progress === null
              ? t('fileUploadingUnknown')
              : new Intl.NumberFormat(locale, { style: 'percent' }).format(
                  progress / 100,
                )
          }
        />
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-bar-5">
          {error}
        </p>
      ) : null}
      {status ? (
        <p role="status" className="mt-3 text-sm text-ink">
          {status}
        </p>
      ) : null}

      {files === undefined ? (
        <p className="mt-5 text-ink-soft">{t('loading')}</p>
      ) : files.length === 0 ? (
        <p className="mt-5 text-sm text-ink-soft">{t('noFiles')}</p>
      ) : (
        <ul className="mt-5 flex flex-col gap-3">
          {files.map((f) => {
            const latest = f.versions[0];
            return (
              <li
                key={f._id}
                className="rounded-md border border-line bg-surface p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="wrap-anywhere font-medium text-ink">
                      {f.name}
                    </p>
                    {latest ? (
                      <p className="mt-1 font-mono text-[11px] text-muted">
                        {t('fileMeta', {
                          version: latest.version,
                          author: latest.authorName,
                          date: fmtDate(latest.createdAt),
                          size: formatBytes(latest.size, locale),
                        })}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {latest ? (
                      <Button
                        type="button"
                        size="sm"
                        className="min-h-11"
                        onClick={() => download(latest._id)}
                        aria-label={t('fileDownloadNamed', { name: f.name })}
                      >
                        {t('fileDownload')}
                      </Button>
                    ) : null}
                    {canUpload ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="min-h-11"
                        disabled={progress !== undefined}
                        onClick={() => pick(f._id)}
                        aria-label={t('fileNewVersionNamed', { name: f.name })}
                      >
                        {t('fileNewVersion')}
                      </Button>
                    ) : null}
                    {f.canDelete ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="min-h-11"
                        onClick={() =>
                          setConfirmDelete({ id: f._id, name: f.name })
                        }
                        aria-label={t('fileDeleteNamed', { name: f.name })}
                      >
                        {t('fileDelete')}
                      </Button>
                    ) : null}
                  </div>
                </div>
                {f.versions.length > 1 ? (
                  <details className="mt-3">
                    <summary className="inline-flex min-h-11 cursor-pointer items-center text-sm text-accent-text">
                      {t('fileHistory', { count: f.versions.length })}
                    </summary>
                    <ol className="mt-2 flex flex-col gap-1">
                      {f.versions.map((ver) => (
                        <li
                          key={ver._id}
                          className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-ink-soft"
                        >
                          <span className="wrap-anywhere">
                            {t('fileMeta', {
                              version: ver.version,
                              author: ver.authorName,
                              date: fmtDate(ver.createdAt),
                              size: formatBytes(ver.size, locale),
                            })}
                          </span>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="min-h-11"
                            onClick={() => download(ver._id)}
                          >
                            {t('fileDownloadVersion', {
                              version: ver.version,
                            })}
                          </Button>
                        </li>
                      ))}
                    </ol>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        open={confirmDelete !== null}
        title={t('fileDeleteConfirmTitle', {
          name: confirmDelete?.name ?? '',
        })}
        description={t('fileDeleteConfirmBody')}
        confirmLabel={t('fileDelete')}
        cancelLabel={t('cancel')}
        destructive
        pending={busy}
        onConfirm={onDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </section>
  );
}
