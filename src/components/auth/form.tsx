import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';

// Wrapper for the authentication screens (centred card + submit button).
// The FIELDS themselves come from the shared `@/components/ui/field` system:
// these screens no longer have their own family of fields (issue #41).
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16 sm:px-6">
      <h1 className="font-display text-3xl">{title}</h1>
      {subtitle && <p className="mt-2 text-ink-soft">{subtitle}</p>}
      <div className="mt-8">{children}</div>
    </div>
  );
}

export function SubmitButton({
  pending,
  children,
}: {
  pending?: boolean;
  children: ReactNode;
}) {
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {children}
    </Button>
  );
}
