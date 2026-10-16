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
  second,
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
  // A second text (a retraction notice next to its reason).
  second?: { label: string; hint?: string; minLength: number };
  pending: boolean;
  error: string;
  onConfirm: (reason: string, code: string, second: string) => void;
  onCancel: () => void;
}) {
  const t = useTranslations('kohop');
  const [reason, setReason] = useState('');
  const [code, setCode] = useState(codes?.[0]?.value ?? '');
  const [secondText, setSecondText] = useState('');
  const trimmed = reason.trim();
  const secondTrimmed = secondText.trim();
  const [tried, setTried] = useState(false);
  const tooShort =
    trimmed.length < minLength ||
    (second !== undefined && secondTrimmed.length < second.minLength);

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
          {second ? (
            <TextareaField
              label={second.label}
              hint={second.hint}
              rows={3}
              value={secondText}
              error={
                tried && secondTrimmed.length < second.minLength
                  ? t('err_REASON_REQUIRED')
                  : undefined
              }
              onChange={(e) => setSecondText(e.target.value)}
            />
          ) : null}
          <FormError>{error}</FormError>
        </div>
      }
      confirmLabel={confirmLabel}
      cancelLabel={t('cancel')}
      pending={pending}
      onConfirm={() => {
        setTried(true);
        if (tooShort) return;
        onConfirm(trimmed, code, secondTrimmed);
      }}
      onCancel={() => {
        setReason('');
        setSecondText('');
        setTried(false);
        onCancel();
      }}
    />
  );
}
