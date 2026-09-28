'use client';

import {
  useCallback,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type ComponentProps,
  type ReactNode,
} from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

// FORM FIELD SYSTEM — a single one, for the whole site (issue #41).
//
// Two families coexisted: the `Field`/`PasswordField`/`OtpField` components
// in `components/auth/`, and the manual `<label htmlFor>` + `<Input>` assembly
// copied into some fifteen forms. It wasn't just a matter of
// appearance: a correct field carries FOUR things — the label, the help text,
// the error, and the ARIA wiring that links all three to the control. With two
// families, each of these four things has to be fixed twice.
//
// `Field` is the shell: it generates the identifier, associates the label
// (`htmlFor`/`id`), and describes the control with the help text and the error
// (`aria-describedby`), marking it invalid (`aria-invalid`) as soon as an
// error is passed. The common fields (`TextField`, `TextareaField`,
// `SelectField`) are simple wrappers; special controls (password,
// one-time code, file) go through the shell itself,
// which hands them this wiring.
//
// The ARIA and controlled-value slots provided here are now
// filled, in a single place, by `useFormFields` (bottom of the file): per-field
// errors (#12, #37) and input kept after a server rejection (#37).
//
// The fields' props are those of their tag (`ComponentProps<'input'>` and
// the like) rather than just the HTML attributes: that is what lets
// `ref` through, which `useFormFields` needs to move focus to the first
// faulty field.

// What the shell hands to the control: what it needs to be named and described.
export type FieldControlProps = {
  id: string;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
};

export type FieldShellProps = {
  label: ReactNode;
  // Label reserved for assistive technologies (a field whose role is
  // visually obvious: comment box, email reminder…). The
  // label always exists — it is not replaced by a `placeholder`.
  labelHidden?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  // Block layout (e.g. `sm:col-span-2`); the control itself receives
  // `controlClassName`.
  className?: string;
  controlClassName?: string;
};

function useFieldWiring(
  id: string | undefined,
  hint: ReactNode,
  error: ReactNode,
) {
  const generatedId = useId();
  const controlId = id ?? generatedId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  // Absent keys stay absent: an `aria-invalid: undefined` would overwrite
  // one the caller may have set itself (the spread comes after).
  const control: FieldControlProps = { id: controlId };
  if (error) control['aria-invalid'] = true;
  if (describedBy) control['aria-describedby'] = describedBy;

  return { controlId, hintId, errorId, control };
}

// Field shell: label, help text, error and ARIA wiring. The control
// is rendered by the caller, which receives as an argument what it must respond to.
export function Field({
  label,
  labelHidden,
  hint,
  error,
  className,
  id,
  children,
}: FieldShellProps & {
  id?: string;
  children: (control: FieldControlProps) => ReactNode;
}) {
  const { controlId, hintId, errorId, control } = useFieldWiring(
    id,
    hint,
    error,
  );

  return (
    <div className={className}>
      <label
        htmlFor={controlId}
        className={labelHidden ? 'sr-only' : 'block text-sm text-ink-soft'}
      >
        {label}
      </label>
      <div className={labelHidden ? undefined : 'mt-1'}>
        {children(control)}
      </div>
      {hint ? (
        <p id={hintId} className="mt-1 text-xs text-muted">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="mt-1 text-sm text-bar-5">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function TextField({
  label,
  labelHidden,
  hint,
  error,
  className,
  controlClassName,
  ...props
}: FieldShellProps & ComponentProps<'input'>) {
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
        <Input {...props} {...control} className={controlClassName} />
      )}
    </Field>
  );
}

export function TextareaField({
  label,
  labelHidden,
  hint,
  error,
  className,
  controlClassName,
  ...props
}: FieldShellProps & ComponentProps<'textarea'>) {
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
        <Textarea
          {...props}
          {...control}
          className={cn('resize-y', controlClassName)}
        />
      )}
    </Field>
  );
}

export function SelectField({
  label,
  labelHidden,
  hint,
  error,
  className,
  controlClassName,
  children,
  ...props
}: FieldShellProps & ComponentProps<'select'>) {
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
        // `py-2.5`: same height as `Input`, so that the fields of a single
        // grid line up.
        <Select
          {...props}
          {...control}
          className={cn('w-full py-2.5', controlClassName)}
        >
          {children}
        </Select>
      )}
    </Field>
  );
}

// Error concerning the entire FORM (send failure, global validation),
// as opposed to a field's `error` prop. `role="alert"`: the message is
// announced as soon as it appears, without moving focus.
export function FormError({
  children,
  className,
}: {
  children?: ReactNode;
  className?: string;
}) {
  if (!children) return null;
  return (
    <p role="alert" className={cn('text-sm text-bar-5', className)}>
      {children}
    </p>
  );
}

// ---------------------------------------------------------------------------
// INPUT STATE — preserved values, per-field errors (issue #37)
//
// Two gaps went together. An invalid submission showed ONE message at the bottom
// of the form for three possible causes: up to the person to guess which
// of the six fields is the problem. And the values, read via `FormData` at
// send time, were attached to nothing: nothing guaranteed they would survive
// a server rejection — and losing a motivation statement after a rate limit, on
// an unstable connection, means losing several minutes of writing.
//
// `useFormFields` handles both: the values live in state (so they no longer
// depend on the DOM), and each message goes to the field that caused it, via
// the shell's `error` prop — hence with `aria-invalid` and
// `aria-describedby` (#12), without this wiring being rewritten anywhere.

// Validation rule for a field: the message to display, or `null` if the
// value is fine.
export type FieldRule = (value: string) => string | null;

type ControlChangeEvent = ChangeEvent<
  HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
>;

export function useFormFields<K extends string>(initial: Record<K, string>) {
  const [values, setValues] = useState<Record<K, string>>(initial);
  const [errors, setErrors] = useState<Partial<Record<K, string>>>({});
  // The initial values, frozen on first render: `reset` returns to them without
  // forcing the caller to memoize them.
  const initialValues = useRef(initial);
  // The rendered controls, to move focus to the first faulty field.
  const controls = useRef(new Map<K, HTMLElement>());

  // Stable identity (both state setters are): an effect that
  // pre-fills a field can depend on it without re-running on every render.
  const setValue = useCallback((name: K, value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
    // The message clears as soon as the field is edited again: keeping it during
    // correction means blaming input that has already been fixed. Full
    // validation is replayed on submit — not on every keystroke.
    setErrors((current) => {
      if (current[name] === undefined) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }, []);

  // What a field receives: its value, its message, and what it needs to keep them up to date.
  // `onChange` accepts the event from native controls as well as the bare value
  // returned by composite controls (the one-time code): a single `field`
  // serves both, hence a single place where values and messages live.
  function field(name: K) {
    return {
      name,
      value: values[name],
      error: errors[name],
      onChange: (event: ControlChangeEvent | string) =>
        setValue(name, typeof event === 'string' ? event : event.target.value),
      ref: (element: HTMLElement | null) => {
        if (element) controls.current.set(name, element);
        else controls.current.delete(name);
      },
    };
  }

  // Applies the rules and keeps the messages. The rules are walked in
  // their declaration order — that of the fields on screen: the first faulty
  // field receives FOCUS, which reads out its label, its invalid state and
  // its message (which describes it) without anyone having to search.
  function validate(rules: Partial<Record<K, FieldRule>>): boolean {
    const found: Partial<Record<K, string>> = {};
    let first: K | undefined;
    for (const name of Object.keys(rules) as K[]) {
      const message = rules[name]?.(values[name] ?? '');
      if (message !== null && message !== undefined) {
        found[name] = message;
        first ??= name;
      }
    }
    setErrors(found);
    if (first !== undefined) controls.current.get(first)?.focus();
    return first === undefined;
  }

  const reset = useCallback((next?: Partial<Record<K, string>>) => {
    setValues({ ...initialValues.current, ...next });
    setErrors({});
  }, []);

  // `errors` is not returned: a field's message is read via `field(name)`,
  // which already passes it to the shell. Two paths to the same data is
  // an opportunity for them to diverge.
  return { values, field, setValue, validate, reset };
}
