// F-36 — Synthèses thématiques. Contenu éditorial (la position du réseau) pour
// chacun des cinq axes de travail. Les slugs sont le miroir de `PUB_THEMES`
// (src/lib/publications.ts) : c'est la clé qui relie une synthèse à ses
// publications (Convex `by_status_and_theme`), à sa sous-dimension du baromètre
// et aux filtres bibliothèque/annuaire. Les libellés d'axe viennent de l'i18n
// (`library.themes.*`) ; ici on porte uniquement le texte de synthèse. Module
// local bilingue (même approche que `about-content.ts`), pas de donnée inventée
// (positions et questions, pas de chiffres). Vérifié sans terme banni.

import { PUB_THEMES } from './publications';

export type ThemeSlug = (typeof PUB_THEMES)[number];
export const THEME_SLUGS: readonly ThemeSlug[] = PUB_THEMES;

export type ThemeSynthesis = {
  slug: ThemeSlug;
  dimension: string; // sous-dimension du baromètre (D1…D5)
  lead: string;
  stance: string[];
  questions: string[];
};

const fr: Record<ThemeSlug, ThemeSynthesis> = {
  'gouvernance-numerique': {
    slug: 'gouvernance-numerique',
    dimension: 'D1',
    lead: "Comment les démocraties régulent le numérique sans renoncer aux libertés — et comment le numérique, en retour, redéfinit l'espace public.",
    stance: [
      "Les plateformes décident aujourd'hui de ce qui est vu, partagé et cru. Cette puissance privée échappe largement au contrôle démocratique, en Afrique comme en Europe. Le réseau documente ces mécanismes et compare les réponses réglementaires, des règles européennes aux lois nationales africaines sur les données.",
      "Notre angle n'est pas la défiance envers la technologie mais l'exigence de redevabilité : qui modère, selon quelles règles, avec quel recours pour les citoyens. Nous suivons aussi les coupures d'accès et la surveillance, qui restent des instruments de contrôle politique.",
    ],
    questions: [
      "Quelle régulation des plateformes protège le débat sans ouvrir la voie à la censure d'État ?",
      'Comment garantir la souveraineté des données sans fragmenter leur accès ?',
      'Quel recours concret pour un citoyen face à une décision algorithmique ?',
    ],
  },
  participation: {
    slug: 'participation',
    dimension: 'D2',
    lead: 'Au-delà du vote : délibération, engagement local et confiance dans les institutions.',
    stance: [
      "La démocratie ne se résume pas à l'élection. Entre deux scrutins, c'est la qualité de la participation — budgets participatifs, consultations, vie associative — qui entretient la confiance. Le réseau étudie ces dispositifs et ce qui les rend crédibles plutôt que cosmétiques.",
      "Nous nous intéressons en particulier à la jeunesse et aux formes d'engagement qui ne passent pas par les partis. La défiance n'est pas de l'apathie : elle cherche d'autres canaux, que les institutions captent mal.",
    ],
    questions: [
      "Qu'est-ce qui distingue une consultation réelle d'une consultation de façade ?",
      'Comment réengager une jeunesse qui se détourne des urnes sans se détourner du politique ?',
      'Quel rôle pour la société civile dans la fabrique des décisions ?',
    ],
  },
  'anti-corruption': {
    slug: 'anti-corruption',
    dimension: 'D3',
    lead: 'Transparence budgétaire, intégrité publique et reddition de comptes : les conditions concrètes de la confiance.',
    stance: [
      "La corruption n'est pas qu'une question morale : elle détourne des ressources, décrédibilise l'État et nourrit l'autoritarisme. Le réseau privilégie l'angle des mécanismes — marchés publics, déclarations de patrimoine, indépendance des contrôles — plutôt que l'indignation générale.",
      "Nous documentons ce qui fonctionne : données budgétaires ouvertes, protection des lanceurs d'alerte, juridictions financières indépendantes. Et ce qui échoue, car la lutte anti-corruption sert parfois d'arme contre les opposants.",
    ],
    questions: [
      'Comment rendre la dépense publique vraiment traçable et lisible ?',
      "Quelle protection effective pour les lanceurs d'alerte ?",
      "Comment éviter que l'anti-corruption ne devienne un instrument politique ?",
    ],
  },
  transitions: {
    slug: 'transitions',
    dimension: 'D4',
    lead: "Sortie d'autoritarisme, alternances et résilience : ce qui consolide une transition, ce qui la fait reculer.",
    stance: [
      "Une transition ne s'arrête pas le jour de la première élection libre. Les reculs viennent souvent après : capture des institutions, révisions constitutionnelles, neutralisation des contre-pouvoirs. Le réseau suit ces trajectoires sur le temps long.",
      "C'est ici que la comparaison Afrique-Europe est la plus féconde : les deux continents ont connu des transitions, des consolidations et des reculs, à des rythmes différents. Croiser ces expériences éclaire mieux que chaque cas isolé.",
    ],
    questions: [
      "Qu'est-ce qui distingue une alternance d'une simple rotation des élites ?",
      'Comment protéger les contre-pouvoirs pendant une transition ?',
      "Quels signaux annoncent un recul démocratique avant qu'il ne soit visible ?",
    ],
  },
  crises: {
    slug: 'crises',
    dimension: 'D5',
    lead: 'Climat, sécurité, migrations, santé : comment les chocs globaux pèsent sur la gouvernance démocratique.',
    stance: [
      "Les crises sont devenues le test des démocraties. L'urgence justifie l'exception, l'exception s'installe, et les libertés reculent au nom de la protection. Le réseau étudie comment répondre aux chocs sans sacrifier l'état de droit.",
      "Cet axe est transversal : il croise les quatre autres. Une crise climatique met à l'épreuve la participation, la transparence et la résilience des institutions en même temps. Nous l'abordons comme un révélateur, pas comme un domaine séparé.",
    ],
    questions: [
      "Comment préserver l'état de droit en régime d'urgence prolongée ?",
      "Qui décide, et sous quel contrôle, quand l'exception devient la règle ?",
      'Quelle place pour les citoyens dans la réponse aux crises ?',
    ],
  },
};

const en: Record<ThemeSlug, ThemeSynthesis> = {
  'gouvernance-numerique': {
    slug: 'gouvernance-numerique',
    dimension: 'D1',
    lead: 'How democracies regulate the digital sphere without giving up freedoms — and how the digital sphere, in turn, reshapes public life.',
    stance: [
      'Platforms now decide what gets seen, shared and believed. That private power largely escapes democratic control, in Africa as in Europe. The network documents these mechanisms and compares regulatory responses, from European rules to national data laws across Africa.',
      'Our angle is not distrust of technology but a demand for accountability: who moderates, under what rules, with what recourse for citizens. We also track access shutdowns and surveillance, which remain instruments of political control.',
    ],
    questions: [
      'What platform regulation protects debate without opening the door to state censorship?',
      'How can data sovereignty be ensured without fragmenting access?',
      'What concrete recourse does a citizen have against an algorithmic decision?',
    ],
  },
  participation: {
    slug: 'participation',
    dimension: 'D2',
    lead: 'Beyond the ballot: deliberation, local engagement and trust in institutions.',
    stance: [
      'Democracy is not just elections. Between two votes, it is the quality of participation — participatory budgets, consultations, civic life — that sustains trust. The network studies these mechanisms and what makes them credible rather than cosmetic.',
      'We pay particular attention to young people and to forms of engagement that bypass parties. Distrust is not apathy: it looks for other channels, ones institutions capture poorly.',
    ],
    questions: [
      'What separates a real consultation from a token one?',
      'How do you re-engage a youth turning away from the ballot box but not from politics?',
      'What role should civil society play in shaping decisions?',
    ],
  },
  'anti-corruption': {
    slug: 'anti-corruption',
    dimension: 'D3',
    lead: 'Budget transparency, public integrity and accountability: the concrete conditions of trust.',
    stance: [
      'Corruption is not only a moral question: it diverts resources, discredits the state and feeds authoritarianism. The network favours the angle of mechanisms — public procurement, asset declarations, independent oversight — over general outrage.',
      'We document what works: open budget data, whistleblower protection, independent financial courts. And what fails, since anti-corruption is sometimes used as a weapon against opponents.',
    ],
    questions: [
      'How can public spending be made genuinely traceable and legible?',
      'What effective protection exists for whistleblowers?',
      'How do you keep anti-corruption from becoming a political instrument?',
    ],
  },
  transitions: {
    slug: 'transitions',
    dimension: 'D4',
    lead: 'Exit from authoritarianism, turnovers and resilience: what consolidates a transition, what makes it slide back.',
    stance: [
      'A transition does not end on the day of the first free election. Setbacks often come afterwards: capture of institutions, constitutional revisions, neutralising of checks and balances. The network follows these trajectories over the long run.',
      'This is where the Africa-Europe comparison is most fruitful: both continents have known transitions, consolidations and reversals, at different paces. Crossing these experiences sheds more light than any single case.',
    ],
    questions: [
      'What separates a genuine turnover from a mere rotation of elites?',
      'How do you protect checks and balances during a transition?',
      'What signals warn of democratic backsliding before it becomes visible?',
    ],
  },
  crises: {
    slug: 'crises',
    dimension: 'D5',
    lead: 'Climate, security, migration, health: how global shocks weigh on democratic governance.',
    stance: [
      'Crises have become the test of democracies. Emergency justifies the exception, the exception settles in, and freedoms recede in the name of protection. The network studies how to respond to shocks without sacrificing the rule of law.',
      'This pillar is cross-cutting: it intersects the other four. A climate crisis tests participation, transparency and institutional resilience at once. We treat it as a revealer, not a separate field.',
    ],
    questions: [
      'How do you preserve the rule of law under prolonged emergency?',
      'Who decides, and under what oversight, when the exception becomes the rule?',
      'What place is there for citizens in the response to crises?',
    ],
  },
};

export function getThemeSyntheses(locale: 'fr' | 'en'): ThemeSynthesis[] {
  const table = locale === 'en' ? en : fr;
  return THEME_SLUGS.map((s) => table[s]);
}

export function getThemeSynthesis(
  locale: 'fr' | 'en',
  slug: string,
): ThemeSynthesis | null {
  const table = locale === 'en' ? en : fr;
  return (THEME_SLUGS as readonly string[]).includes(slug)
    ? table[slug as ThemeSlug]
    : null;
}
