// Hub jeunes (F-40) — contenu porté 1:1 depuis la maquette agence
// `design/rmdl-jeunes.html`. Univers visuel "jeunes" (safran) appliqué via
// data-universe sur la page. Données d'illustration (profil, stats, témoignage
// fictifs, c'est explicite). Module bilingue. Vérifié sans terme banni.

export type YouthContent = {
  hero: {
    chip: string;
    titlePre: string;
    titleEm: string;
    titlePost: string;
    lead: string;
    ctaJoin: string;
    ctaPrograms: string;
    badges: string[];
  };
  parcours: {
    eyebrow: string;
    title: string;
    lead: string;
    steps: { n: string; title: string; body: string }[];
    gam: {
      title: string;
      body: string;
      badges: { letter: string; label: string; locked: boolean }[];
      levelLabel: string;
      level: string;
      points: string;
      remaining: string;
      chips: string[];
      note: string;
      pct: number;
    };
  };
  programmes: {
    title: string;
    lead: string;
    featured: { kicker: string; title: string; body: string; cta: string };
    funding: { kicker: string; title: string; body: string; cta: string };
    items: { kicker: string; title: string; body: string; cta: string }[];
  };
  mentor: {
    eyebrow: string;
    title: string;
    body: string;
    cta: string;
    mentors: { initials: string; name: string; field: string; role: string }[];
  };
  testimonial: {
    quote: string;
    attrName: string;
    attrPlace: string;
    attrNote: string;
    stats: { n: string; u?: string; label: string }[];
    note: string;
  };
  cta: { title: string; body: string; primary: string; secondary: string };
};

const fr: YouthContent = {
  hero: {
    chip: 'Hub jeunes',
    titlePre: 'Tu as des idées pour la démocratie. On te donne les moyens d’',
    titleEm: 'agir',
    titlePost: '.',
    lead: 'Un espace pour les moins de 35 ans : apprendre, contribuer, publier, et être accompagné par des mentors du réseau. En Afrique comme en Europe.',
    ctaJoin: 'Rejoindre le hub',
    ctaPrograms: 'Voir les programmes',
    badges: ['Gratuit pour les jeunes', 'Mobile d’abord', 'FR / EN'],
  },
  parcours: {
    eyebrow: 'Ton parcours',
    title: 'Quatre étapes, à ton rythme',
    lead: 'Tu avances quand tu veux. Chaque étape débloque la suivante et fait grandir ton profil dans le réseau.',
    steps: [
      {
        n: '1',
        title: 'Découvrir',
        body: 'Comprendre les enjeux avec des formats courts et accessibles.',
      },
      {
        n: '2',
        title: 'Apprendre',
        body: 'Boîte à outils, webinaires et modules de renforcement de capacités.',
      },
      {
        n: '3',
        title: 'Contribuer',
        body: 'Publier une tribune, rejoindre un groupe de travail, candidater à une bourse.',
      },
      {
        n: '4',
        title: 'Mentorer',
        body: 'Transmettre à ton tour, et accompagner un binôme du réseau.',
      },
    ],
    gam: {
      title: 'Ta progression compte',
      body: 'Chaque contribution te fait gagner des badges et de la visibilité auprès des think tanks membres. Une reconnaissance concrète, pas un gadget.',
      badges: [
        { letter: 'D', label: 'Découvreur', locked: false },
        { letter: 'C', label: 'Contributeur', locked: false },
        { letter: 'M', label: 'Mentor', locked: true },
        { letter: 'A', label: 'Ambassadeur', locked: true },
      ],
      levelLabel: 'Ton niveau',
      level: 'Niveau 2 · Contributeur',
      points: '620 / 1000 points',
      remaining: 'Plus que 2 contributions',
      chips: ['3 publications', '1 webinaire', 'Profil vérifié'],
      note: 'Exemple de profil',
      pct: 62,
    },
  },
  programmes: {
    title: 'Les programmes',
    lead: "Des dispositifs concrets pour passer de l'idée à l'action.",
    featured: {
      kicker: 'Phare',
      title: 'Mentorat',
      body: "On t'associe à un mentor expérimenté du réseau, selon ta langue, ta région et tes thèmes. Six mois d'accompagnement, des objectifs clairs, un vrai suivi.",
      cta: 'Demander un mentor',
    },
    funding: {
      kicker: 'Financement',
      title: 'Bourses ciblées',
      body: 'Des bourses pour les jeunes chercheurs et les think tanks émergents, en priorité dans les régions fragiles.',
      cta: 'Voir les bourses',
    },
    items: [
      {
        kicker: 'Apprendre',
        title: 'Boîte à outils',
        body: 'Guides, modèles et modules courts pour monter en compétence, avec certification.',
        cta: 'Ouvrir la boîte',
      },
      {
        kicker: 'Publier',
        title: 'Tribunes',
        body: "Soumets une contribution courte, accompagnée d'un appui éditorial du réseau.",
        cta: 'Proposer une tribune',
      },
      {
        kicker: 'Agir',
        title: 'Campagnes',
        body: 'Rejoins des campagnes de sensibilisation et des événements jeunes à Dakar et Bruxelles.',
        cta: 'Voir les campagnes',
      },
    ],
  },
  mentor: {
    eyebrow: 'Mentorat',
    title: 'Un binôme, pas un formulaire',
    body: "L'appariement se fait sur tes thèmes, ta langue et ta région. Tu fixes les objectifs avec ton mentor, le réseau assure le suivi et la régularité des sessions.",
    cta: 'Trouver mon mentor',
    mentors: [
      {
        initials: 'AW',
        name: 'Aminata Wade',
        field: 'Gouvernance locale · Dakar',
        role: 'Mentore',
      },
      {
        initials: 'PV',
        name: 'Pieter Vandenberghe',
        field: 'Démocratie numérique · Bruxelles',
        role: 'Mentor',
      },
      {
        initials: 'LK',
        name: 'Linda Kouassi',
        field: 'Anti-corruption · Abidjan',
        role: 'Mentore',
      },
    ],
  },
  testimonial: {
    quote:
      "J'ai publié ma première tribune à 23 ans grâce au hub. Six mois plus tard, mon think tank m'a recrutée. Le réseau m'a ouvert des portes que je croyais fermées.",
    attrName: 'Fatou N., 24 ans',
    attrPlace: 'Dakar',
    attrNote: "(témoignage d'illustration)",
    stats: [
      { n: '1 200', u: '+', label: 'Jeunes engagés' },
      { n: '180', label: 'Binômes de mentorat' },
      { n: '45', label: 'Bourses attribuées' },
      { n: '22', label: 'Pays représentés' },
    ],
    note: "Données d'illustration",
  },
  cta: {
    title: 'Prêt à rejoindre le hub ?',
    body: "L'inscription prend trois minutes. Gratuit pour les moins de 35 ans, partout dans le réseau.",
    primary: 'Créer mon profil',
    secondary: 'Découvrir Democracy Together',
  },
};

const en: YouthContent = {
  hero: {
    chip: 'Youth Hub',
    titlePre: 'You have ideas for democracy. We give you the means to ',
    titleEm: 'act',
    titlePost: '.',
    lead: 'A space for under-35s: learn, contribute, publish, and be supported by mentors from the network. In Africa as in Europe.',
    ctaJoin: 'Join the hub',
    ctaPrograms: 'See the programmes',
    badges: ['Free for young people', 'Mobile first', 'FR / EN'],
  },
  parcours: {
    eyebrow: 'Your path',
    title: 'Four steps, at your own pace',
    lead: 'You move forward when you want. Each step unlocks the next and grows your profile in the network.',
    steps: [
      {
        n: '1',
        title: 'Discover',
        body: 'Understand the issues with short, accessible formats.',
      },
      {
        n: '2',
        title: 'Learn',
        body: 'Toolkit, webinars and capacity-building modules.',
      },
      {
        n: '3',
        title: 'Contribute',
        body: 'Publish an op-ed, join a working group, apply for a grant.',
      },
      {
        n: '4',
        title: 'Mentor',
        body: 'Pass it on in turn, and support a network pair.',
      },
    ],
    gam: {
      title: 'Your progress counts',
      body: 'Every contribution earns you badges and visibility with member think tanks. Concrete recognition, not a gimmick.',
      badges: [
        { letter: 'D', label: 'Discoverer', locked: false },
        { letter: 'C', label: 'Contributor', locked: false },
        { letter: 'M', label: 'Mentor', locked: true },
        { letter: 'A', label: 'Ambassador', locked: true },
      ],
      levelLabel: 'Your level',
      level: 'Level 2 · Contributor',
      points: '620 / 1000 points',
      remaining: 'Just 2 more contributions',
      chips: ['3 publications', '1 webinar', 'Verified profile'],
      note: 'Sample profile',
      pct: 62,
    },
  },
  programmes: {
    title: 'The programmes',
    lead: 'Concrete schemes to move from idea to action.',
    featured: {
      kicker: 'Flagship',
      title: 'Mentoring',
      body: 'We pair you with an experienced mentor from the network, matched on your language, region and topics. Six months of support, clear goals, real follow-up.',
      cta: 'Request a mentor',
    },
    funding: {
      kicker: 'Funding',
      title: 'Targeted grants',
      body: 'Grants for young researchers and emerging think tanks, prioritising fragile regions.',
      cta: 'See the grants',
    },
    items: [
      {
        kicker: 'Learn',
        title: 'Toolkit',
        body: 'Guides, templates and short modules to build skills, with certification.',
        cta: 'Open the toolkit',
      },
      {
        kicker: 'Publish',
        title: 'Op-eds',
        body: 'Submit a short contribution, with editorial support from the network.',
        cta: 'Propose an op-ed',
      },
      {
        kicker: 'Act',
        title: 'Campaigns',
        body: 'Join awareness campaigns and youth events in Dakar and Brussels.',
        cta: 'See the campaigns',
      },
    ],
  },
  mentor: {
    eyebrow: 'Mentoring',
    title: 'A pair, not a form',
    body: 'Matching is based on your topics, your language and your region. You set the goals with your mentor, the network ensures follow-up and regular sessions.',
    cta: 'Find my mentor',
    mentors: [
      {
        initials: 'AW',
        name: 'Aminata Wade',
        field: 'Local governance · Dakar',
        role: 'Mentor',
      },
      {
        initials: 'PV',
        name: 'Pieter Vandenberghe',
        field: 'Digital democracy · Brussels',
        role: 'Mentor',
      },
      {
        initials: 'LK',
        name: 'Linda Kouassi',
        field: 'Anti-corruption · Abidjan',
        role: 'Mentor',
      },
    ],
  },
  testimonial: {
    quote:
      'I published my first op-ed at 23 thanks to the hub. Six months later, my think tank recruited me. The network opened doors I thought were closed.',
    attrName: 'Fatou N., 24',
    attrPlace: 'Dakar',
    attrNote: '(illustration testimonial)',
    stats: [
      { n: '1,200', u: '+', label: 'Young people engaged' },
      { n: '180', label: 'Mentoring pairs' },
      { n: '45', label: 'Grants awarded' },
      { n: '22', label: 'Countries represented' },
    ],
    note: 'Illustration data',
  },
  cta: {
    title: 'Ready to join the hub?',
    body: 'Signing up takes three minutes. Free for under-35s, everywhere in the network.',
    primary: 'Create my profile',
    secondary: 'Discover Democracy Together',
  },
};

export function getYouthContent(locale: 'fr' | 'en'): YouthContent {
  return locale === 'en' ? en : fr;
}
