'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useTranslations } from 'next-intl';
import { X } from 'lucide-react';

// RETOUR VISIBLE après une action de back-office (issue #38).
//
// Les écrans de modération n'affichaient RIEN après une décision : les
// gestionnaires avalaient l'erreur serveur en silence (« rôle insuffisant »,
// « décision déjà prise ») et le succès ne se devinait qu'au départ de la ligne
// de la file. Le modérateur restait dans le doute sur ce qui venait de se
// passer — et un refus silencieux se relit comme un clic non enregistré, donc
// se rejoue.
//
// Deux régions live STATIQUES, montées une fois pour tout le back-office : une
// polie (`role="status"`) pour les succès, une assertive (`role="alert"`) pour
// les échecs. Elles sont déclarées en permanence, vides ou non : une région
// live ajoutée au DOM en même temps que son texte n'est pas annoncée de façon
// fiable par les lecteurs d'écran.
type Tone = 'success' | 'error';
type Notify = (message: string, tone?: Tone) => void;

const ActionFeedbackContext = createContext<Notify>(() => {});

export function useActionFeedback(): Notify {
  return useContext(ActionFeedbackContext);
}

const DISMISS_MS = 6000;

function Toast({
  tone,
  message,
  dismissLabel,
  onDismiss,
}: {
  tone: Tone;
  message: string;
  dismissLabel: string;
  onDismiss: () => void;
}) {
  return (
    <div
      className={`pointer-events-auto flex max-w-[min(34rem,calc(100vw-2rem))] items-start gap-3 rounded-md border bg-surface px-4 py-3 text-sm shadow-pop ${
        tone === 'error'
          ? 'border-bar-5 text-bar-5'
          : 'border-line-strong text-ink'
      }`}
    >
      <span className="leading-relaxed">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={dismissLabel}
        className="-mr-1 ml-auto shrink-0 rounded-sm p-0.5 text-muted transition-colors hover:text-ink"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export function ActionFeedbackProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('admin');
  const [item, setItem] = useState<{
    id: number;
    tone: Tone;
    message: string;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const notify = useCallback<Notify>((message, tone = 'success') => {
    // Identifiant croissant, et non le texte : deux rejets successifs portent
    // le même message, et sans changement de nœud la région live n'annoncerait
    // que le premier.
    seq.current += 1;
    setItem({ id: seq.current, tone, message });
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setItem(null), DISMISS_MS);
  }, []);

  const dismiss = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setItem(null);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const toast =
    item === null ? null : (
      <Toast
        key={item.id}
        tone={item.tone}
        message={item.message}
        dismissLabel={t('feedbackDismiss')}
        onDismiss={dismiss}
      />
    );

  return (
    <ActionFeedbackContext.Provider value={notify}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center gap-2 px-4 pb-6">
        <div role="status" aria-live="polite" aria-atomic="true">
          {item?.tone === 'success' ? toast : null}
        </div>
        <div role="alert" aria-atomic="true">
          {item?.tone === 'error' ? toast : null}
        </div>
      </div>
    </ActionFeedbackContext.Provider>
  );
}
