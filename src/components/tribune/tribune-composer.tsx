'use client';

import { useState, type FormEvent } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { PUB_THEMES } from '@/lib/publications';
import { isMember } from '@/lib/roles';
import { Button } from '@/components/ui/button';
import {
  FormError,
  SelectField,
  TextField,
  TextareaField,
} from '@/components/ui/field';
import { Link, useRouter } from '@/i18n/navigation';

// Prise de parole (F-44) — îlot client. Visible aux membres ; les autres voient
// une invitation à adhérer. Après publication, on rafraîchit le fil (server).
export function TribuneComposer() {
  const t = useTranslations('tribune');
  const tl = useTranslations('library');
  const me = useQuery(api.users.current);
  const create = useMutation(api.tribune.createPost);
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [theme, setTheme] = useState<string>(PUB_THEMES[0]);
  const [format, setFormat] = useState<'court' | 'fond'>('court');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (me === undefined) return null;

  if (!isMember(me?.role)) {
    return (
      <div className="rounded-md border border-line bg-surface p-5">
        <p className="text-sm text-ink-soft">{t('membersOnly')}</p>
        <Link
          href="/adhesion"
          className="mt-3 inline-block text-sm font-semibold text-accent-text hover:underline"
        >
          {t('joinCta')} →
        </Link>
      </div>
    );
  }

  if (!open) {
    return <Button onClick={() => setOpen(true)}>{t('startCta')}</Button>;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (title.trim().length < 4) {
      setError(t('errTitle'));
      return;
    }
    if (body.trim().length < (format === 'court' ? 10 : 200)) {
      setError(t('errBody'));
      return;
    }
    setPending(true);
    try {
      await create({ theme, format, title: title.trim(), body: body.trim() });
      setTitle('');
      setBody('');
      setOpen(false);
      router.refresh();
    } catch {
      setError(t('errGeneric'));
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="space-y-4 rounded-md border border-line bg-surface p-5"
    >
      <h2 className="font-display text-lg">{t('composeTitle')}</h2>

      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label={t('fieldTheme')}
          id="tr-theme"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
        >
          {PUB_THEMES.map((s) => (
            <option key={s} value={s}>
              {tl(`themes.${s}`)}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('fieldFormat')}
          id="tr-format"
          value={format}
          onChange={(e) => setFormat(e.target.value as 'court' | 'fond')}
        >
          <option value="court">{t('format_court')}</option>
          <option value="fond">{t('format_fond')}</option>
        </SelectField>
      </div>

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
        required
      />

      <FormError>{error}</FormError>

      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>
          {t('publish')}
        </Button>
        <Button type="button" variant="outline" onClick={() => setOpen(false)}>
          {t('cancel')}
        </Button>
      </div>
    </form>
  );
}
