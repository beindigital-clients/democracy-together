'use client';

import { useState, type InputHTMLAttributes } from 'react';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Field, type FieldShellProps } from '@/components/ui/field';

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

// Champ mot de passe avec bascule afficher/masquer. Contrôle particulier (un
// bouton se superpose au champ), donc rendu via la coquille `Field` du système
// commun : libellé, aide, erreur et rattachement ARIA sont les mêmes qu'ailleurs.
export function PasswordField({
  label,
  labelHidden,
  hint,
  error,
  className,
  controlClassName,
  ...props
}: FieldShellProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const t = useTranslations('auth');
  const [shown, setShown] = useState(false);

  return (
    <Field
      label={label}
      labelHidden={labelHidden}
      hint={hint}
      error={error}
      className={className}
      id={props.id}
    >
      {(control) => (
        <div className="relative">
          <Input
            {...props}
            {...control}
            type={shown ? 'text' : 'password'}
            className={cn('pr-11', controlClassName)}
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
      )}
    </Field>
  );
}
