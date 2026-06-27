import type { InputHTMLAttributes, ReactNode } from 'react';
import { Button } from '@/components/ui/button';

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

const inputCls =
  'mt-1 w-full rounded-sm border border-line bg-surface px-3 py-2.5 text-ink outline-none transition-colors focus-visible:border-accent-text';

export function Field({
  label,
  ...props
}: { label: string } & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="text-sm text-ink-soft">{label}</span>
      <input className={inputCls} {...props} />
    </label>
  );
}

export function FormError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="text-sm text-bar-5">
      {children}
    </p>
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
