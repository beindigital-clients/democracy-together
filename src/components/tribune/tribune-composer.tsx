'use client';

import { useState, type FormEvent } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { api } from '@convex/_generated/api';
import { PUB_THEMES } from '@/lib/publications';
import { isMember } from '@/lib/roles';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Link } from '@/i18n/navigation';

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
        <div>
          <label htmlFor="tr-theme" className="block text-sm text-ink-soft">
            {t('fieldTheme')}
          </label>
          <select
            id="tr-theme"
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            className="mt-1 h-9 w-full rounded-md border border-line bg-paper px-3 text-sm text-ink"
          >
            {PUB_THEMES.map((s) => (
              <option key={s} value={s}>
                {tl(`themes.${s}`)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="tr-format" className="block text-sm text-ink-soft">
            {t('fieldFormat')}
          </label>
          <select
            id="tr-format"
            value={format}
            onChange={(e) => setFormat(e.target.value as 'court' | 'fond')}
            className="mt-1 h-9 w-full rounded-md border border-line bg-paper px-3 text-sm text-ink"
          >
            <option value="court">{t('format_court')}</option>
            <option value="fond">{t('format_fond')}</option>
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="tr-title" className="block text-sm text-ink-soft">
          {t('fieldTitle')}
        </label>
        <Input
          id="tr-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={160}
          required
          className="mt-1"
        />
      </div>
      <div>
        <label htmlFor="tr-body" className="block text-sm text-ink-soft">
          {t('fieldBody')}
        </label>
        <Textarea
          id="tr-body"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={format === 'fond' ? 10 : 5}
          required
          className="mt-1 resize-y"
        />
      </div>

      {error ? (
        <p role="alert" className="text-sm text-bar-5">
          {error}
        </p>
      ) : null}

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
