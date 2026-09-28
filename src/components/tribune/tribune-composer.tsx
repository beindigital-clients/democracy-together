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
import {
  FormError,
  SelectField,
  TextField,
  TextareaField,
} from '@/components/ui/field';
import { Link, useRouter } from '@/i18n/navigation';
import { vocabulary } from '@/i18n/vocabulary';
import { ArrowForward } from '@/components/ui/arrow';

// Format proposé à l'ouverture du composer — et celui auquel « Annuler »
// ramène (A-09).
const DEFAULT_FORMAT: TribuneFormat = 'court';

// Au-delà de cette longueur, « Annuler » demande confirmation avant d'effacer
// le brouillon : en deçà, il n'y a rien à regretter (A-09).
const DRAFT_CONFIRM_THRESHOLD = 50;

function errorCode(error: unknown): string | null {
  return error instanceof ConvexError && typeof error.data === 'string'
    ? error.data
    : null;
}

// Prise de parole (F-44) — îlot client. Visible aux membres ; les autres voient
// une invitation à adhérer. Après envoi, on rafraîchit le fil (server).
//
// Avec `parent`, le composer ouvre une CONTRIBUTION DE FOND qui prolonge un
// billet court (F-48) : format « Analyse » imposé, axe hérité du billet.
export function TribuneComposer({
  parent,
}: {
  parent?: { id: Id<'tribunePosts'>; title: string; theme: string };
} = {}) {
  const t = useTranslations('tribune');
  const tl = useTranslations('library');
  const uiLocale = resolveLocale(useLocale());
  const me = useQuery(api.users.current);
  // Règle du lieu, lue AVANT l'envoi : l'écran dit « soumis à validation »
  // ou « publié », selon le mode réglé par l'administrateur (F-45).
  const policy = useQuery(api.tribune.moderationPolicy);
  const create = useMutation(api.tribune.createPost);
  const router = useRouter();
  const initialFormat: TribuneFormat = parent ? 'fond' : DEFAULT_FORMAT;

  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<string>(parent?.theme ?? PUB_THEMES[0]);
  const [format, setFormat] = useState<TribuneFormat>(initialFormat);
  // Langue du billet (issue #35) : PRÉ-REMPLIE avec la langue de l'interface,
  // pas déduite d'elle. Un membre qui navigue en français peut écrire en
  // anglais, et lui seul le sait. C'est cette valeur qui décide plus tard du
  // canonical de la fiche — un billet n'existe que dans une langue.
  const [lang, setLang] = useState<Locale>(uiLocale);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  // Ce qu'il advient du billet, DIT à l'auteur (A-11) : en modération a
  // priori (défaut, F-45), il attend la validation d'un modérateur ; en a
  // posteriori, il est en ligne. Le message reste affiché après envoi.
  const [sent, setSent] = useState<'pending' | 'published' | null>(null);
  // Mode a posteriori seulement si le serveur le dit : en attendant la
  // réponse, l'écran annonce la règle la plus prudente.
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

  // « Annuler » refermait le composer SANS rien effacer : à la réouverture,
  // le titre, le corps, le format « Analyse » et même l'erreur précédente
  // réapparaissaient sans le dire, et une « Brève » saisie ensuite était
  // refusée « trop courte » pour un format que l'auteur n'avait pas vu
  // (mesuré le 27/09, A-09). Le formulaire revient à son état initial.
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
    // Le `maxLength` ne suffit pas : passer d'« Analyse » à « Brève » avec
    // 12 000 caractères déjà saisis ne tronque rien (F-46, A-05).
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
      // `noValidate` : la validation native bloquait l'envoi d'un texte plus
      // long que le `maxLength` du format courant SANS nos messages — c'est
      // exactement le cas d'un brouillon « Analyse » rebasculé en « Brève ».
      // Les contrôles vivent dans `onSubmit`, avec un message par cause.
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
            onChange={(e) => setTheme(e.target.value)}
          >
            {PUB_THEMES.map((s) => (
              <option key={s} value={s}>
                {vocabulary(tl, 'themes.', s)}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t('fieldFormat')}
            id="tr-format"
            value={format}
            hint={t('formatHint', {
              court: TRIBUNE_BODY.court.max,
              fond: TRIBUNE_BODY.fond.max,
            })}
            onChange={(e) => setFormat(e.target.value as TribuneFormat)}
          >
            <option value="court">{t('format_court')}</option>
            <option value="fond">{t('format_fond')}</option>
          </SelectField>
        </div>
      )}

      <SelectField
        label={t('fieldLang')}
        id="tr-lang"
        value={lang}
        hint={t('fieldLangHint')}
        onChange={(e) => setLang(resolveLocale(e.target.value))}
      >
        {routing.locales.map((l) => (
          <option key={l} value={l}>
            {vocabulary(tl, 'langs.', l)}
          </option>
        ))}
      </SelectField>

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
        // Même borne que `convex/tribune.ts#createPost`, PAR FORMAT : au-delà,
        // le dépôt échouait sans dire pourquoi (mesuré le 27/09 avec 21 000
        // caractères), et 12 000 passaient en « Brève » sans un mot (A-05).
        maxLength={bounds.max}
        // Compteur « n / max » sous le corps, rattaché au champ
        // (`aria-describedby`) ; à la limite, il dit pourquoi la saisie
        // s'arrête. `wrap-anywhere` : le compteur d'un nombre à cinq
        // chiffres ne doit pas déborder sur mobile.
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
