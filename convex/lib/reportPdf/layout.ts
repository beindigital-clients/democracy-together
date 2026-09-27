// MISE EN LIGNE BIDIRECTIONNELLE du PDF des rapports annuels (F-41).
//
// Module PUR : il ne connaît ni pdfkit ni les polices, seulement une fonction
// de mesure. C'est ce qui le rend testable sans générer de PDF, et ce qui
// garde la décision « où va chaque mot » à un seul endroit.
//
// CE QUE FAIT LA BIBLIOTHÈQUE, ET CE QU'ELLE NE FAIT PAS. pdfkit délègue la
// composition d'un mot à fontkit, qui applique les tables OpenType de la
// police : c'est là que l'arabe prend ses formes contextuelles (initiale,
// médiane, finale) et ses ligatures (lam-alif). Un mot arabe passé seul à
// pdfkit sort donc correctement lié. Ce que ni l'une ni l'autre ne fait,
// c'est l'ORDRE des mots d'une ligne mixte : fontkit retourne la chaîne
// entière quand elle est de droite à gauche — chiffres et noms latins compris,
// « 2026 » devenant « 6202 » — et pdfkit, en découpant ses espaces, les
// replace au mauvais endroit (mesuré : « تقرير النشاط » sortait collé,
// l'espace rejeté en tête de ligne).
//
// D'où ce module : une version par MOTS de l'algorithme bidirectionnel
// Unicode (UAX #9), suffisante pour de la prose — chaque mot reçoit une
// direction forte (arabe → droite-à-gauche, latin ou chiffre →
// gauche-à-droite), les signes neutres prennent celle de leurs voisins quand
// ils l'encadrent et celle du paragraphe sinon, et une suite de mots de même
// direction forme une « course » posée d'un bloc. Les signes appariés
// (parenthèses, guillemets) d'une course droite-à-gauche sont mis en miroir
// (règle L4). Ce que ce découpage ne couvre pas — un mot mêlant les deux
// écritures SANS espace, les incrustations imbriquées — n'apparaît pas dans un
// rapport d'activité ; c'est écrit dans docs/backlog/editorial.md.

export type Direction = 'ltr' | 'rtl';

export type Token = {
  text: string;
  /** Direction résolue du mot. */
  dir: Direction;
  /** Un espace le sépare-t-il du mot LOGIQUEMENT précédent ? */
  spaceBefore: boolean;
};

// Écritures de droite à gauche servies par le site : l'arabe (blocs de base,
// supplément, étendu-A, formes de présentation A et B). L'hébreu n'est pas
// une langue du site, mais un nom propre hébreu dans un rapport arabe serait
// mal posé sans lui : il est compté.
const RTL_CHAR =
  /[\u0590-\u05FF\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB1D-\uFDFF\uFE70-\uFEFF]/u;
const STRONG_LTR = /[\p{L}\p{N}]/u;
// Tout ce qui n'est ni lettre ni chiffre : ponctuation, tirets, symboles.
const NEUTRAL = /[^\p{L}\p{N}]/u;

function strongDir(text: string): Direction | null {
  if (RTL_CHAR.test(text)) return 'rtl';
  if (STRONG_LTR.test(text)) return 'ltr';
  return null;
}

// Coupe un mot (sans espace) en [ponctuation de tête][cœur][ponctuation de
// queue]. « Together: » donne « Together » et « : », pour que le deux-points
// se place selon le texte qui l'entoure et non selon le mot latin qu'il
// suit. La ponctuation INTERNE (« CC-BY », « 2026-2027 », « l'Afrique »)
// reste dans le cœur.
function splitWord(word: string): string[] {
  const chars = [...word];
  let start = 0;
  let end = chars.length;
  while (start < end && NEUTRAL.test(chars[start])) start++;
  while (end > start && NEUTRAL.test(chars[end - 1])) end--;
  if (start === end) return [word];
  const out: string[] = [];
  if (start > 0) out.push(chars.slice(0, start).join(''));
  out.push(chars.slice(start, end).join(''));
  if (end < chars.length) out.push(chars.slice(end).join(''));
  return out;
}

// Paires en miroir (Unicode BidiMirroring, sous-ensemble utile en prose).
const MIRROR: Record<string, string> = {
  '(': ')',
  ')': '(',
  '[': ']',
  ']': '[',
  '{': '}',
  '}': '{',
  '<': '>',
  '>': '<',
  '«': '»',
  '»': '«',
  '‹': '›',
  '›': '‹',
};

export function mirror(text: string): string {
  return [...text].map((c) => MIRROR[c] ?? c).join('');
}

/**
 * Découpe un paragraphe en mots dont la direction est résolue.
 *
 * Les neutres entre deux mots de même direction la prennent ; les autres
 * prennent celle du paragraphe (règles N1/N2 de l'UAX #9, au grain du mot).
 */
export function tokenize(text: string, base: Direction): Token[] {
  const raw: { text: string; strong: Direction | null; space: boolean }[] = [];
  const words = text.split(/(\s+)/u);
  let pendingSpace = false;
  for (const w of words) {
    if (w === '') continue;
    if (/^\s+$/u.test(w)) {
      pendingSpace = true;
      continue;
    }
    splitWord(w).forEach((part, i) => {
      raw.push({
        text: part,
        strong: strongDir(part),
        space: i === 0 ? pendingSpace : false,
      });
    });
    pendingSpace = false;
  }
  return raw.map((tok, i) => {
    if (tok.strong)
      return { text: tok.text, dir: tok.strong, spaceBefore: tok.space };
    let prev: Direction | null = null;
    for (let j = i - 1; j >= 0 && prev === null; j--) prev = raw[j].strong;
    let next: Direction | null = null;
    for (let j = i + 1; j < raw.length && next === null; j++)
      next = raw[j].strong;
    const dir = prev !== null && prev === next ? prev : base;
    return { text: tok.text, dir, spaceBefore: tok.space };
  });
}

export type Measure = (text: string) => number;

const NO_BREAK_BEFORE = /^[:;!?»›%]+$/u;

/**
 * Découpe les mots en lignes de largeur maximale `width` (glouton).
 *
 * On ne coupe QU'À UN ESPACE : la ponctuation détachée par `tokenize` reste
 * collée au mot qu'elle suit. Sans cette règle, la virgule arabe d'une fin de
 * ligne partait seule en tête de la ligne suivante (mesuré sur le rapport
 * 2026 : « ، والأزمات العالمية »).
 */
export function breakLines(
  tokens: Token[],
  width: number,
  measure: Measure,
  spaceWidth: number,
): Token[][] {
  // Un mot plus large que la ligne (adresse, identifiant) est coupé au
  // caractère : c'est le `wrap-anywhere` du site, transposé au papier.
  const pieces: Token[] = [];
  for (const tok of tokens) {
    if (measure(tok.text) <= width) {
      pieces.push(tok);
      continue;
    }
    let chunk = '';
    let first = true;
    for (const ch of [...tok.text]) {
      if (chunk && measure(chunk + ch) > width) {
        pieces.push({
          ...tok,
          text: chunk,
          // Les morceaux d'un mot coupé sont des points de coupure permis.
          spaceBefore: first ? tok.spaceBefore : true,
        });
        first = false;
        chunk = '';
      }
      chunk += ch;
    }
    if (chunk)
      pieces.push({
        ...tok,
        text: chunk,
        spaceBefore: first ? tok.spaceBefore : true,
      });
  }

  // Groupes insécables : un mot et la ponctuation qui lui est collée — et, en
  // typographie française, la ponctuation haute précédée d'une espace (« : »,
  // « ; », « ! », « ? », « » ») : elle ne commence jamais une ligne.
  const groups: Token[][] = [];
  for (const tok of pieces) {
    const last = groups[groups.length - 1];
    if (last && (!tok.spaceBefore || NO_BREAK_BEFORE.test(tok.text))) {
      last.push(tok);
    } else groups.push([tok]);
  }

  const lines: Token[][] = [];
  let line: Token[] = [];
  let used = 0;
  for (const group of groups) {
    const w = group.reduce(
      (s, t, i) =>
        s + measure(t.text) + (i > 0 && t.spaceBefore ? spaceWidth : 0),
      0,
    );
    const gap = line.length > 0 ? spaceWidth : 0;
    if (line.length > 0 && used + gap + w > width) {
      lines.push(line);
      line = [];
      used = 0;
    }
    group.forEach((tok, i) =>
      line.push(
        i === 0 && line.length === 0 ? { ...tok, spaceBefore: false } : tok,
      ),
    );
    used += (line.length > group.length ? gap : 0) + w;
  }
  if (line.length > 0) lines.push(line);
  return lines;
}

export type Placed = {
  text: string;
  dir: Direction;
  /** Abscisse du bord GAUCHE du morceau, relative au début de la zone. */
  x: number;
  width: number;
};

/**
 * Place les mots d'une ligne dans l'ordre VISUEL.
 *
 * Les mots consécutifs de même direction forment une course. Dans un
 * paragraphe de droite à gauche, les courses se posent de droite à gauche
 * dans l'ordre logique ; à l'intérieur d'une course gauche-à-droite, les mots
 * gardent leur ordre de lecture. Le miroir dans l'autre sens.
 *
 * Une course gauche-à-droite est rendue D'UN SEUL MORCEAU, espaces compris :
 * pdfkit sait poser une chaîne latine, et un morceau par course plutôt que par
 * mot garde l'extraction du texte intacte. Une course droite-à-gauche est
 * rendue mot par mot : c'est la seule façon d'éviter le retournement de toute
 * la chaîne par fontkit.
 */
export function placeLine(
  line: Token[],
  base: Direction,
  width: number,
  measure: Measure,
  spaceWidth: number,
): Placed[] {
  type Run = { dir: Direction; tokens: Token[] };
  const runs: Run[] = [];
  for (const tok of line) {
    const last = runs[runs.length - 1];
    if (last && last.dir === tok.dir) last.tokens.push(tok);
    else runs.push({ dir: tok.dir, tokens: [tok] });
  }

  // Morceaux d'une course, dans l'ordre logique, avec l'espace qui les
  // précède. Une course LTR est fusionnée en un morceau par suite de mots
  // séparés d'espaces.
  type Piece = { text: string; width: number; gapBefore: number };
  const piecesOf = (run: Run, first: boolean): Piece[] => {
    if (run.dir === 'ltr') {
      const text = run.tokens
        .map((t, i) => (i > 0 && t.spaceBefore ? ' ' : '') + t.text)
        .join('');
      const gap = !first && run.tokens[0].spaceBefore ? spaceWidth : 0;
      return [{ text, width: measure(text), gapBefore: gap }];
    }
    return run.tokens.map((t, i) => {
      const text = mirror(t.text);
      const gap = (i > 0 || !first) && t.spaceBefore ? spaceWidth : 0;
      return { text, width: measure(text), gapBefore: gap };
    });
  };

  const placed: Placed[] = [];
  if (base === 'rtl') {
    let cursor = width;
    runs.forEach((run, r) => {
      const pieces = piecesOf(run, r === 0);
      if (run.dir === 'rtl') {
        for (const p of pieces) {
          cursor -= p.gapBefore + p.width;
          placed.push({ text: p.text, dir: 'rtl', x: cursor, width: p.width });
        }
      } else {
        const p = pieces[0];
        cursor -= p.gapBefore + p.width;
        placed.push({ text: p.text, dir: 'ltr', x: cursor, width: p.width });
      }
    });
  } else {
    let cursor = 0;
    runs.forEach((run, r) => {
      const pieces = piecesOf(run, r === 0);
      if (run.dir === 'ltr') {
        const p = pieces[0];
        cursor += p.gapBefore;
        placed.push({ text: p.text, dir: 'ltr', x: cursor, width: p.width });
        cursor += p.width;
      } else {
        // Course droite-à-gauche dans un paragraphe latin : bloc posé à la
        // suite, mots rangés de droite à gauche À L'INTÉRIEUR du bloc.
        const total = pieces.reduce(
          (s, p, i) => s + p.width + (i > 0 ? p.gapBefore : 0),
          0,
        );
        cursor += pieces[0].gapBefore;
        let inner = cursor + total;
        pieces.forEach((p, i) => {
          inner -= (i > 0 ? p.gapBefore : 0) + p.width;
          placed.push({ text: p.text, dir: 'rtl', x: inner, width: p.width });
        });
        cursor += total;
      }
    });
  }
  return placed;
}

/** Texte LOGIQUE d'une ligne — ce que porte `/ActualText` (accessibilité). */
export function logicalText(line: Token[]): string {
  return line
    .map((t, i) => (i > 0 && t.spaceBefore ? ' ' : '') + t.text)
    .join('');
}
