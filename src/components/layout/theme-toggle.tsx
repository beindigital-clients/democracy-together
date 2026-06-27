'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';

// Le thème (clair/sombre) est une préférence purement visuelle, sans enjeu SEO :
// localStorage est ici légitime. Il est appliqué avant peinture par le script
// inline du layout (anti-flash). Ce composant ne fait que basculer.
export function ThemeToggle() {
  const t = useTranslations('nav');
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const current =
      document.documentElement.getAttribute('data-theme') === 'dark'
        ? 'dark'
        : 'light';
    setTheme(current);
  }, []);

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('dt-theme', next);
    } catch {
      /* stockage indisponible : on ignore */
    }
    setTheme(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={t('toggleTheme')}
      className="grid h-9 w-9 place-items-center rounded-sm text-ink-soft transition-colors hover:bg-surface-2 hover:text-ink"
    >
      {theme === 'dark' ? (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
        </svg>
      )}
    </button>
  );
}
