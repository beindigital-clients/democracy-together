'use client';

import { useState, type FormEvent } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { ConvexError } from 'convex/values';
import { useLocale, useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import type { Id } from '@convex/_generated/dataModel';
import { TRIBUNE_BODY, type TribuneFormat } from '@convex/lib/validation';
import { routing, type Locale } from '@/i18n/routing';
import { resolveLocale } from '@/i18n/locale';
import { PUB_THEMES } from '@/lib/publications';
import { isMember } from '@/lib/roles';
import { isRateLimited } from '@/lib/errors';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormError, TextField, TextareaField } from '@/components/ui/field';
import { SelectField } from '@/components/ui/choice-fields';
import { Link, useRouter } from '@/i18n/navigation';
import { vocabulary } from '@/i18n/vocabulary';
import { ArrowForward } from '@/components/ui/arrow';

// Format offered when the composer opens — and the one "Annuler"
// returns to (A-09).
const DEFAULT_FORMAT: TribuneFormat = 'court';

// Beyond this length, "Annuler" asks for confirmation before clearing
// the draft: below it, there is nothing to regret (A-09).
const DRAFT_CONFIRM_THRESHOLD = 50;

function errorCode(error: unknown): string | null {
  return error instanceof ConvexError && typeof error.data === 'string'
    ? error.data
    : null;
}

// Posting (F-44) — client island. Visible to members; others see
// an invitation to join. After sending, the feed is refreshed (server).
//
// With `parent`, the composer opens an IN-DEPTH CONTRIBUTION that extends a
// short post (F-48): "Analyse" format enforced, theme inherited from the post.
export function TribuneComposer({
  parent,
}: {
  parent?: { id: Id<'tribunePosts'>; title: string; theme: string };
} = {}) {
  const t = useTranslations('tribune');
  const tl = useTranslations('library');
  const uiLocale = resolveLocale(useLocale());
  const me = useQuery(api.users.current);
  // The venue's rule, read BEFORE sending: the screen says "soumis à validation"
  // or "publié", depending on the mode set by the administrator (F-45).
  const policy = useQuery(api.tribune.moderationPolicy);
  const create = useMutation(api.tribune.createPost);
  const router = useRouter();
  const initialFormat: TribuneFormat = parent ? 'fond' : DEFAULT_FORMAT;

  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<string>(parent?.theme ?? PUB_THEMES[0]);
  const [format, setFormat] = useState<TribuneFormat>(initialFormat);
  // Post language (issue #35): PRE-FILLED with the interface language,
  // not derived from it. A member browsing in French may write in
  // English, and only they know it. It is this value that later decides the
  // page's canonical — a post exists in only one language.
  const [lang, setLang] = useState<Locale>(uiLocale);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  // What happens to the post, TOLD to the author (A-11): under
  // pre-moderation (default, F-45), it awaits a moderator's approval; under
  // post-moderation, it is online. The message stays displayed after sending.
  const [sent, setSent] = useState<'pending' | 'published' | null>(null);
  // Post-moderation mode only if the server says so: while waiting for the
  // response, the screen announces the most cautious rule.
  const aPosteriori = policy?.postMode === 'a_posteriori';

  if (me === undefined) return null;

  if (!isMember(me?.role)) {
    return (
      <div className="rounded-md border border-line bg-surface p-5">
        <p className="text-sm text-ink-soft">{t('membersOnly')}</p>
        <Link
          href="/adhesion"
          className="mt-3 inline-block text-sm font-semibold text-accent-text hover:underline"
        >
          {t('joinCta')} <ArrowForward />
        </Link>
      </div>
    );
  }

  // "Annuler" closed the composer WITHOUT clearing anything: on reopening,
  // the title, the body, the "Analyse" format and even the previous error
  // reappeared without saying so, and a "Brève" typed afterwards was
  // rejected as "too short" for a format the author had not seen
  // (measured on 27/09, A-09). The form returns to its initial state.
  function reset() {
    setTitle('');
    setBody('');
    setTheme(parent?.theme ?? PUB_THEMES[0]);
    setFormat(initialFormat);
    setLang(uiLocale);
    setError(null);
  }

  function close() {
    reset();
    setConfirmCancel(false);
    setOpen(false);
  }

  function onCancel() {
    if (body.trim().length > DRAFT_CONFIRM_THRESHOLD) setConfirmCancel(true);
    else close();
  }

  if (!open) {
    return (
      <div className="space-y-3">
        {sent ? (
          <p
            role="status"
            className="rounded-md border border-accent-edge bg-accent-tint px-4 py-3 text-sm text-ink"
          >
            {sent === 'published' ? t('published') : t('submittedPending')}{' '}
            {sent === 'pending' ? (
              <Link
                href="/espace-membre/contributions"
                className="font-semibold text-accent-text hover:underline"
              >
                {t('followContributions')}
              </Link>
            ) : null}
          </p>
        ) : null}
        <Button
          className="min-h-11"
          onClick={() => {
            setSent(null);
            setOpen(true);
          }}
        >
          {parent ? t('deepenCta') : t('startCta')}
        </Button>
      </div>
    );
  }

  const bounds = TRIBUNE_BODY[format];
  const count = body.length;
  const limitReached = count >= bounds.max;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (title.trim().length < 4) {
      setError(t('errTitle'));
      return;
    }
    const text = body.trim();
    if (text.length < bounds.min) {
      setError(t('errBody'));
      return;
    }
    // `maxLength` is not enough: switching from "Analyse" to "Brève" with
    // 12,000 characters already typed truncates nothing (F-46, A-05).
    if (text.length > bounds.max) {
      setError(t('errBodyTooLong', { max: bounds.max }));
      return;
    }
    setPending(true);
    try {
      await create({
        theme,
        format,
        lang,
        title: title.trim(),
        body: text,
        ...(parent ? { parentPostId: parent.id } : {}),
      });
      reset();
      setOpen(false);
      setSent(aPosteriori ? 'published' : 'pending');
      router.refresh();
    } catch (err) {
      const code = errorCode(err);
      setError(
        isRateLimited(err)
          ? t('rateLimited')
          : code === 'BODY_TOO_LONG'
            ? t('errBodyTooLong', { max: bounds.max })
            : code === 'INVALID_BODY'
              ? t('errBody')
              : code === 'NOT_INVITED' || code === 'NOT_DEEPENABLE'
                ? t('errNotDeepenable')
                : t('errGeneric'),
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      // `noValidate`: native validation blocked sending a text
      // longer than the current format's `maxLength` WITHOUT our messages — which is
      // exactly the case of an "Analyse" draft switched back to "Brève".
      // The checks live in `onSubmit`, with one message per cause.
      noValidate
      className="space-y-4 rounded-md border border-line bg-surface p-5"
    >
      <h2 className="font-display text-lg">
        {parent
          ? t('deepenComposeTitle', { title: parent.title })
          : t('composeTitle')}
      </h2>
      <p className="text-[13px] text-ink-soft">
        {aPosteriori ? t('policyAPosteriori') : t('policyAPriori')}
      </p>

      {parent ? null : (
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label={t('fieldTheme')}
            id="tr-theme"
            value={theme}
            onValueChange={setTheme}
            options={PUB_THEMES.map((s) => ({
              value: s,
              label: vocabulary(tl, 'themes.', s),
            }))}
          />
          <SelectField
            label={t('fieldFormat')}
            id="tr-format"
            value={format}
            hint={t('formatHint', {
              court: TRIBUNE_BODY.court.max,
              fond: TRIBUNE_BODY.fond.max,
            })}
            onValueChange={(v) => setFormat(v as TribuneFormat)}
            options={[
              { value: 'court', label: t('format_court') },
              { value: 'fond', label: t('format_fond') },
            ]}
          />
        </div>
      )}

      <SelectField
        label={t('fieldLang')}
        id="tr-lang"
        value={lang}
        hint={t('fieldLangHint')}
        onValueChange={(v) => setLang(resolveLocale(v))}
        options={routing.locales.map((l) => ({
          value: l,
          label: vocabulary(tl, 'langs.', l),
        }))}
      />

      <TextField
        label={t('fieldTitle')}
        id="tr-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={160}
        required
      />
      <TextareaField
        label={t('fieldBody')}
        id="tr-body"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        rows={format === 'fond' ? 10 : 5}
        // Same limit as `convex/tribune.ts#createPost`, PER FORMAT: beyond it,
        // submission failed without saying why (measured on 27/09 with 21,000
        // characters), and 12,000 went through as "Brève" without a word (A-05).
        maxLength={bounds.max}
        // "n / max" counter below the body, attached to the field
        // (`aria-describedby`); at the limit, it says why input
        // stops. `wrap-anywhere`: the counter for a five-digit
        // number must not overflow on mobile.
        hint={
          <span className="wrap-anywhere" data-testid="tr-body-count">
            {limitReached
              ? t('bodyLimitReached', { max: bounds.max })
              : t('bodyCount', { count, max: bounds.max })}
          </span>
        }
        required
      />

      <FormError>{error}</FormError>

      <div className="flex gap-2">
        <Button type="submit" className="min-h-11" disabled={pending}>
          {aPosteriori ? t('publish') : t('submitForReview')}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="min-h-11"
          onClick={onCancel}
        >
          {t('cancel')}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmCancel}
        title={t('cancelConfirmTitle')}
        description={t('cancelConfirmBody')}
        confirmLabel={t('cancelConfirmYes')}
        cancelLabel={t('cancelConfirmNo')}
        destructive
        onConfirm={close}
        onCancel={() => setConfirmCancel(false)}
      />
    </form>
  );
}
