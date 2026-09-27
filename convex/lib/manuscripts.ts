import { v } from 'convex/values';

// REVUE À COMITÉ DE LECTURE (F-43) — la MACHINE À ÉTATS du manuscrit, ses
// bornes et le calcul du différentiel de métadonnées entre deux versions.
//
// Module PUR (il ne tire que `convex/values`) : la table des transitions est
// écrite UNE fois, ici, et toute mutation qui change l'étape d'un manuscrit
// passe par `nextStage`. `convex/lib/manuscripts.test.ts` parcourt TOUTES les
// paires (étape, événement) et vérifie que seules celles de la table passent.
//
// L'étape vit dans `publications.reviewStage` — le champ indexé que la file de
// l'éditeur lisait déjà. Absent = la publication n'est jamais entrée en revue.
//
//   (aucune) ─submit─► submitted ─startReview─► in_review
//   submitted ─reject─► rejected                       (refus sans relecture)
//   in_review ─requestRevision─► revision ─resubmit─► resubmitted
//   in_review ─accept─► accepted      in_review ─reject─► rejected
//   resubmitted ─startReview─► in_review   (nouveau tour, nouvelle version)
//   resubmitted ─accept─► accepted         (révision mineure, sans nouveau tour)
//   resubmitted ─reject─► rejected
//   accepted, rejected : décisions DÉFINITIVES — rien n'en sort.
//
// `reviewed` est l'étape HÉRITÉE de la première version du module (« avis
// rendu », sans décision d'acceptation) : les revues déjà closes ainsi
// peuvent être tranchées (accept / reject) ou repartir en évaluation, rien
// d'autre.
//
// Ajouter un relecteur à une revue DÉJÀ en évaluation n'est pas une
// transition : l'étape ne change pas (`canAddReviewer`).

export const MANUSCRIPT_STAGES = [
  'submitted',
  'in_review',
  'revision',
  'resubmitted',
  'accepted',
  'rejected',
  'reviewed',
] as const;
export type ManuscriptStage = (typeof MANUSCRIPT_STAGES)[number];
export type StageOrNone = ManuscriptStage | 'none';

export const manuscriptStage = v.union(
  v.literal('submitted'),
  v.literal('in_review'),
  v.literal('revision'),
  v.literal('resubmitted'),
  v.literal('accepted'),
  v.literal('rejected'),
  v.literal('reviewed'),
);

export const MANUSCRIPT_EVENTS = [
  'submit',
  'startReview',
  'requestRevision',
  'resubmit',
  'accept',
  'reject',
] as const;
export type ManuscriptEvent = (typeof MANUSCRIPT_EVENTS)[number];

export const MANUSCRIPT_MACHINE: Readonly<
  Record<
    StageOrNone,
    Readonly<Partial<Record<ManuscriptEvent, ManuscriptStage>>>
  >
> = {
  none: { submit: 'submitted' },
  submitted: { startReview: 'in_review', reject: 'rejected' },
  in_review: {
    requestRevision: 'revision',
    accept: 'accepted',
    reject: 'rejected',
  },
  revision: { resubmit: 'resubmitted' },
  resubmitted: {
    startReview: 'in_review',
    accept: 'accepted',
    reject: 'rejected',
  },
  reviewed: {
    startReview: 'in_review',
    accept: 'accepted',
    reject: 'rejected',
  },
  accepted: {},
  rejected: {},
};

/** Étapes tranchées : en repartir serait rejouer ou inverser une décision. */
export const DECIDED_STAGES: readonly StageOrNone[] = ['accepted', 'rejected'];

/**
 * L'étape d'arrivée, ou une erreur NOMMÉE :
 *  - ALREADY_REVIEWED   : le manuscrit est déjà accepté ou rejeté ;
 *  - INVALID_TRANSITION : l'étape de départ n'admet pas cet événement.
 * Le `throw` annule la transaction : une transition refusée n'écrit rien,
 * ni le document, ni l'audit, ni la notification.
 */
export function nextStage(
  from: StageOrNone,
  event: ManuscriptEvent,
): ManuscriptStage {
  const to = MANUSCRIPT_MACHINE[from][event];
  if (to) return to;
  throw new Error(
    DECIDED_STAGES.includes(from) ? 'ALREADY_REVIEWED' : 'INVALID_TRANSITION',
  );
}

export function canTransition(
  from: StageOrNone,
  event: ManuscriptEvent,
): boolean {
  return MANUSCRIPT_MACHINE[from][event] !== undefined;
}

/**
 * Désigner un relecteur : sur une revue en évaluation, c'est un ajout (pas de
 * transition) ; sur une revue qui ATTEND un tour d'évaluation, c'est
 * `startReview` ; sur une publication jamais entrée en revue, `submit` puis
 * `startReview` (la porte historique : ouvrir une revue depuis la file de
 * modération). Ailleurs, refus.
 */
export function stageAfterAssignment(from: StageOrNone): ManuscriptStage {
  if (from === 'in_review') return 'in_review';
  if (from === 'none')
    return nextStage(nextStage('none', 'submit'), 'startReview');
  return nextStage(from, 'startReview');
}

// Décisions éditoriales (motivées) et leur événement.
export const manuscriptDecision = v.union(
  v.literal('revision'),
  v.literal('accepted'),
  v.literal('rejected'),
);
export type ManuscriptDecision = 'revision' | 'accepted' | 'rejected';
export const DECISION_EVENT: Record<ManuscriptDecision, ManuscriptEvent> = {
  revision: 'requestRevision',
  accepted: 'accept',
  rejected: 'reject',
};

// Copie anonymisée du fichier d'une version :
//  - pending    : l'anonymisation est planifiée ;
//  - clean      : le fichier ne portait aucune métadonnée d'auteur ;
//  - stripped   : des métadonnées ont été retirées (cf. `strippedFields`) ;
//  - unreadable : le PDF n'a pas pu être relu (chiffré, corrompu) — AUCUN
//                 fichier n'est transmis aux relecteurs tant que l'éditeur ne
//                 l'a pas vérifié et libéré ;
//  - released   : l'éditeur a vérifié le fichier original et le libère ;
//  - none       : la version n'a pas de fichier.
export const blindStatus = v.union(
  v.literal('pending'),
  v.literal('clean'),
  v.literal('stripped'),
  v.literal('unreadable'),
  v.literal('released'),
  v.literal('none'),
);
export type BlindStatus =
  'pending' | 'clean' | 'stripped' | 'unreadable' | 'released' | 'none';

export const MANUSCRIPT_BOUNDS = {
  title: { min: 4, max: 200 },
  abstract: { min: 20, max: 4000 },
  keywords: { max: 8, each: 60 },
  responseLetter: { min: 20, max: 8000 },
  reason: { min: 20, max: 4000 },
  comment: { min: 10, max: 8000 },
  commentToEditor: { max: 4000 },
  conflictDetails: { max: 1000 },
  // Échéance d'une relecture : trois semaines par défaut, entre un jour et
  // quatre mois quand l'éditeur la fixe.
  dueDefaultDays: 21,
  dueMinDays: 1,
  dueMaxDays: 120,
} as const;

const DAY = 24 * 60 * 60 * 1000;

/** Échéance bornée : défaut si absente, refus si hors bornes. */
export function resolveDueAt(now: number, dueAt: number | undefined): number {
  const B = MANUSCRIPT_BOUNDS;
  if (dueAt === undefined) return now + B.dueDefaultDays * DAY;
  if (
    !Number.isFinite(dueAt) ||
    dueAt < now + B.dueMinDays * DAY - DAY / 2 ||
    dueAt > now + B.dueMaxDays * DAY
  ) {
    throw new Error('INVALID_DUE_DATE');
  }
  return dueAt;
}

// Relances : à l'échéance, puis tous les trois jours, trois fois au plus ;
// ensuite l'éditeur qui a désigné le relecteur est prévenu (une fois).
export const REMINDER = {
  intervalMs: 3 * DAY,
  max: 3,
  batch: 100,
} as const;

export type ManuscriptMeta = {
  title: string;
  abstract: string;
  keywords: string[];
  fileName?: string | null;
  hasFile: boolean;
};

export type MetadataDiff = {
  title: { from: string; to: string } | null;
  abstract: { from: string; to: string } | null;
  keywordsAdded: string[];
  keywordsRemoved: string[];
  fileReplaced: boolean;
};

/** Ce qui a changé entre deux versions — ce que le relecteur voit d'abord. */
export function metadataDiff(
  prev: ManuscriptMeta,
  next: ManuscriptMeta,
): MetadataDiff {
  const norm = (k: string) => k.trim().toLowerCase();
  const before = new Set(prev.keywords.map(norm));
  const after = new Set(next.keywords.map(norm));
  return {
    title:
      prev.title === next.title ? null : { from: prev.title, to: next.title },
    abstract:
      prev.abstract === next.abstract
        ? null
        : { from: prev.abstract, to: next.abstract },
    keywordsAdded: next.keywords.filter((k) => !before.has(norm(k))),
    keywordsRemoved: prev.keywords.filter((k) => !after.has(norm(k))),
    fileReplaced: next.hasFile,
  };
}

/** Mots-clés nettoyés : sans doublon, bornés en nombre et en longueur. */
export function normalizeKeywords(keywords: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of keywords) {
    const k = raw.trim().slice(0, MANUSCRIPT_BOUNDS.keywords.each);
    if (!k || seen.has(k.toLowerCase())) continue;
    seen.add(k.toLowerCase());
    out.push(k);
    if (out.length >= MANUSCRIPT_BOUNDS.keywords.max) break;
  }
  return out;
}

export function assertLength(
  text: string,
  bounds: { min?: number; max: number },
  code: string,
): string {
  const t = text.trim();
  if (t.length < (bounds.min ?? 0) || t.length > bounds.max) {
    throw new Error(code);
  }
  return t;
}
