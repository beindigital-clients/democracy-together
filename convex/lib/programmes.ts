// Chantier « programmes » (F-56 à F-60) — vocabulaire et RÈGLES PURES.
//
// Tout ce qui se décide sans base de données vit ici : le score d'appariement
// du mentorat, la fenêtre d'un appel à projets, la reconnaissance du contenu
// d'une pièce jointe, le classement des candidatures, le seuil d'inactivité
// d'un binôme. Les mutations les appellent ; `tests/unit/programmes-rules.test.ts`
// les exerce sans Convex. Module sans type serveur : l'interface l'importe par
// l'alias `@convex/lib/programmes` pour afficher les mêmes bornes que celles
// que le serveur applique.

import { v } from 'convex/values';
import { REGIONS } from './directory';
import { NETWORK_THEMES } from './themes';
import { SITE_LOCALES } from './locales';
import { isHttpUrl } from './validation';

// --- Vocabulaires fermés ----------------------------------------------------

export { REGIONS as PROGRAMME_REGIONS, NETWORK_THEMES as PROGRAMME_THEMES };
export const PROGRAMME_LANGUAGES = SITE_LOCALES;

// Programmes du hub Jeunes auxquels un profil candidate (F-58). Le mentorat
// n'y est pas : il a son propre parcours (profil mentoré, appariement).
export const YOUTH_PROGRAMMES = [
  'hub',
  'bourses',
  'tribunes',
  'campagnes',
] as const;
export type YouthProgramme = (typeof YOUTH_PROGRAMMES)[number];

export const AVAILABILITIES = [
  'ponctuelle',
  'mensuelle',
  'hebdomadaire',
] as const;
export type Availability = (typeof AVAILABILITIES)[number];

export const RESOURCE_KINDS = [
  'guide',
  'fiche',
  'modele',
  'video',
  'lien',
] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export const LEVELS = ['debutant', 'intermediaire', 'avance'] as const;
export type Level = (typeof LEVELS)[number];

export const youthProgrammeValidator = v.union(
  ...YOUTH_PROGRAMMES.map((x) => v.literal(x)),
);
export const availabilityValidator = v.union(
  ...AVAILABILITIES.map((x) => v.literal(x)),
);
export const resourceKindValidator = v.union(
  ...RESOURCE_KINDS.map((x) => v.literal(x)),
);
export const levelValidator = v.union(...LEVELS.map((x) => v.literal(x)));
export const regionValidator = v.union(...REGIONS.map((x) => v.literal(x)));
export const programmeThemeValidator = v.union(
  ...NETWORK_THEMES.map((x) => v.literal(x)),
);

export const mentorRoleValidator = v.union(
  v.literal('mentor'),
  v.literal('mentore'),
);
export type MentorRole = 'mentor' | 'mentore';

export const pairStatusValidator = v.union(
  // Proposé par le coordinateur, en attente de l'accord des DEUX parties.
  v.literal('proposed'),
  v.literal('active'),
  v.literal('paused'),
  v.literal('ended'),
  // Une des parties a refusé la proposition : le binôme n'a jamais existé.
  v.literal('declined'),
);
export type PairStatus =
  'proposed' | 'active' | 'paused' | 'ended' | 'declined';

export const youthApplicationStatusValidator = v.union(
  v.literal('pending'),
  v.literal('approved'),
  v.literal('rejected'),
  v.literal('withdrawn'),
);

export const callApplicationStatusValidator = v.union(
  v.literal('draft'),
  v.literal('submitted'),
  v.literal('selected'),
  v.literal('waitlisted'),
  v.literal('rejected'),
  v.literal('withdrawn'),
);
export type CallApplicationStatus =
  'draft' | 'submitted' | 'selected' | 'waitlisted' | 'rejected' | 'withdrawn';

export const callDecisionValidator = v.union(
  v.literal('selected'),
  v.literal('waitlisted'),
  v.literal('rejected'),
);
export type CallDecision = 'selected' | 'waitlisted' | 'rejected';

// --- Bornes des champs --------------------------------------------------------
// Partagées avec les formulaires (même import) : compteur, `maxLength` et refus
// serveur lisent les mêmes nombres.
export const PROGRAMME_LIMITS = {
  shortText: 160,
  text: 4000,
  background: 2000,
  goals: 2000,
  sessionNotes: 4000,
  review: 4000,
  maxThemes: NETWORK_THEMES.length,
  maxCriteria: 10,
  maxDocuments: 10,
  maxSteps: 40,
  // Une séance de plus de huit heures est une saisie erronée, pas une séance.
  maxSessionMinutes: 480,
  maxMentorCapacity: 5,
  maxScore: 5,
  maxFileBytes: 10 * 1024 * 1024,
} as const;

// Inactivité d'un binôme (F-59) : au-delà de ce délai sans séance journalisée,
// le coordinateur est alerté. Quatre semaines = un rendez-vous mensuel manqué,
// le rythme minimal que le programme promet (« un vrai suivi »).
export const INACTIVITY_WEEKS = 4;
export const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// --- Appariement (F-59) --------------------------------------------------------
//
// Le score est une SOMME DE RAISONS : chaque composante rend les points
// qu'elle apporte et ce qui les justifie, pour que le coordinateur lise
// pourquoi un mentor est proposé (« 2 thèmes communs, français en commun, même
// région, 1 binôme sur 2 ») au lieu d'un nombre opaque. Barème sur 100 :
//
//   thèmes communs      15 par thème, plafonné à 45
//   langue commune      25 (au moins une)
//   région / fuseau     15 même région, sinon 10 à ≤ 3 h d'écart, 5 à ≤ 6 h
//   charge du mentor    15 × place restante / capacité
//
// Un mentor à capacité pleine n'est PAS proposé : le proposer quand même
// reviendrait à demander au coordinateur de refaire le calcul à la main.
// Déterministe : aucun aléa, et l'égalité se départage par l'identifiant.

export type MatchProfile = {
  themes: readonly string[];
  languages: readonly string[];
  region: string;
  utcOffset?: number;
};

export type MatchReason =
  | { kind: 'themes'; points: number; values: string[] }
  | { kind: 'language'; points: number; values: string[] }
  | { kind: 'region'; points: number; values: string[] }
  | { kind: 'timezone'; points: number; hours: number }
  | { kind: 'load'; points: number; active: number; capacity: number };

export type MatchScore = {
  score: number;
  reasons: MatchReason[];
  eligible: boolean;
};

const intersect = (a: readonly string[], b: readonly string[]) =>
  [...new Set(a)].filter((x) => b.includes(x)).sort();

export function scoreMatch(
  mentee: MatchProfile,
  mentor: MatchProfile & { capacity: number; activePairs: number },
): MatchScore {
  const reasons: MatchReason[] = [];

  const themes = intersect(mentee.themes, mentor.themes);
  reasons.push({
    kind: 'themes',
    points: Math.min(45, themes.length * 15),
    values: themes,
  });

  const languages = intersect(mentee.languages, mentor.languages);
  reasons.push({
    kind: 'language',
    points: languages.length > 0 ? 25 : 0,
    values: languages,
  });

  if (mentee.region === mentor.region) {
    reasons.push({ kind: 'region', points: 15, values: [mentee.region] });
  } else if (
    typeof mentee.utcOffset === 'number' &&
    typeof mentor.utcOffset === 'number'
  ) {
    const hours = Math.abs(mentee.utcOffset - mentor.utcOffset);
    reasons.push({
      kind: 'timezone',
      points: hours <= 3 ? 10 : hours <= 6 ? 5 : 0,
      hours,
    });
  } else {
    reasons.push({ kind: 'region', points: 0, values: [] });
  }

  const capacity = Math.max(1, mentor.capacity);
  const free = Math.max(0, capacity - mentor.activePairs);
  reasons.push({
    kind: 'load',
    points: Math.round((15 * free) / capacity),
    active: mentor.activePairs,
    capacity,
  });

  return {
    score: reasons.reduce((sum, r) => sum + r.points, 0),
    reasons,
    eligible: free > 0,
  };
}

// Classe des candidats mentors. Égalité -> identifiant croissant : deux appels
// avec les mêmes données rendent le même ordre.
export function rankMatches<T extends { id: string; score: MatchScore }>(
  candidates: readonly T[],
  limit = 5,
): T[] {
  return candidates
    .filter((c) => c.score.eligible)
    .sort((a, b) =>
      b.score.score !== a.score.score
        ? b.score.score - a.score.score
        : a.id < b.id
          ? -1
          : a.id > b.id
            ? 1
            : 0,
    )
    .slice(0, limit);
}

// --- Inactivité d'un binôme ------------------------------------------------
// Référence = dernière séance, à défaut le début du binôme. Une alerte déjà
// émise dans la même fenêtre n'est pas répétée : le coordinateur est prévenu
// une fois par période d'inactivité, pas chaque nuit.
export function isPairInactive(
  pair: {
    status: PairStatus;
    startedAt?: number;
    lastSessionAt?: number;
    inactivityAlertAt?: number;
  },
  now: number,
  weeks = INACTIVITY_WEEKS,
): boolean {
  if (pair.status !== 'active') return false;
  const reference = pair.lastSessionAt ?? pair.startedAt;
  if (reference === undefined) return false;
  const threshold = weeks * WEEK_MS;
  if (now - reference < threshold) return false;
  if (
    pair.inactivityAlertAt !== undefined &&
    pair.inactivityAlertAt > reference
  ) {
    return now - pair.inactivityAlertAt >= threshold;
  }
  return true;
}

// --- Fenêtre d'un appel à projets (F-60) ----------------------------------
// Les bornes sont des instants UTC ; le fuseau de l'appel ne sert qu'à les
// AFFICHER. Ouverture incluse, clôture exclue : à 23:59:59 le dépôt passe, à
// l'instant de clôture il est refusé.
export type CallWindowState = 'upcoming' | 'open' | 'closed';

export function callWindowState(
  call: { opensAt: number; closesAt: number },
  now: number,
): CallWindowState {
  if (now < call.opensAt) return 'upcoming';
  if (now >= call.closesAt) return 'closed';
  return 'open';
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// --- Contenu d'une pièce jointe ---------------------------------------------
// On ne croit ni l'extension ni le type annoncé par le navigateur : on lit les
// premiers octets. Formats acceptés : PDF, PNG, JPEG, et les documents
// bureautiques ouverts ou Office (conteneur ZIP). Un exécutable renommé en
// `.pdf` est refusé ici, avant d'être référencé par une candidature.
export type SniffedType =
  'application/pdf' | 'image/png' | 'image/jpeg' | 'application/zip';

export function sniffFileType(bytes: Uint8Array): SniffedType | null {
  const starts = (sig: number[]) =>
    bytes.length >= sig.length && sig.every((b, i) => bytes[i] === b);
  if (starts([0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
    return 'image/png';
  if (starts([0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (starts([0x50, 0x4b, 0x03, 0x04])) return 'application/zip';
  return null;
}

// --- Évaluation et classement (F-60) ----------------------------------------
export type Criterion = { key: string; label: string; weight: number };

// Note pondérée d'UNE évaluation, sur 100. Un critère non noté invalide la
// grille : on ne classe pas sur une évaluation à moitié remplie.
export function weightedScore(
  criteria: readonly Criterion[],
  scores: readonly { criterionKey: string; score: number }[],
): number | null {
  let total = 0;
  let weights = 0;
  for (const c of criteria) {
    const s = scores.find((x) => x.criterionKey === c.key);
    if (!s) return null;
    total += s.score * c.weight;
    weights += c.weight;
  }
  if (weights === 0) return null;
  return Math.round((total / weights / PROGRAMME_LIMITS.maxScore) * 1000) / 10;
}

export type RankInput = {
  id: string;
  evaluations: { conflict: boolean; score: number | null }[];
};

// Classement : moyenne des évaluations RECEVABLES — un évaluateur en conflit
// d'intérêts déclaré est exclu, une grille incomplète aussi. Une candidature
// sans évaluation recevable est classée en dernier, sans note.
export function rankApplications(inputs: readonly RankInput[]) {
  return inputs
    .map((a) => {
      const valid = a.evaluations
        .filter((e) => !e.conflict && e.score !== null)
        .map((e) => e.score as number);
      const average =
        valid.length > 0
          ? Math.round((valid.reduce((s, x) => s + x, 0) / valid.length) * 10) /
            10
          : null;
      return {
        id: a.id,
        average,
        evaluations: valid.length,
        excluded: a.evaluations.filter((e) => e.conflict).length,
      };
    })
    .sort((a, b) => {
      if (a.average === null && b.average === null) return a.id < b.id ? -1 : 1;
      if (a.average === null) return 1;
      if (b.average === null) return -1;
      return b.average !== a.average
        ? b.average - a.average
        : a.id < b.id
          ? -1
          : 1;
    })
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

// Code d'attestation (F-57) : lisible, recopiable, dérivé de l'inscription.
// Pas un secret — il identifie l'attestation, il ne l'authentifie pas.
export function certificateCode(enrollmentId: string, completedAt: number) {
  let h = 2166136261;
  const input = `${enrollmentId}:${completedAt}`;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hex = (h >>> 0).toString(16).toUpperCase().padStart(8, '0');
  return `DT-${hex.slice(0, 4)}-${hex.slice(4)}`;
}

// Nettoyage des listes de vocabulaire reçues du client : dédoublonne, ne garde
// que les valeurs connues. Une valeur inconnue est une erreur de saisie, pas
// une donnée à stocker.
export function cleanVocabulary(
  values: readonly string[],
  allowed: readonly string[],
): string[] | null {
  const unique = [...new Set(values.map((x) => x.trim()))];
  if (unique.some((x) => !allowed.includes(x))) return null;
  return unique;
}

// Adresse d'une étape de parcours ou d'une ressource : absolue (http/https)
// ou chemin interne du site (`/replays/…`), sans schéma exotique ni `//hôte`.
export function isStepUrl(value: string): boolean {
  const s = value.trim();
  if (/^\/[A-Za-z0-9\-._~/%]*$/.test(s) && !s.startsWith('//')) return true;
  return isHttpUrl(s);
}

// --- Heure « murale » d'un fuseau <-> instant UTC ---------------------------
// Le back-office saisit l'ouverture et la clôture telles que l'appel les
// annonce (« 30 novembre, 18 h, heure de Dakar »). Ces deux fonctions font la
// conversion avec `Intl` seul, heure d'été comprise, sans dépendance.
function partsInZone(ms: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(ms);
  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? '0');
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  };
}

function offsetAt(ms: number, timeZone: string): number {
  const p = partsInZone(ms, timeZone);
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return asUtc - Math.floor(ms / 1000) * 1000;
}

// « 2026-11-30T18:00 » dans `timeZone` -> instant UTC (ms). `NaN` si illisible.
export function zonedInputToUtc(value: string, timeZone: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!m) return NaN;
  const wall = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
  let guess = wall - offsetAt(wall, timeZone);
  // Second passage : l'écart peut changer de part et d'autre d'un passage à
  // l'heure d'été.
  guess = wall - offsetAt(guess, timeZone);
  return guess;
}

// Instant UTC -> « 2026-11-30T18:00 » dans `timeZone` (valeur d'un champ
// `datetime-local`).
export function utcToZonedInput(ms: number, timeZone: string): string {
  const p = partsInZone(ms, timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`;
}

export const CALL_TIME_ZONES = [
  'Africa/Abidjan',
  'Africa/Dakar',
  'Africa/Lagos',
  'Africa/Casablanca',
  'Africa/Cairo',
  'Africa/Nairobi',
  'Africa/Johannesburg',
  'Europe/Brussels',
  'Europe/Paris',
  'Europe/Lisbon',
  'Europe/Madrid',
  'UTC',
] as const;
