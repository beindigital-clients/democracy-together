// F-41 — Rapports annuels. Pour une association qui se constitue (loi 1901 en
// cours), le rapport d'activité inaugural couvre la fondation, la gouvernance,
// les premiers chantiers et les perspectives — faits établis, AUCUNE métrique
// inventée. Module local bilingue (même approche que `about-content.ts` /
// `themes-content.ts`). Le détail propose une impression « Enregistrer en PDF »
// (pas de génération PDF serveur). Vérifié sans terme banni.

export type ReportSection = { heading: string; body: string[] };
export type AnnualReport = {
  year: number;
  inaugural: boolean;
  title: string;
  intro: string;
  sections: ReportSection[];
};

// Années disponibles (descendant). Une seule édition pour l'instant.
export const REPORT_YEARS = [2026] as const;

const fr: Record<number, AnnualReport> = {
  2026: {
    year: 2026,
    inaugural: true,
    title: "Rapport d'activité 2026",
    intro:
      "Première année de Democracy Together : la constitution du réseau, ses fondations méthodologiques et ses premiers chantiers communs entre l'Afrique et l'Europe.",
    sections: [
      {
        heading: 'Fondation et mission',
        body: [
          "Democracy Together est né en 2026 de la conviction qu'aucun continent n'a le monopole de l'expérience démocratique. Constitué en association loi 1901 (en cours de constitution), le réseau réunit des think tanks, des chercheurs et des partenaires d'Afrique et d'Europe autour d'une comparaison honnête, sans posture donneuse de leçons.",
          "Le travail s'organise autour de cinq axes : gouvernance numérique, participation citoyenne, lutte anti-corruption, transitions démocratiques et crises globales. Pour chacun, le réseau publie sa position et relie les analyses de ses membres.",
        ],
      },
      {
        heading: 'Gouvernance',
        body: [
          "La structure distingue l'orientation stratégique de l'animation opérationnelle. Les fondateurs — Abdou Samb, Philippe Kourilsky et Pierre Vimont — ont posé les statuts et les principes de fonctionnement, ouverts à l'adhésion de nouvelles organisations.",
          'Un comité scientifique indépendant du secrétariat supervise les travaux à vocation méthodologique, à commencer par le Baromètre : il relit la méthode, signale les biais et valide chaque édition avant publication.',
        ],
      },
      {
        heading: 'Le Baromètre de la démocratie',
        body: [
          'Chantier méthodologique central de la première année : un indice composite Afrique-Europe, construit par méta-agrégation de sources sous licence ouverte. Données et codebook sont publiés en accès ouvert (CC-BY), pour que chacun puisse reproduire et contester le résultat.',
          'La première édition fonctionne comme preuve de concept. Les valeurs réelles, pays par pays, seront branchées et validées par le comité scientifique au fil des éditions.',
        ],
      },
      {
        heading: 'Premiers outils du réseau',
        body: [
          "Mise en place de la bibliothèque commune (publications citables, dépôt par les membres et modération a priori), de l'annuaire des organisations et des synthèses thématiques. Ces outils forment le socle de la production collective des prochaines années.",
        ],
      },
      {
        heading: 'Perspectives 2026-2027',
        body: [
          "Consolider l'adhésion des premiers membres, brancher les données réelles du Baromètre, ouvrir un espace d'expression modéré entre membres et tenir la conférence inaugurale du réseau.",
          "La trajectoire reste celle d'un commun : ouvert, contestable, amélioré par ses contributeurs.",
        ],
      },
    ],
  },
};

const en: Record<number, AnnualReport> = {
  2026: {
    year: 2026,
    inaugural: true,
    title: 'Activity report 2026',
    intro:
      "Democracy Together's first year: building the network, its methodological foundations and its first joint work between Africa and Europe.",
    sections: [
      {
        heading: 'Founding and mission',
        body: [
          'Democracy Together was founded in 2026 on the conviction that no continent holds a monopoly on democratic experience. Set up as a French not-for-profit (loi 1901, in formation), the network brings together think tanks, researchers and partners from Africa and Europe around an honest comparison, without lecturing.',
          'Work is organised around five pillars: digital governance, citizen participation, anti-corruption, democratic transitions and global crises. For each, the network publishes its stance and links its members’ analyses.',
        ],
      },
      {
        heading: 'Governance',
        body: [
          'The structure separates strategic direction from operational coordination. The founders — Abdou Samb, Philippe Kourilsky and Pierre Vimont — set the statutes and operating principles, open to new member organisations.',
          'A scientific committee, independent from the secretariat, oversees methodological work, starting with the Barometer: it reviews the method, flags biases and validates each edition before publication.',
        ],
      },
      {
        heading: 'The Democracy Barometer',
        body: [
          'The central methodological project of the first year: a composite Africa-Europe index built by meta-aggregating open-licence sources. Data and codebook are published openly (CC-BY), so anyone can reproduce and challenge the result.',
          'The first edition works as a proof of concept. Real, country-by-country values will be wired in and validated by the scientific committee across future editions.',
        ],
      },
      {
        heading: 'First network tools',
        body: [
          'Setting up the shared library (citable publications, member submission and upfront moderation), the directory of organisations and the thematic syntheses. These tools form the basis of the collective output of the years to come.',
        ],
      },
      {
        heading: 'Outlook 2026-2027',
        body: [
          'Consolidate the first members, wire in the Barometer’s real data, open a moderated space for expression between members and hold the network’s inaugural conference.',
          'The course remains that of a commons: open, contestable, improved by its contributors.',
        ],
      },
    ],
  },
};

export function getReports(locale: 'fr' | 'en'): AnnualReport[] {
  const table = locale === 'en' ? en : fr;
  return [...REPORT_YEARS].sort((a, b) => b - a).map((y) => table[y]);
}

export function getReport(
  locale: 'fr' | 'en',
  year: number,
): AnnualReport | null {
  const table = locale === 'en' ? en : fr;
  return table[year] ?? null;
}
