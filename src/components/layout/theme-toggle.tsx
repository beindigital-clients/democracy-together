'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';

// The theme (light/dark) is a purely visual preference with no SEO stakes:
// localStorage is legitimate here. It is applied before paint by the layout's
// inline script (anti-flash). This module only reads and changes it.
export type Theme = 'light' | 'dark';

/** Current theme and a way to change it. Shared by the toggle (mobile menu,
 *  footer) and by the header's "Langue et affichage" menu. */
export function useTheme(): [Theme, (next: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>('light');

  useEffect(() => {
    const current =
      document.documentElement.getAttribute('data-theme') === 'dark'
        ? 'dark'
        : 'light';
    setThemeState(current);
  }, []);

  function setTheme(next: Theme) {
    document.documentElement.setAttribute('data-theme', next);
    try {
      localStorage.setItem('dt-theme', next);
    } catch {
      /* storage unavailable: ignore */
    }
    setThemeState(next);
  }

  return [theme, setTheme];
}

export function ThemeToggle() {
  const t = useTranslations('nav');
  const [theme, setTheme] = useTheme();

  function toggle() {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }

  return (
    <Button
      type="button"
      variant="subtle"
      size="icon-md"
      onClick={toggle}
      aria-label={t('toggleTheme')}
      aria-pressed={theme === 'dark'}
    >
      {theme === 'dark' ? (
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="currentColor"
          aria-hidden="true"
          className="size-[18px]"
        >
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
        </svg>
      ) : (
        <svg
          viewBox="0 0 24 24"
          width="18"
          height="18"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
          className="size-[18px]"
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5 19 19M19 5l-1.5 1.5M6.5 17.5 5 19" />
        </svg>
      )}
    </Button>
  );
}
