'use client';

import { useTranslations } from 'next-intl';
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from '@/components/ui/input-otp';

// Saisie du code à 6 chiffres (composant shadcn InputOTP), contrôlée.
export function OtpField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const t = useTranslations('auth');
  return (
    <div>
      <span className="text-sm text-ink-soft">{t('code')}</span>
      <div className="mt-1">
        <InputOTP
          maxLength={6}
          value={value}
          onChange={onChange}
          aria-label={t('code')}
          autoFocus
        >
          <InputOTPGroup>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <InputOTPSlot key={i} index={i} className="h-12 w-11" />
            ))}
          </InputOTPGroup>
        </InputOTP>
      </div>
    </div>
  );
}
