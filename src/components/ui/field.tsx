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
// Les emplacements d'ARIA et de valeur contrôlée prévus ici sont désormais
// remplis, en un seul endroit, par `useFormFields` (bas de fichier) : erreurs
// par champ (#12, #37) et saisies conservées après un refus serveur (#37).
//
// Les props des champs sont celles de leur balise (`ComponentProps<'input'>` et
// consorts) plutôt que les seuls attributs HTML : c'est ce qui laisse passer
// `ref`, dont `useFormFields` a besoin pour porter le focus sur le premier
// champ fautif.

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

// ---------------------------------------------------------------------------
// ÉTAT DE SAISIE — valeurs conservées, erreurs par champ (issue #37)
//
// Deux manques allaient ensemble. Un envoi invalide affichait UN message en bas
// de formulaire pour trois causes possibles : à la personne de deviner lequel
// des six champs pose problème. Et les valeurs, lues par `FormData` au moment
// de l'envoi, n'étaient rattachées à rien : rien ne garantissait leur survie à
// un refus serveur — or perdre un texte de motivation après un rate-limit, sur
// une connexion instable, c'est perdre plusieurs minutes de rédaction.
//
// `useFormFields` tient les deux : les valeurs vivent dans l'état (elles ne
// dépendent donc plus du DOM), et chaque message va au champ qui l'a causé, via
// la prop `error` de la coquille — donc avec `aria-invalid` et
// `aria-describedby` (#12), sans que ce câblage soit réécrit nulle part.

// Règle de validation d'un champ : le message à afficher, ou `null` si la
// valeur convient.
export type FieldRule = (value: string) => string | null;

type ControlChangeEvent = ChangeEvent<
  HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
>;

export function useFormFields<K extends string>(initial: Record<K, string>) {
  const [values, setValues] = useState<Record<K, string>>(initial);
  const [errors, setErrors] = useState<Partial<Record<K, string>>>({});
  // Les valeurs de départ, figées au premier rendu : `reset` y revient sans
  // obliger l'appelant à les mémoïser.
  const initialValues = useRef(initial);
  // Les contrôles rendus, pour porter le focus sur le premier champ fautif.
  const controls = useRef(new Map<K, HTMLElement>());

  // Identité stable (les deux setters d'état le sont) : un effet qui
  // pré-remplit un champ peut en dépendre sans se relancer à chaque rendu.
  const setValue = useCallback((name: K, value: string) => {
    setValues((current) => ({ ...current, [name]: value }));
    // Le message s'efface dès que le champ est retouché : le maintenir pendant
    // la correction, c'est accuser une saisie déjà réparée. La validation
    // complète, elle, est rejouée à l'envoi — pas à chaque frappe.
    setErrors((current) => {
      if (current[name] === undefined) return current;
      const next = { ...current };
      delete next[name];
      return next;
    });
  }, []);

  // Ce qu'un champ reçoit : sa valeur, son message, et de quoi les tenir à jour.
  // `onChange` accepte l'événement des contrôles natifs comme la valeur nue que
  // rendent les contrôles composés (le code à usage unique) : un seul `field`
  // sert les deux, donc un seul endroit où les valeurs et les messages vivent.
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

  // Applique les règles et garde les messages. Les règles sont parcourues dans
  // leur ordre de déclaration — celui des champs à l'écran : le premier champ
  // fautif reçoit le FOCUS, ce qui fait lire son libellé, son état invalide et
  // son message (qui le décrit) sans que personne ait à chercher.
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

  // `errors` n'est pas rendu : le message d'un champ se lit par `field(nom)`,
  // qui le passe déjà à la coquille. Deux chemins vers la même donnée, c'est
  // l'occasion qu'ils divergent.
  return { values, field, setValue, validate, reset };
}
