'use client';

import { useId, useState, type InputHTMLAttributes } from 'react';
import { useTranslations } from 'next-intl';

function EyeIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      aria-hidden="true"
    >
      <path d="M3 3l18 18" />
      <path d="M10.6 10.6a3 3 0 0 0 4.2 4.2" />
      <path d="M9.9 4.6A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a18.5 18.5 0 0 1-2.9 3.9M6.1 6.1A18.5 18.5 0 0 0 2 12s3.5 7 10 7a10.6 10.6 0 0 0 4.1-.8" />
    </svg>
  );
}

// Champ mot de passe avec bascule afficher/masquer (type contrôlé).
// Association label <-> input explicite (htmlFor/id) : robuste et accessible.
export function PasswordField({
  label,
  id,
  ...props
}: { label: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const t = useTranslations('auth');
  const [shown, setShown] = useState(false);
  const reactId = useId();
  const fieldId = id ?? reactId;

  return (
    <div>
      <label htmlFor={fieldId} className="block text-sm text-ink-soft">
        {label}
      </label>
      <div className="relative mt-1">
        <input
          id={fieldId}
          type={shown ? 'text' : 'password'}
          className="w-full rounded-sm border border-line bg-surface px-3 py-2.5 pr-11 text-ink outline-none transition-colors focus-visible:border-accent-text"
          {...props}
        />
        <button
          type="button"
          onClick={() => setShown((s) => !s)}
          aria-label={shown ? t('hidePassword') : t('showPassword')}
          aria-pressed={shown}
          className="absolute inset-y-0 right-0 grid w-11 place-items-center rounded-r-sm text-muted transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-[-2px]"
        >
          {shown ? <EyeOffIcon /> : <EyeIcon />}
        </button>
      </div>
    </div>
  );
}
