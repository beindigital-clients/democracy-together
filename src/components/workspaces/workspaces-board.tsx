'use client';

import { useState, type FormEvent } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { Reveal } from '@/components/motion/reveal';
import { Button } from '@/components/ui/button';
import {
  FormError,
  SelectField,
  TextField,
  TextareaField,
} from '@/components/ui/field';
import { isMember } from '@/lib/roles';
import { PUB_THEMES } from '@/lib/publications';
import { vocabulary } from '@/i18n/vocabulary';

// Formulaire de création d'espace (membre réseau). Réplique le motif du
// composer de la Tribune (champs Input/Textarea, select natif de thème).
function CreateForm() {
  const t = useTranslations('workspaces');
  const tl = useTranslations('library');
  const create = useMutation(api.workspaces.createWorkspace);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [theme, setTheme] = useState<string>(PUB_THEMES[0]);
  const [description, setDescription] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return <Button onClick={() => setOpen(true)}>{t('createCta')}</Button>;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (title.trim().length < 4) {
      setError(t('errTitle'));
      return;
    }
    if (description.trim().length < 10) {
      setError(t('errDescription'));
      return;
    }
    setPending(true);
    try {
      await create({
        title: title.trim(),
        theme,
        description: description.trim(),
      });
      setTitle('');
      setDescription('');
      setOpen(false);
    } catch {
      setError(t('errGeneric'));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      id="workspace-create"
      onSubmit={onSubmit}
      className="space-y-4 rounded-md border border-line bg-surface p-5"
    >
      <h2 className="font-display text-lg">{t('createTitle')}</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <TextField
          label={t('fieldTitle')}
          id="ws-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={160}
          required
        />
        <SelectField
          label={t('fieldTheme')}
          id="ws-theme"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
        >
          {PUB_THEMES.map((s) => (
            <option key={s} value={s}>
              {vocabulary(tl, 'themes.', s)}
            </option>
          ))}
        </SelectField>
      </div>

      <TextareaField
        label={t('fieldDescription')}
        hint={t('descriptionHint')}
        id="ws-description"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={4}
        required
      />

      <FormError>{error}</FormError>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {t('create')}
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}

// Tableau de bord des espaces (liste + création). Monté uniquement pour un
// membre réseau connecté (gating amont dans la page). Si le compte n'a pas le
// rôle « membre », on affiche un message dédié plutôt que la liste.
export function WorkspacesBoard() {
  const t = useTranslations('workspaces');
  const tl = useTranslations('library');
  const locale = useLocale();
  const me = useQuery(api.users.current);
  const items = useQuery(api.workspaces.listWorkspaces);

  const fmtDate = (ms: number) =>
    new Intl.DateTimeFormat(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(ms);

  return (
    <div className="mx-auto max-w-[960px] px-4 py-12 sm:px-6 md:py-16">
      <Reveal>
        <p className="font-mono text-xs uppercase tracking-[0.14em] text-muted">
          {t('eyebrow')}
        </p>
        <h1 className="mt-2 font-display text-[clamp(28px,4vw,44px)] font-medium leading-[1.05] tracking-[-0.015em]">
          {t('title')}
        </h1>
        <p className="mt-3 max-w-[62ch] text-[17px] leading-relaxed text-ink-soft">
          {t('lead')}
        </p>
      </Reveal>

      {me === undefined ? (
        <p className="mt-10 text-ink-soft">{t('loading')}</p>
      ) : !isMember(me?.role) ? (
        <section
          id="workspaces-members-only"
          className="mt-10 rounded-md border border-accent-edge bg-accent-tint p-6"
        >
          <h2 className="font-display text-xl text-ink">
            {t('membersOnlyTitle')}
          </h2>
          <p className="mt-2 max-w-[60ch] text-sm leading-relaxed text-ink-soft">
            {t('membersOnlyBody')}
          </p>
          <Button asChild className="mt-4">
            <Link href="/adhesion">{t('membersOnlyCta')}</Link>
          </Button>
        </section>
      ) : (
        <>
          <div className="mt-8">
            <CreateForm />
          </div>

          {items === undefined ? (
            <p className="mt-8 text-ink-soft">{t('loading')}</p>
          ) : items.length === 0 ? (
            <div className="mt-8 rounded-md border border-dashed border-line-strong bg-surface p-8 text-center text-ink-soft">
              {t('empty')}
            </div>
          ) : (
            <ul className="mt-8 grid gap-4 sm:grid-cols-2">
              {items.map((w) => (
                <li key={w._id}>
                  <Link
                    href={`/espaces/${w._id}`}
                    className="flex h-full flex-col rounded-md border border-line bg-surface p-5 transition-colors hover:border-line-strong"
                  >
                    <div className="flex flex-wrap items-center gap-2 text-[12px]">
                      <span className="rounded-pill border border-accent-edge bg-accent-tint px-2.5 py-0.5 font-medium text-accent-text">
                        {vocabulary(tl, 'themes.', w.theme)}
                      </span>
                      {w.mine ? (
                        <span className="rounded-pill border border-line-strong bg-surface-2 px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.06em] text-muted">
                          {t('mineBadge')}
                        </span>
                      ) : null}
                    </div>
                    <h3 className="mt-3 font-display text-lg leading-snug text-ink">
                      {w.title}
                    </h3>
                    <p className="mt-2 line-clamp-3 flex-1 text-sm leading-relaxed text-ink-soft">
                      {w.description}
                    </p>
                    <div className="mt-4 flex items-center justify-between font-mono text-[11px] text-muted">
                      <span>{t('memberCount', { count: w.memberCount })}</span>
                      <span>{fmtDate(w.createdAt)}</span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
