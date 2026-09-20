'use client';

import {
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

// SYSTÈME DE CHAMPS DE FORMULAIRE — un seul, pour tout le site (issue #41).
//
// Deux familles coexistaient : les composants `Field`/`PasswordField`/`OtpField`
// de `components/auth/`, et l'assemblage manuel `<label htmlFor>` + `<Input>`
// recopié dans une quinzaine de formulaires. Ce n'était pas qu'une question
// d'apparence : un champ correct porte QUATRE choses — le libellé, l'aide,
// l'erreur, et le rattachement ARIA qui relie les trois au contrôle. Avec deux
// familles, chacune de ces quatre choses doit être corrigée deux fois.
//
// `Field` est la coquille : elle génère l'identifiant, associe le libellé
// (`htmlFor`/`id`), et décrit le contrôle par l'aide et l'erreur
// (`aria-describedby`), en le marquant invalide (`aria-invalid`) dès qu'une
// erreur est passée. Les champs courants (`TextField`, `TextareaField`,
// `SelectField`) sont de simples habillages ; les contrôles particuliers (mot
// de passe, code à usage unique, fichier) passent par la coquille elle-même,
// qui leur remet ce rattachement.
//
// Les emplacements d'ARIA et de valeur contrôlée sont prévus ici et restent
// vides tant qu'aucun appelant ne les remplit : c'est ce qui permettra à #12
// (accessibilité) et #37 (UX des formulaires) de brancher les erreurs par
// champ et la conservation des saisies en UN SEUL endroit.

// Ce que la coquille remet au contrôle : de quoi être nommé et décrit.
export type FieldControlProps = {
  id: string;
  'aria-invalid'?: true;
  'aria-describedby'?: string;
};

export type FieldShellProps = {
  label: ReactNode;
  // Libellé réservé aux technologies d'assistance (champ dont le rôle est
  // évident visuellement : zone de commentaire, rappel par e-mail…). Le
  // libellé existe toujours — il n'est pas remplacé par un `placeholder`.
  labelHidden?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  // Mise en page du bloc (ex. `sm:col-span-2`) ; le contrôle, lui, reçoit
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

  // Les clés absentes le restent : un `aria-invalid: undefined` écraserait
  // celui que l'appelant aurait posé lui-même (l'étalement est fait après).
  const control: FieldControlProps = { id: controlId };
  if (error) control['aria-invalid'] = true;
  if (describedBy) control['aria-describedby'] = describedBy;

  return { controlId, hintId, errorId, control };
}

// Coquille de champ : libellé, aide, erreur et rattachement ARIA. Le contrôle
// est rendu par l'appelant, qui reçoit en argument ce à quoi il doit répondre.
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
}: FieldShellProps & InputHTMLAttributes<HTMLInputElement>) {
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
}: FieldShellProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
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
}: FieldShellProps & SelectHTMLAttributes<HTMLSelectElement>) {
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
        // `py-2.5` : même hauteur que `Input`, pour que les champs d'une même
        // grille s'alignent.
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

// Erreur portant sur le FORMULAIRE entier (échec d'envoi, validation globale),
// par opposition à la prop `error` d'un champ. `role="alert"` : le message est
// annoncé dès son apparition, sans déplacer le focus.
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
