'use client';

import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { FormError, TextareaField } from '@/components/ui/field';
import { SelectField } from '@/components/ui/choice-fields';

// A confirmation that asks for a reason (and, optionally, a code): returning a
// file, declaring it inadmissible, rejecting a reviewer. The title names the
// target, like every destructive confirmation of the back office (issue #38).
export function ReasonDialog({
  open,
  title,
  description,
  confirmLabel,
  minLength = 0,
  reasonLabel,
  reasonHint,
  codes,
  codeLabel,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  minLength?: number;
  reasonLabel: string;
  reasonHint?: string;
  codes?: { value: string; label: string }[];
  codeLabel?: string;
  pending: boolean;
  error: string;
  onConfirm: (reason: string, code: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('kohop');
  const [reason, setReason] = useState('');
  const [code, setCode] = useState(codes?.[0]?.value ?? '');
  const trimmed = reason.trim();
  const [tried, setTried] = useState(false);
  const tooShort = trimmed.length < minLength;

  return (
    <ConfirmDialog
      open={open}
      title={title}
      description={
        <div className="space-y-3 text-start">
          {description ? <p>{description}</p> : null}
          {codes ? (
            <SelectField
              label={codeLabel ?? ''}
              value={code}
              onValueChange={setCode}
              options={codes}
            />
          ) : null}
          <TextareaField
            label={reasonLabel}
            hint={reasonHint}
            rows={4}
            value={reason}
            error={tried && tooShort ? t('err_REASON_REQUIRED') : undefined}
            onChange={(e) => setReason(e.target.value)}
          />
          <FormError>{error}</FormError>
        </div>
      }
      confirmLabel={confirmLabel}
      cancelLabel={t('cancel')}
      pending={pending}
      onConfirm={() => {
        setTried(true);
        if (tooShort) return;
        onConfirm(trimmed, code);
      }}
      onCancel={() => {
        setReason('');
        setTried(false);
        onCancel();
      }}
    />
  );
}
