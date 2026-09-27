'use client';

import { useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import type { FunctionReturnType } from 'convex/server';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { FormError } from '@/components/ui/field';
import { ProgressBar } from '@/components/ui/progress-bar';
import { vocabulary } from '@/i18n/vocabulary';
import { safeHref } from '@/lib/safe-href';
import { ResourceLink } from '@/components/toolbox/toolbox-catalog';
import { useProgrammeError } from '@/components/programmes/shared';

type Path = NonNullable<FunctionReturnType<typeof api.toolbox.getPath>>;

// Étapes d'un parcours (F-57), avec la progression de l'APPELANT : un
// visiteur voit les étapes, un compte connecté s'inscrit puis coche. La
// progression d'un autre membre n'est jamais demandée — la query ne prend
// aucun identifiant de personne.
export function PathSteps({ path }: { path: Path }) {
  const t = useTranslations('toolbox');
  const me = useQuery(api.users.current);
  const progress = useQuery(
    api.toolbox.myPathProgress,
    me ? { pathId: path._id } : 'skip',
  );
  const enroll = useMutation(api.toolbox.enroll);
  const setDone = useMutation(api.toolbox.setStepDone);
  const errorMessage = useProgrammeError();
  const [error, setError] = useState<string | null>(null);
  const enrolled = !!progress;
  const done = new Set(progress?.doneStepIds ?? []);
  // Case cochée AVANT la réponse du serveur (optimiste) : sans cela la case
  // ne bougeait qu'au retour de la mutation, et un clic semblait sans effet
  // (mesuré au rejeu E2E du 27/09). La valeur serveur reprend la main dès
  // qu'elle arrive ; un refus rétablit l'état et affiche l'erreur.
  const [pendingSteps, setPendingSteps] = useState<Record<string, boolean>>({});
  const isDone = (id: Id<'learningPathSteps'>) =>
    pendingSteps[id] ?? done.has(id);

  return (
    <div>
      <div className="rounded-md border border-line bg-surface p-5">
        {me === undefined || (me && progress === undefined) ? (
          <p className="text-ink-soft">{t('loading')}</p>
        ) : me === null ? (
          <p className="text-[15px] text-ink-soft">
            {t('signInToFollow')}{' '}
            <Link
              href="/connexion"
              className="font-medium text-accent-text hover:underline"
            >
              {t('signIn')}
            </Link>
          </p>
        ) : !enrolled ? (
          <Button
            className="min-h-11"
            onClick={async () => {
              setError(null);
              try {
                await enroll({ pathId: path._id });
              } catch (err) {
                setError(errorMessage(err));
              }
            }}
          >
            {t('enroll')}
          </Button>
        ) : (
          <div>
            <ProgressBar
              label={t('progressLabel')}
              percent={
                path.stepList.length
                  ? Math.round((done.size / path.stepList.length) * 100)
                  : 0
              }
              text={t('progress', {
                done: done.size,
                total: path.stepList.length,
              })}
            />
            {progress?.completedAt ? (
              <Button asChild className="mt-4 min-h-11">
                <Link
                  href={`/espace-membre/parcours/attestation/${progress.enrollmentId}`}
                >
                  {t('seeCertificate')}
                </Link>
              </Button>
            ) : null}
          </div>
        )}
        <FormError className="mt-2">{error}</FormError>
      </div>

      <ol className="mt-6 space-y-3">
        {path.stepList.map((s, i) => {
          const href = s.url?.startsWith('/')
            ? null
            : s.url
              ? safeHref(s.url)
              : null;
          return (
            <li
              key={s._id}
              className="rounded-md border border-line bg-surface p-4"
            >
              <div className="flex items-start gap-3">
                {enrolled ? null : (
                  <span
                    aria-hidden="true"
                    className="grid h-7 w-7 shrink-0 place-items-center rounded-pill bg-accent-tint font-mono text-sm text-accent-text"
                  >
                    {i + 1}
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  {enrolled ? (
                    // La case est DANS son libellé : toute la ligne est une
                    // cible de 44 px, et le titre de l'étape nomme la case.
                    <label className="flex min-h-11 cursor-pointer items-start gap-3 wrap-anywhere font-medium text-ink">
                      <input
                        type="checkbox"
                        className="mt-1 h-5 w-5 shrink-0 accent-accent"
                        checked={isDone(s._id)}
                        onChange={async (e) => {
                          const next = e.target.checked;
                          setError(null);
                          setPendingSteps((p) => ({ ...p, [s._id]: next }));
                          try {
                            await setDone({ stepId: s._id, done: next });
                          } catch (err) {
                            setError(errorMessage(err));
                          } finally {
                            setPendingSteps((p) => {
                              const rest = { ...p };
                              delete rest[s._id];
                              return rest;
                            });
                          }
                        }}
                      />
                      {t('stepTitle', { n: i + 1, title: s.title })}
                    </label>
                  ) : (
                    <h3 className="wrap-anywhere font-medium text-ink">
                      {t('stepTitle', { n: i + 1, title: s.title })}
                    </h3>
                  )}
                  {s.note ? (
                    <p className="mt-1 wrap-anywhere text-[14px] text-ink-soft">
                      {s.note}
                    </p>
                  ) : null}
                  {s.resource ? (
                    <p className="mt-1 text-[13px] text-muted">
                      {vocabulary(t, 'kind_', s.resource.kind)} ·{' '}
                      {s.resource.title}
                    </p>
                  ) : null}
                  <div className="mt-1">
                    {s.resource ? (
                      <ResourceLink resource={s.resource} />
                    ) : s.url?.startsWith('/') ? (
                      <Link
                        href={s.url}
                        className="inline-flex min-h-11 items-center text-sm font-medium text-accent-text hover:underline"
                      >
                        {t('open')}
                      </Link>
                    ) : href ? (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex min-h-11 items-center text-sm font-medium text-accent-text hover:underline"
                      >
                        {t('openExternal')}
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
