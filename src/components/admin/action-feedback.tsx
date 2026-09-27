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
import { useServerErrorMessage } from '@/components/admin/server-error';

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
//
// PLUSIEURS MESSAGES À LA FOIS (campagne du 27/09, C-5). Un seul message était
// retenu : une action rapide après une autre REMPLAÇAIT le précédent, et quand
// la seconde n'en produisait pas (« Rouvrir », m-5), l'ancien — « rejetée » —
// restait affiché pendant la réouverture, à lire à l'envers. Les messages
// s'empilent désormais dans leur région, chacun avec son propre délai. Une
// seule éviction : un ÉCHEC vide les succès encore affichés. L'alerte
// interrompt de toute façon la lecture, et laisser « … approuvée. » à côté de
// « Action non effectuée » ferait douter de laquelle des deux parle du geste
// qu'on vient de faire.
type Tone = 'success' | 'error';
type Notify = (message: string, tone?: Tone) => void;

const ActionFeedbackContext = createContext<Notify>(() => {});

export function useActionFeedback(): Notify {
  return useContext(ActionFeedbackContext);
}

// Le retour d'un REFUS serveur, traduit par son code (R-08) : à appeler dans
// le `catch` d'une mutation, à la place d'un `notify(t('feedbackError'))` qui
// accusait les droits quel que soit le motif.
export function useFailureFeedback(): (err: unknown) => void {
  const notify = useActionFeedback();
  const message = useServerErrorMessage();
  return useCallback(
    (err: unknown) => notify(message(err), 'error'),
    [notify, message],
  );
}

const DISMISS_MS = 6000;
// Au-delà, les plus anciens cèdent la place : une pile qui couvre l'écran
// n'informe plus.
const MAX_VISIBLE = 4;

type Item = { id: number; tone: Tone; message: string };

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
      <span className="wrap-anywhere leading-relaxed">{message}</span>
      {/* `p-1.5` autour d'une icône de 16 px : 28 px de cible, là où 20 px
          échappaient au doigt et se coupaient au bord droit (27/09, C-3). */}
      <button
        type="button"
        onClick={onDismiss}
        aria-label={dismissLabel}
        className="-me-2 -mt-1 ms-auto shrink-0 rounded-sm p-1.5 text-muted transition-colors hover:text-ink"
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
  );
}

export function ActionFeedbackProvider({ children }: { children: ReactNode }) {
  const t = useTranslations('admin');
  const [items, setItems] = useState<Item[]>([]);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const seq = useRef(0);

  const remove = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
    setItems((list) => list.filter((i) => i.id !== id));
  }, []);

  const notify = useCallback<Notify>(
    (message, tone = 'success') => {
      // Identifiant croissant, et non le texte : deux rejets successifs
      // portent le même message, et sans changement de nœud la région live
      // n'annoncerait que le premier.
      seq.current += 1;
      const id = seq.current;
      setItems((list) => {
        const kept =
          tone === 'error' ? list.filter((i) => i.tone === 'error') : list;
        const next = [...kept, { id, tone, message }];
        const evicted = next.slice(0, Math.max(0, next.length - MAX_VISIBLE));
        for (const e of evicted) {
          const timer = timers.current.get(e.id);
          if (timer) clearTimeout(timer);
          timers.current.delete(e.id);
        }
        return next.slice(-MAX_VISIBLE);
      });
      timers.current.set(
        id,
        setTimeout(() => remove(id), DISMISS_MS),
      );
    },
    [remove],
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const render = (tone: Tone) =>
    items
      .filter((i) => i.tone === tone)
      .map((i) => (
        <Toast
          key={i.id}
          tone={i.tone}
          message={i.message}
          dismissLabel={t('feedbackDismiss')}
          onDismiss={() => remove(i.id)}
        />
      ));

  return (
    <ActionFeedbackContext.Provider value={notify}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] flex flex-col items-center gap-2 px-4 pb-6">
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="flex flex-col items-center gap-2"
        >
          {render('success')}
        </div>
        <div
          role="alert"
          aria-atomic="true"
          className="flex flex-col items-center gap-2"
        >
          {render('error')}
        </div>
      </div>
    </ActionFeedbackContext.Provider>
  );
}
