'use client';

import { useState, type FormEvent } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { Link } from '@/i18n/navigation';
import { MemberPageHeader } from '@/components/member/page-header';
import { Button } from '@/components/ui/button';
import { FormError, TextField, TextareaField } from '@/components/ui/field';
import { SelectField } from '@/components/ui/choice-fields';
import { isMember } from '@/lib/roles';
import { PUB_THEMES } from '@/lib/publications';
import { vocabulary } from '@/i18n/vocabulary';
import { intlLocale } from '@/i18n/locale';
import { MyInvitations } from './workspace-invitations';
import { Badge } from '@/components/ui/badge';

// Workspace creation form (network member). Replicates the pattern of the
// Tribune composer (Input/Textarea fields, native theme select).
function CreateForm() {
  const t = useTranslations('workspaces');
  const tl = useTranslations('library');
  const create = useMutation(api.workspaces.createWorkspace);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [theme, setTheme] = useState<string>(PUB_THEMES[0]);
  const [description, setDescription] = useState('');
  // Open by default (increment 1 behaviour); private = by
  // invitation only.
  const [visibility, setVisibility] = useState<'open' | 'private'>('open');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return <Button onClick={() => setOpen(true)}>{t('createCta')}</Button>;
  }

  // "Annuler" CLEARS the draft. The component stays mounted when the
  // form is collapsed (it renders the open button): its state
  // survived, and the abandoned input reappeared on the next
  // opening — the same defect as the tribune composer (R-13).
  function cancel() {
    setTitle('');
    setTheme(PUB_THEMES[0]);
    setDescription('');
    setVisibility('open');
    setError(null);
    setOpen(false);
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
        visibility,
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
      // The rules live in `onSubmit`, translated; the browser's native
      // bubble ("Please fill out this field") spoke English on a
      // French screen (measured on 27/09).
      noValidate
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
          onValueChange={setTheme}
          options={PUB_THEMES.map((s) => ({
            value: s,
            label: vocabulary(tl, 'themes.', s),
          }))}
        />
      </div>

      <SelectField
        label={t('fieldVisibility')}
        id="ws-visibility"
        value={visibility}
        hint={t('visibilityHint')}
        onValueChange={(v) =>
          setVisibility(v === 'private' ? 'private' : 'open')
        }
        options={[
          { value: 'open', label: t('visibilityOpen') },
          { value: 'private', label: t('visibilityPrivate') },
        ]}
      />

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
        <Button type="button" variant="outline" onClick={cancel}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}

// Workspaces dashboard (list + creation). Mounted only for a signed-in
// network member (gating upstream in the page). If the account does not have the
// "membre" role, a dedicated message is shown rather than the list.
export function WorkspacesBoard() {
  const t = useTranslations('workspaces');
  const tl = useTranslations('library');
  const locale = useLocale();
  const me = useQuery(api.users.current);
  // `listWorkspaces` REFUSES an account without the "membre" role (server guard).
  // Called before the role was known, the query threw on the client and the
  // whole page fell on "Une erreur est survenue" — for a visitor
  // who had nothing else to see but the membership message below.
  // Measured (exploration of 27/09). So we wait for the role, and only request
  // the list for those who can read it.
  const items = useQuery(
    api.workspaces.listWorkspaces,
    me !== undefined && isMember(me?.role) ? {} : 'skip',
  );

  const fmtDate = (ms: number) =>
    new Intl.DateTimeFormat(intlLocale(locale), {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(ms);

  return (
    // Inside the member area's frame (`espaces/layout.tsx`), under the same
    // header as its other screens.
    <div>
      <MemberPageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        lead={t('lead')}
      />

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
          {/* Received invitations: this is where one enters a private
              workspace (F-24). */}
          <div className="mt-8">
            <MyInvitations />
          </div>
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
                      <Badge variant="accent">
                        {vocabulary(tl, 'themes.', w.theme)}
                      </Badge>
                      {w.visibility === 'private' ? (
                        <Badge size="label">{t('privateBadge')}</Badge>
                      ) : null}
                      {w.mine ? (
                        <Badge size="label">{t('mineBadge')}</Badge>
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
