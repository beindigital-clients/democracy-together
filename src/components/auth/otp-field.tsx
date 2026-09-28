'use client';

import type { ReactNode, Ref } from 'react';
import { useTranslations } from 'next-intl';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';
import { Field } from '@/components/ui/field';

// Entry of the 6-digit code (shadcn InputOTP component), controlled. A
// special control — six boxes for a single field — hence rendered through
// the shared system's `Field` shell, which gives it its label and ARIA
// association.
//
// `name` and `ref` pass through to the actual input: that is what lets
// `useFormFields` hold the value and move focus here when the code
// is the invalid field.
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
