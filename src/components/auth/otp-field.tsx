'use client';

import type { ReactNode, Ref } from 'react';
import { useTranslations } from 'next-intl';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { Field } from '@/components/ui/field';

// Saisie du code à 6 chiffres (composant shadcn InputOTP), contrôlée. Contrôle
// particulier — six cases pour un seul champ — donc rendu via la coquille
// `Field` du système commun, qui lui remet libellé et rattachement ARIA.
//
// `name` et `ref` traversent jusqu'à la saisie réelle : c'est ce qui permet à
// `useFormFields` de tenir la valeur et de porter le focus ici quand le code
// est le champ fautif.
export function OtpField({
  value,
  onChange,
  error,
  name,
  ref,
}: {
  value: string;
  onChange: (value: string) => void;
  error?: ReactNode;
  name?: string;
  ref?: Ref<HTMLInputElement>;
}) {
  const t = useTranslations('auth');
  return (
    <Field label={t('code')} error={error}>
      {(control) => (
        <InputOTP
          {...control}
          name={name}
          ref={ref}
          maxLength={6}
          value={value}
          onChange={onChange}
          autoFocus
        >
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <InputOTPSlot key={i} index={i} className="h-12 w-11" />
            ))}
          </InputOTPGroup>
        </InputOTP>
      )}
    </Field>
  );
}
