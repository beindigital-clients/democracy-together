import type { Locale } from '@/i18n/routing';

// F-16 — Press area / media kit. Public page with no Convex backend: local
// bilingual editorial content (same approach as `partners-content.ts` /
// `reports-content.ts`). It contains a boilerplate (presentation of the network in
// one paragraph), KEY FACTS — only ESTABLISHED facts, NO invented
// figure like "X membres" — the press contact (link to the /contact
// form) and resources (links to /a-propos and to the Barometer's open
// data, CC-BY). Checked for banned terms.

export type PressFact = {
  slug: string;
  label: string;
  value: string;
};

export type PressResource = {
  slug: string;
  label: string;
  description: string;
  href: string;
  external: boolean; // true = data file (<a> link), false = internal route (<Link>)
};

export type PressKit = {
  // Boilerplate: presentation of the network in one paragraph, reusable as is
  // by a newsroom ("à propos de Democracy Together").
  boilerplate: string;
  facts: PressFact[];
  resources: PressResource[];
};

// Neutral slugs (shared fr/en), display order of the key facts.
export const PRESS_FACT_SLUGS = [
  'statut',
  'perimetre',
  'axes',
  'barometre',
] as const;

export type PressFactSlug = (typeof PRESS_FACT_SLUGS)[number];

// Neutral slugs of the press resources.
export const PRESS_RESOURCE_SLUGS = [
  'a-propos',
  'donnees',
  'codebook',
] as const;

export type PressResourceSlug = (typeof PRESS_RESOURCE_SLUGS)[number];

const fr: PressKit = {
  boilerplate:
    "Democracy Together est un réseau de think tanks, de chercheurs et de partenaires d'Afrique et d'Europe qui comparent honnêtement leurs expériences démocratiques, sans posture donneuse de leçons. Constitué en association loi 1901 (en cours de constitution), le réseau travaille autour de cinq axes — gouvernance numérique, participation citoyenne, lutte anti-corruption, transitions démocratiques et crises globales — et publie ses analyses ainsi qu'un Baromètre dont les données sont ouvertes et reproductibles.",
  facts: [
    {
      slug: 'statut',
      label: 'Statut',
      value:
        'Association loi 1901 en cours de constitution, à but non lucratif et à vocation indépendante.',
    },
    {
      slug: 'perimetre',
      label: 'Périmètre',
      value:
        "Un réseau bicontinental Afrique-Europe : think tanks, chercheurs et partenaires réunis autour d'une comparaison démocratique honnête.",
    },
    {
      slug: 'axes',
      label: 'Cinq axes de travail',
      value:
        'Gouvernance numérique, participation citoyenne, lutte anti-corruption, transitions démocratiques et crises globales.',
    },
    {
      slug: 'barometre',
      label: 'Baromètre en données ouvertes',
      value:
        'Un indice composite Afrique-Europe dont les données et le codebook sont publiés en accès ouvert sous licence CC-BY, pour être reproduits et contestés.',
    },
  ],
  resources: [
    {
      slug: 'a-propos',
      label: 'À propos du réseau',
      description:
        'Mission, gouvernance, fondateurs et méthode : la présentation détaillée de Democracy Together.',
      href: '/a-propos',
      external: false,
    },
    {
      slug: 'donnees',
      label: 'Données du Baromètre (CSV, CC-BY)',
      description:
        "L'indice composite Afrique-Europe en données ouvertes, prêtes à être citées et réutilisées.",
      href: '/barometre/data/composite.csv',
      external: true,
    },
    {
      slug: 'codebook',
      label: 'Codebook du Baromètre (TXT)',
      description:
        'Le dictionnaire des variables et la méthode de construction de chaque indicateur.',
      href: '/barometre/data/codebook.txt',
      external: true,
    },
  ],
};

const en: PressKit = {
  boilerplate:
    'Democracy Together is a network of think tanks, researchers and partners from Africa and Europe who compare their democratic experiences honestly, without lecturing. Set up as a French not-for-profit (loi 1901, in formation), the network works around five pillars — digital governance, citizen participation, anti-corruption, democratic transitions and global crises — and publishes its analyses alongside a Barometer whose data is open and reproducible.',
  facts: [
    {
      slug: 'statut',
      label: 'Status',
      value:
        'A French not-for-profit (loi 1901), in formation, independent and non-partisan.',
    },
    {
      slug: 'perimetre',
      label: 'Scope',
      value:
        'A two-continent Africa-Europe network: think tanks, researchers and partners gathered around an honest democratic comparison.',
    },
    {
      slug: 'axes',
      label: 'Five pillars of work',
      value:
        'Digital governance, citizen participation, anti-corruption, democratic transitions and global crises.',
    },
    {
      slug: 'barometre',
      label: 'Barometer as open data',
      value:
        'A composite Africa-Europe index whose data and codebook are published openly under a CC-BY licence, so they can be reproduced and challenged.',
    },
  ],
  resources: [
    {
      slug: 'a-propos',
      label: 'About the network',
      description:
        'Mission, governance, founders and method: the detailed presentation of Democracy Together.',
      href: '/a-propos',
      external: false,
    },
    {
      slug: 'donnees',
      label: 'Barometer data (CSV, CC-BY)',
      description:
        'The composite Africa-Europe index as open data, ready to be cited and reused.',
      href: '/barometre/data/composite.csv',
      external: true,
    },
    {
      slug: 'codebook',
      label: 'Barometer codebook (TXT)',
      description:
        'The dictionary of variables and the construction method behind each indicator.',
      href: '/barometre/data/codebook.txt',
      external: true,
    },
  ],
};

const es: PressKit = {
  boilerplate:
    'Democracy Together es una red de centros de estudios, investigadores y socios de África y Europa que comparan honestamente sus experiencias democráticas, sin dar lecciones a nadie. Constituida como asociación de derecho francés (loi 1901, en constitución), la red trabaja en torno a cinco ejes —gobernanza digital, participación ciudadana, lucha contra la corrupción, transiciones democráticas y crisis globales— y publica sus análisis junto a un Barómetro cuyos datos son abiertos y reproducibles.',
  facts: [
    {
      slug: 'statut',
      label: 'Estatuto',
      value:
        'Asociación de derecho francés (loi 1901) en constitución, sin ánimo de lucro e independiente.',
    },
    {
      slug: 'perimetre',
      label: 'Alcance',
      value:
        'Una red bicontinental África-Europa: centros de estudios, investigadores y socios reunidos en torno a una comparación democrática honesta.',
    },
    {
      slug: 'axes',
      label: 'Cinco ejes de trabajo',
      value:
        'Gobernanza digital, participación ciudadana, lucha contra la corrupción, transiciones democráticas y crisis globales.',
    },
    {
      slug: 'barometre',
      label: 'Barómetro en datos abiertos',
      value:
        'Un índice compuesto África-Europa cuyos datos y libro de códigos se publican en acceso abierto con licencia CC-BY, para ser reproducidos y refutados.',
    },
  ],
  resources: [
    {
      slug: 'a-propos',
      label: 'Sobre la red',
      description:
        'Misión, gobernanza, fundadores y método: la presentación detallada de Democracy Together.',
      href: '/a-propos',
      external: false,
    },
    {
      slug: 'donnees',
      label: 'Datos del Barómetro (CSV, CC-BY)',
      description:
        'El índice compuesto África-Europa en datos abiertos, listos para ser citados y reutilizados.',
      href: '/barometre/data/composite.csv',
      external: true,
    },
    {
      slug: 'codebook',
      label: 'Libro de códigos del Barómetro (TXT)',
      description:
        'El diccionario de variables y el método de construcción de cada indicador.',
      href: '/barometre/data/codebook.txt',
      external: true,
    },
  ],
};

const pt: PressKit = {
  boilerplate:
    'A Democracy Together é uma rede de centros de estudos, investigadores e parceiros de África e da Europa que comparam honestamente as suas experiências democráticas, sem dar lições a ninguém. Constituída como associação de direito francês (loi 1901, em constituição), a rede trabalha em torno de cinco eixos — governação digital, participação cidadã, combate à corrupção, transições democráticas e crises globais — e publica as suas análises a par de um Barómetro cujos dados são abertos e reproduzíveis.',
  facts: [
    {
      slug: 'statut',
      label: 'Estatuto',
      value:
        'Associação de direito francês (loi 1901) em constituição, sem fins lucrativos e independente.',
    },
    {
      slug: 'perimetre',
      label: 'Âmbito',
      value:
        'Uma rede bicontinental África-Europa: centros de estudos, investigadores e parceiros reunidos em torno de uma comparação democrática honesta.',
    },
    {
      slug: 'axes',
      label: 'Cinco eixos de trabalho',
      value:
        'Governação digital, participação cidadã, combate à corrupção, transições democráticas e crises globais.',
    },
    {
      slug: 'barometre',
      label: 'Barómetro em dados abertos',
      value:
        'Um índice compósito África-Europa cujos dados e livro de códigos são publicados em acesso aberto sob licença CC-BY, para serem reproduzidos e contestados.',
    },
  ],
  resources: [
    {
      slug: 'a-propos',
      label: 'Sobre a rede',
      description:
        'Missão, governação, fundadores e método: a apresentação detalhada da Democracy Together.',
      href: '/a-propos',
      external: false,
    },
    {
      slug: 'donnees',
      label: 'Dados do Barómetro (CSV, CC-BY)',
      description:
        'O índice compósito África-Europa em dados abertos, prontos a ser citados e reutilizados.',
      href: '/barometre/data/composite.csv',
      external: true,
    },
    {
      slug: 'codebook',
      label: 'Livro de códigos do Barómetro (TXT)',
      description:
        'O dicionário das variáveis e o método de construção de cada indicador.',
      href: '/barometre/data/codebook.txt',
      external: true,
    },
  ],
};

const ar: PressKit = {
  boilerplate:
    'Democracy Together شبكة من مراكز الدراسات والباحثين والشركاء من أفريقيا وأوروبا يقارنون تجاربهم الديمقراطية بنزاهة، بعيداً عن منطق إلقاء الدروس. تأسست الشبكة في شكل جمعية خاضعة للقانون الفرنسي (قانون 1901، قيد التأسيس)، وتشتغل حول خمسة محاور — الحوكمة الرقمية، والمشاركة المواطنة، ومكافحة الفساد، والانتقالات الديمقراطية، والأزمات العالمية — وتنشر تحليلاتها إلى جانب مؤشر بياناته مفتوحة وقابلة لإعادة الإنتاج.',
  facts: [
    {
      slug: 'statut',
      label: 'الوضع القانوني',
      value:
        'جمعية خاضعة للقانون الفرنسي (قانون 1901) قيد التأسيس، غير ربحية ومستقلة.',
    },
    {
      slug: 'perimetre',
      label: 'نطاق العمل',
      value:
        'شبكة تمتد على قارتين، أفريقيا وأوروبا: مراكز دراسات وباحثون وشركاء يجمعهم سعي إلى مقارنة ديمقراطية نزيهة.',
    },
    {
      slug: 'axes',
      label: 'خمسة محاور عمل',
      value:
        'الحوكمة الرقمية، والمشاركة المواطنة، ومكافحة الفساد، والانتقالات الديمقراطية، والأزمات العالمية.',
    },
    {
      slug: 'barometre',
      label: 'مؤشر ببيانات مفتوحة',
      value:
        'مؤشر مركّب لأفريقيا وأوروبا تُنشر بياناته ودليل ترميزه في وصول مفتوح برخصة CC-BY، حتى يمكن إعادة إنتاجهما والاعتراض عليهما.',
    },
  ],
  resources: [
    {
      slug: 'a-propos',
      label: 'عن الشبكة',
      description:
        'الرسالة والحوكمة والمؤسسون والمنهجية: العرض المفصّل لـ Democracy Together.',
      href: '/a-propos',
      external: false,
    },
    {
      slug: 'donnees',
      label: 'بيانات المؤشر (CSV، CC-BY)',
      description:
        'المؤشر المركّب لأفريقيا وأوروبا في صيغة بيانات مفتوحة، جاهزة للاستشهاد وإعادة الاستخدام.',
      href: '/barometre/data/composite.csv',
      external: true,
    },
    {
      slug: 'codebook',
      label: 'دليل ترميز المؤشر (TXT)',
      description: 'قاموس المتغيرات ومنهجية بناء كل مؤشر فرعي.',
      href: '/barometre/data/codebook.txt',
      external: true,
    },
  ],
};

// Exhaustive table by construction (see `projects-content.ts`).
const BY_LOCALE: Record<Locale, PressKit> = { fr, en, es, pt, ar };

export function getPressKit(locale: Locale): PressKit {
  return BY_LOCALE[locale];
}
