import type { Locale } from '@/i18n/routing';

// Adhésion (F-20) — contenu éditorial porté 1:1 depuis la maquette agence
// `design/rmdl-adhesion.html` (sections autour du formulaire F-22). Cotisation
// SOLIDAIRE (ajustée au niveau de revenu du pays) : pilier d'accessibilité
// Afrique-Europe. Montants = **tarifs indicatifs / illustration** (explicite
// dans la maquette). Module bilingue. Le formulaire reste géré par
// `membership-form.tsx` (namespace i18n `membership`). Vérifié sans terme banni.

export type IncomeLevel = 'high' | 'mid' | 'low';
export type MemberType = 'org' | 'ind' | 'jeu';

// Barème indicatif EUR/an : base par type au revenu élevé, atténuée par palier.
// Affiché tant que le barème RÉEL (table `paymentPlans`, F-27) n'est pas publié.
// Pastilles : « reçu de paiement » et non « reçu fiscal » — l'éligibilité au
// mécénat n'est pas acquise (cf. convex/lib/payments/config.ts).
export const BASE_EUR: Record<MemberType, number> = {
  org: 1200,
  ind: 120,
  jeu: 25,
};
export const INCOME_FACTOR: Record<IncomeLevel, number> = {
  high: 1,
  mid: 0.5,
  low: 0.25,
};

export function estimate(type: MemberType, income: IncomeLevel): number {
  return Math.round((BASE_EUR[type] * INCOME_FACTOR[income]) / 5) * 5;
}

export type MembershipContent = {
  pills: string[];
  intro: { eyebrow: string; title: string; body: string };
  estimator: {
    eyebrow: string;
    title: string;
    body: string;
    incomeLabel: string;
    incomeHint: string;
    incomes: { value: IncomeLevel; label: string; desc: string }[];
    typeLabel: string;
    types: { value: MemberType; label: string; desc: string }[];
    outLabel: string;
    perYear: string;
    ctxTemplate: string; // "{type}, pays à revenu {income}."
    solidarity: string;
  };
  comparison: {
    eyebrow: string;
    title: string;
    body: string;
    caption: string;
    advantageHeader: string;
    tiers: { label: string; sub: string }[];
    rows: { advantage: string; detail: string; cells: string[] }[];
  };
  faq: {
    eyebrow: string;
    title: string;
    body: string;
    items: { q: string; a: string[] }[];
  };
  don: { eyebrow: string; title: string; body: string; cta: string };
  cta: { title: string; body: string; primary: string; secondary: string };
};

const fr: MembershipContent = {
  pills: [
    'Cotisation solidaire',
    'Reçu de paiement',
    'Euro (EUR) ou dollar (USD)',
  ],
  intro: {
    eyebrow: 'Adhésion',
    title: "Choisir un type d'adhésion",
    body: 'Trois profils, trois rôles dans le réseau. Organisations, individus et jeunes de moins de 35 ans : déposez votre candidature, le secrétariat revient vers vous avec la cotisation solidaire adaptée à votre situation.',
  },
  estimator: {
    eyebrow: 'Tarif solidaire',
    title: 'Estimateur de tarif solidaire',
    body: "La cotisation s'ajuste au niveau de revenu du pays de votre organisation ou de votre résidence. Indiquez ces éléments pour obtenir un montant indicatif.",
    incomeLabel: 'Niveau de revenu du pays',
    incomeHint: '(classification indicative)',
    incomes: [
      { value: 'high', label: 'Élevé', desc: 'Revenu élevé' },
      { value: 'mid', label: 'Intermédiaire', desc: 'Revenu moyen' },
      { value: 'low', label: 'Faible', desc: 'Revenu modeste' },
    ],
    typeLabel: "Type d'adhésion",
    types: [
      { value: 'org', label: 'Organisation', desc: 'Think tank' },
      { value: 'ind', label: 'Individuel', desc: 'Chercheur' },
      { value: 'jeu', label: 'Jeune', desc: 'Moins de 35 ans' },
    ],
    outLabel: 'Cotisation annuelle suggérée',
    perYear: 'par an',
    ctxTemplate: '{type}, pays à revenu {income}.',
    solidarity:
      "Tarif solidaire. Ces montants sont indicatifs. La cotisation réelle peut être adaptée à votre situation, sur simple demande au secrétariat, pour qu'aucun frein financier n'empêche d'adhérer.",
  },
  comparison: {
    eyebrow: 'Comparatif',
    title: 'Ce qui est inclus, par type',
    body: 'Les avantages diffèrent selon le rôle de chaque membre dans le réseau. Voici le détail des accès et droits associés.',
    caption: "Comparatif des avantages · données d'illustration",
    advantageHeader: 'Avantage',
    tiers: [
      { label: 'Think tank', sub: 'Organisation' },
      { label: 'Individuel', sub: 'Chercheur · citoyen' },
      { label: 'Jeune', sub: 'Moins de 35 ans' },
    ],
    rows: [
      {
        advantage: "Profil public sur l'annuaire",
        detail: 'Visibilité dans le réseau',
        cells: [
          'Profil organisation détaillé',
          'Profil membre individuel',
          'Profil jeune contributeur',
        ],
      },
      {
        advantage: 'Accès aux publications',
        detail: 'Bibliothèque du réseau',
        cells: [
          'Accès intégral, dont contenus réservés',
          'Accès intégral, dont contenus réservés',
          'Accès intégral en lecture',
        ],
      },
      {
        advantage: 'Publier dans la bibliothèque',
        detail: "Dépôt d'analyses citables",
        cells: [
          'Dépôt institutionnel illimité',
          'Dépôt en tant que contributeur',
          'Via mentorat éditorial',
        ],
      },
      {
        advantage: 'Espaces collaboratifs',
        detail: 'Groupes de travail thématiques',
        cells: [
          'Plusieurs sièges par groupe',
          'Un siège par groupe',
          'Groupes jeunes et observation',
        ],
      },
      {
        advantage: 'Appels à projets et fonds communs',
        detail: 'Financements et co-productions',
        cells: [
          'Éligible et porteur de projet',
          'Éligible en équipe',
          'Bourses jeunes dédiées',
        ],
      },
      {
        advantage: 'Mentorat et formation',
        detail: 'Montée en compétences',
        cells: [
          'Mentor pour les structures émergentes',
          'Ateliers et pairs',
          'Mentorat prioritaire',
        ],
      },
      {
        advantage: 'Voix dans la gouvernance',
        detail: 'Assemblée générale',
        cells: [
          'Voix délibérative',
          'Voix consultative',
          'Voix au conseil des jeunes',
        ],
      },
      {
        advantage: 'Sommet annuel à Paris',
        detail: 'Tarif et places',
        cells: [
          'Plusieurs places, tarif membre',
          'Une place, tarif membre',
          'Places jeunes à tarif réduit',
        ],
      },
    ],
  },
  faq: {
    eyebrow: 'Aide',
    title: 'Questions fréquentes',
    body: 'Cotisation solidaire, reçus fiscaux, modalités de paiement, dons et résiliation.',
    items: [
      {
        q: 'Comment fonctionne la cotisation solidaire ?',
        a: [
          "La cotisation s'ajuste au niveau de revenu du pays de votre organisation ou de votre résidence, selon trois paliers (élevé, intermédiaire, faible). L'objectif est qu'un membre basé à Dakar et un membre basé à Paris contribuent à la hauteur de leurs moyens respectifs, sans que le tarif devienne un obstacle.",
          'Les montants présentés sur cette page sont des tarifs indicatifs. Si votre situation ne correspond à aucun palier, écrivez au secrétariat : nous adaptons la cotisation au cas par cas.',
        ],
      },
      {
        q: 'Le reçu fiscal est-il systématique (association loi 1901) ?',
        a: [
          "Oui. Democracy Together est une association loi 1901. Après chaque paiement de cotisation ou don, un reçu est généré et envoyé automatiquement à l'adresse e-mail indiquée. L'éligibilité à une réduction d'impôt dépend de votre pays de résidence et de votre régime fiscal ; renseignez-vous auprès de votre administration.",
        ],
      },
      {
        q: 'Comment se passe le paiement de la cotisation ?',
        a: [
          'La cotisation et les dons se règlent par carte bancaire, en euro (EUR) ou en dollar des États-Unis (USD), au choix. Le paiement est traité dans la devise choisie ; votre banque applique le cas échéant sa propre conversion.',
          "Vous êtes basé en Afrique de l'Ouest ? Le bureau de Dakar peut vous accompagner pour le règlement et étudier d'autres moyens de paiement locaux.",
        ],
      },
      {
        q: 'Comment fonctionnent les dons et le mécénat ?',
        a: [
          'Vous pouvez soutenir le réseau sans être membre, par un don ponctuel ou régulier. Les organisations intéressées par un partenariat de mécénat (soutien au Baromètre, au sommet de Paris ou au programme jeunes) peuvent contacter le secrétariat pour définir une convention dédiée.',
        ],
      },
      {
        q: 'Comment résilier ou ne pas renouveler mon adhésion ?',
        a: [
          "L'adhésion est annuelle et sans tacite reconduction : elle ne se renouvelle pas automatiquement. Vous recevez un rappel avant l'échéance et choisissez librement de renouveler. Vous pouvez aussi nous écrire à tout moment pour mettre fin à votre adhésion.",
        ],
      },
    ],
  },
  don: {
    eyebrow: 'Sans adhérer',
    title: "Vous n'êtes pas membre ? Soutenez par un don",
    body: "Un don ponctuel ou régulier finance directement la production d'analyses ouvertes, le Baromètre et le mentorat des jeunes contributeurs. Le reçu fiscal est envoyé automatiquement.",
    cta: 'Faire un don',
  },
  cta: {
    title: 'Prêt à rejoindre le réseau ?',
    body: 'Choisissez votre profil, estimez votre cotisation solidaire et adhérez en quelques minutes.',
    primary: 'Choisir mon adhésion',
    secondary: 'Faire un don',
  },
};

const en: MembershipContent = {
  pills: [
    'Solidarity contribution',
    'Payment receipt',
    'Euro (EUR) or US dollar (USD)',
  ],
  intro: {
    eyebrow: 'Membership',
    title: 'Choose a membership type',
    body: 'Three profiles, three roles in the network. Organisations, individuals and under-35s: submit your application, and the secretariat gets back to you with the solidarity contribution suited to your situation.',
  },
  estimator: {
    eyebrow: 'Solidarity pricing',
    title: 'Solidarity pricing estimator',
    body: "The contribution adjusts to the income level of your organisation's or your residence's country. Enter these elements to get an indicative amount.",
    incomeLabel: 'Country income level',
    incomeHint: '(indicative classification)',
    incomes: [
      { value: 'high', label: 'High', desc: 'High income' },
      { value: 'mid', label: 'Middle', desc: 'Middle income' },
      { value: 'low', label: 'Low', desc: 'Modest income' },
    ],
    typeLabel: 'Membership type',
    types: [
      { value: 'org', label: 'Organisation', desc: 'Think tank' },
      { value: 'ind', label: 'Individual', desc: 'Researcher' },
      { value: 'jeu', label: 'Youth', desc: 'Under 35' },
    ],
    outLabel: 'Suggested annual contribution',
    perYear: 'per year',
    ctxTemplate: '{type}, {income}-income country.',
    solidarity:
      'Solidarity pricing. These amounts are indicative. The actual contribution can be adapted to your situation, simply on request to the secretariat, so that no financial barrier prevents you from joining.',
  },
  comparison: {
    eyebrow: 'Comparison',
    title: "What's included, by type",
    body: "Benefits differ by each member's role in the network. Here is the detail of the associated access and rights.",
    caption: 'Benefits comparison · illustration data',
    advantageHeader: 'Benefit',
    tiers: [
      { label: 'Think tank', sub: 'Organisation' },
      { label: 'Individual', sub: 'Researcher · citizen' },
      { label: 'Youth', sub: 'Under 35' },
    ],
    rows: [
      {
        advantage: 'Public directory profile',
        detail: 'Visibility in the network',
        cells: [
          'Detailed organisation profile',
          'Individual member profile',
          'Young contributor profile',
        ],
      },
      {
        advantage: 'Access to publications',
        detail: 'Network library',
        cells: [
          'Full access, incl. reserved content',
          'Full access, incl. reserved content',
          'Full read access',
        ],
      },
      {
        advantage: 'Publish in the library',
        detail: 'Citable analysis deposits',
        cells: [
          'Unlimited institutional deposits',
          'Deposit as a contributor',
          'Via editorial mentoring',
        ],
      },
      {
        advantage: 'Collaborative spaces',
        detail: 'Thematic working groups',
        cells: [
          'Several seats per group',
          'One seat per group',
          'Youth and observer groups',
        ],
      },
      {
        advantage: 'Calls for projects and shared funds',
        detail: 'Funding and co-productions',
        cells: [
          'Eligible and project lead',
          'Eligible in a team',
          'Dedicated youth grants',
        ],
      },
      {
        advantage: 'Mentoring and training',
        detail: 'Building skills',
        cells: [
          'Mentor for emerging structures',
          'Workshops and peers',
          'Priority mentoring',
        ],
      },
      {
        advantage: 'Voice in governance',
        detail: 'General assembly',
        cells: [
          'Deliberative vote',
          'Consultative voice',
          'Voice on the youth council',
        ],
      },
      {
        advantage: 'Annual summit in Paris',
        detail: 'Pricing and seats',
        cells: [
          'Several seats, member rate',
          'One seat, member rate',
          'Youth seats at reduced rate',
        ],
      },
    ],
  },
  faq: {
    eyebrow: 'Help',
    title: 'Frequently asked questions',
    body: 'Solidarity pricing, tax receipts, payment, donations and cancellation.',
    items: [
      {
        q: 'How does solidarity pricing work?',
        a: [
          "The contribution adjusts to the income level of your organisation's or your residence's country, across three tiers (high, middle, low). The goal is that a member based in Dakar and one based in Paris contribute according to their respective means, without the rate becoming an obstacle.",
          'The amounts shown on this page are indicative. If your situation matches no tier, write to the secretariat: we adapt the contribution case by case.',
        ],
      },
      {
        q: 'Is the tax receipt systematic (loi 1901 association)?',
        a: [
          'Yes. Democracy Together is a loi 1901 association. After each contribution or donation payment, a receipt is generated and sent automatically to the email address provided. Eligibility for a tax reduction depends on your country of residence and your tax regime; check with your administration.',
        ],
      },
      {
        q: 'How does contribution payment work?',
        a: [
          'Contributions and donations are paid by bank card, in euro (EUR) or US dollar (USD), as you prefer. Payment is processed in the chosen currency; your bank applies its own conversion if needed.',
          'Based in West Africa? The Dakar office can help you with payment and look into other local payment methods.',
        ],
      },
      {
        q: 'How do donations and patronage work?',
        a: [
          'You can support the network without being a member, through a one-off or recurring donation. Organisations interested in a patronage partnership (support for the Barometer, the Paris summit or the youth programme) can contact the secretariat to define a dedicated agreement.',
        ],
      },
      {
        q: 'How do I cancel or not renew my membership?',
        a: [
          'Membership is annual with no automatic renewal: it does not renew by default. You receive a reminder before the deadline and freely choose to renew. You can also write to us at any time to end your membership.',
        ],
      },
    ],
  },
  don: {
    eyebrow: 'Without joining',
    title: 'Not a member? Support us with a donation',
    body: 'A one-off or recurring donation directly funds the production of open analysis, the Barometer and the mentoring of young contributors. The tax receipt is sent automatically.',
    cta: 'Donate',
  },
  cta: {
    title: 'Ready to join the network?',
    body: 'Choose your profile, estimate your solidarity contribution and join in a few minutes.',
    primary: 'Choose my membership',
    secondary: 'Donate',
  },
};

const es: MembershipContent = {
  pills: ['Cuota solidaria', 'Recibo de pago', 'Euro (EUR) o dólar (USD)'],
  intro: {
    eyebrow: 'Adhesión',
    title: 'Elegir un tipo de adhesión',
    body: 'Tres perfiles, tres papeles en la red. Organizaciones, personas individuales y jóvenes menores de 35 años: presenten su candidatura y la secretaría les responderá con la cuota solidaria adaptada a su situación.',
  },
  estimator: {
    eyebrow: 'Tarifa solidaria',
    title: 'Calculadora de tarifa solidaria',
    body: 'La cuota se ajusta al nivel de renta del país de su organización o de su residencia. Indique estos datos para obtener un importe orientativo.',
    incomeLabel: 'Nivel de renta del país',
    incomeHint: '(clasificación orientativa)',
    incomes: [
      { value: 'high', label: 'Alto', desc: 'Renta alta' },
      { value: 'mid', label: 'Intermedio', desc: 'Renta media' },
      { value: 'low', label: 'Bajo', desc: 'Renta modesta' },
    ],
    typeLabel: 'Tipo de adhesión',
    types: [
      { value: 'org', label: 'Organización', desc: 'Centro de estudios' },
      { value: 'ind', label: 'Individual', desc: 'Investigador' },
      { value: 'jeu', label: 'Joven', desc: 'Menor de 35 años' },
    ],
    outLabel: 'Cuota anual sugerida',
    perYear: 'al año',
    ctxTemplate: '{type}, país de renta {income}.',
    solidarity:
      'Tarifa solidaria. Estos importes son orientativos. La cuota real puede adaptarse a su situación, con una simple solicitud a la secretaría, para que ninguna barrera económica impida adherirse.',
  },
  comparison: {
    eyebrow: 'Comparativa',
    title: 'Lo que incluye cada tipo',
    body: 'Las ventajas difieren según el papel de cada miembro en la red. Este es el detalle de los accesos y derechos asociados.',
    caption: 'Comparativa de ventajas · datos de ilustración',
    advantageHeader: 'Ventaja',
    tiers: [
      { label: 'Centro de estudios', sub: 'Organización' },
      { label: 'Individual', sub: 'Investigador · ciudadano' },
      { label: 'Joven', sub: 'Menor de 35 años' },
    ],
    rows: [
      {
        advantage: 'Perfil público en el directorio',
        detail: 'Visibilidad en la red',
        cells: [
          'Perfil de organización detallado',
          'Perfil de miembro individual',
          'Perfil de joven contribuidor',
        ],
      },
      {
        advantage: 'Acceso a las publicaciones',
        detail: 'Biblioteca de la red',
        cells: [
          'Acceso íntegro, incluidos contenidos reservados',
          'Acceso íntegro, incluidos contenidos reservados',
          'Acceso íntegro de lectura',
        ],
      },
      {
        advantage: 'Publicar en la biblioteca',
        detail: 'Depósito de análisis citables',
        cells: [
          'Depósito institucional ilimitado',
          'Depósito como contribuidor',
          'Mediante mentoría editorial',
        ],
      },
      {
        advantage: 'Espacios colaborativos',
        detail: 'Grupos de trabajo temáticos',
        cells: [
          'Varias plazas por grupo',
          'Una plaza por grupo',
          'Grupos jóvenes y observación',
        ],
      },
      {
        advantage: 'Convocatorias y fondos comunes',
        detail: 'Financiación y coproducciones',
        cells: [
          'Elegible y promotor de proyecto',
          'Elegible en equipo',
          'Becas específicas para jóvenes',
        ],
      },
      {
        advantage: 'Mentoría y formación',
        detail: 'Desarrollo de competencias',
        cells: [
          'Mentor para estructuras emergentes',
          'Talleres y pares',
          'Mentoría prioritaria',
        ],
      },
      {
        advantage: 'Voz en la gobernanza',
        detail: 'Asamblea general',
        cells: [
          'Voto deliberativo',
          'Voz consultiva',
          'Voz en el consejo de jóvenes',
        ],
      },
      {
        advantage: 'Cumbre anual en París',
        detail: 'Tarifa y plazas',
        cells: [
          'Varias plazas, tarifa de miembro',
          'Una plaza, tarifa de miembro',
          'Plazas para jóvenes a tarifa reducida',
        ],
      },
    ],
  },
  faq: {
    eyebrow: 'Ayuda',
    title: 'Preguntas frecuentes',
    body: 'Cuota solidaria, recibos fiscales, formas de pago, donaciones y baja.',
    items: [
      {
        q: '¿Cómo funciona la cuota solidaria?',
        a: [
          'La cuota se ajusta al nivel de renta del país de su organización o de su residencia, según tres tramos (alto, intermedio, bajo). El objetivo es que un miembro con sede en Dakar y otro con sede en París contribuyan en la medida de sus respectivos medios, sin que la tarifa se convierta en un obstáculo.',
          'Los importes que figuran en esta página son orientativos. Si su situación no encaja en ningún tramo, escriba a la secretaría: adaptamos la cuota caso por caso.',
        ],
      },
      {
        q: '¿El recibo fiscal es automático (asociación loi 1901)?',
        a: [
          'Sí. Democracy Together es una asociación francesa de tipo loi 1901. Después de cada pago de cuota o donación, se genera un recibo que se envía automáticamente a la dirección de correo indicada. La posibilidad de una deducción fiscal depende de su país de residencia y de su régimen tributario; infórmese en su administración.',
        ],
      },
      {
        q: '¿Cómo se paga la cuota?',
        a: [
          'La cuota y las donaciones se abonan con tarjeta bancaria, en euros (EUR) o en dólares estadounidenses (USD), a su elección. El pago se tramita en la divisa elegida; su banco aplicará, en su caso, su propia conversión.',
          '¿Reside en África Occidental? La oficina de Dakar puede acompañarle en el pago y estudiar otros medios de pago locales.',
        ],
      },
      {
        q: '¿Cómo funcionan las donaciones y el mecenazgo?',
        a: [
          'Puede apoyar a la red sin ser miembro, mediante una donación puntual o periódica. Las organizaciones interesadas en un acuerdo de mecenazgo (apoyo al Barómetro, a la cumbre de París o al programa joven) pueden contactar con la secretaría para definir un convenio específico.',
        ],
      },
      {
        q: '¿Cómo doy de baja o no renuevo mi adhesión?',
        a: [
          'La adhesión es anual y sin renovación tácita: no se renueva automáticamente. Recibirá un aviso antes del vencimiento y decidirá libremente si renueva. También puede escribirnos en cualquier momento para poner fin a su adhesión.',
        ],
      },
    ],
  },
  don: {
    eyebrow: 'Sin adherirse',
    title: '¿No es miembro? Apoye con una donación',
    body: 'Una donación puntual o periódica financia directamente la producción de análisis abiertos, el Barómetro y la mentoría de jóvenes contribuidores. El recibo fiscal se envía automáticamente.',
    cta: 'Hacer una donación',
  },
  cta: {
    title: '¿Listo para unirse a la red?',
    body: 'Elija su perfil, calcule su cuota solidaria y adhiérase en unos minutos.',
    primary: 'Elegir mi adhesión',
    secondary: 'Hacer una donación',
  },
};
const pt: MembershipContent = {
  pills: [
    'Quota solidária',
    'Recibo de pagamento',
    'Euro (EUR) ou dólar (USD)',
  ],
  intro: {
    eyebrow: 'Adesão',
    title: 'Escolher um tipo de adesão',
    body: 'Três perfis, três papéis na rede. Organizações, pessoas individuais e jovens com menos de 35 anos: apresentem a vossa candidatura e o secretariado responderá com a quota solidária adaptada à vossa situação.',
  },
  estimator: {
    eyebrow: 'Tarifa solidária',
    title: 'Simulador de tarifa solidária',
    body: 'A quota ajusta-se ao nível de rendimento do país da sua organização ou da sua residência. Indique estes elementos para obter um montante indicativo.',
    incomeLabel: 'Nível de rendimento do país',
    incomeHint: '(classificação indicativa)',
    incomes: [
      { value: 'high', label: 'Elevado', desc: 'Rendimento elevado' },
      { value: 'mid', label: 'Intermédio', desc: 'Rendimento médio' },
      { value: 'low', label: 'Baixo', desc: 'Rendimento modesto' },
    ],
    typeLabel: 'Tipo de adesão',
    types: [
      { value: 'org', label: 'Organização', desc: 'Centro de estudos' },
      { value: 'ind', label: 'Individual', desc: 'Investigador' },
      { value: 'jeu', label: 'Jovem', desc: 'Menos de 35 anos' },
    ],
    outLabel: 'Quota anual sugerida',
    perYear: 'por ano',
    ctxTemplate: '{type}, país de rendimento {income}.',
    solidarity:
      'Tarifa solidária. Estes montantes são indicativos. A quota real pode ser adaptada à sua situação, mediante simples pedido ao secretariado, para que nenhum obstáculo financeiro impeça a adesão.',
  },
  comparison: {
    eyebrow: 'Comparativo',
    title: 'O que está incluído, por tipo',
    body: 'As vantagens diferem consoante o papel de cada membro na rede. Eis o detalhe dos acessos e direitos associados.',
    caption: 'Comparativo de vantagens · dados de ilustração',
    advantageHeader: 'Vantagem',
    tiers: [
      { label: 'Centro de estudos', sub: 'Organização' },
      { label: 'Individual', sub: 'Investigador · cidadão' },
      { label: 'Jovem', sub: 'Menos de 35 anos' },
    ],
    rows: [
      {
        advantage: 'Perfil público no diretório',
        detail: 'Visibilidade na rede',
        cells: [
          'Perfil de organização detalhado',
          'Perfil de membro individual',
          'Perfil de jovem contribuidor',
        ],
      },
      {
        advantage: 'Acesso às publicações',
        detail: 'Biblioteca da rede',
        cells: [
          'Acesso integral, incluindo conteúdos reservados',
          'Acesso integral, incluindo conteúdos reservados',
          'Acesso integral de leitura',
        ],
      },
      {
        advantage: 'Publicar na biblioteca',
        detail: 'Depósito de análises citáveis',
        cells: [
          'Depósito institucional ilimitado',
          'Depósito enquanto contribuidor',
          'Através de mentoria editorial',
        ],
      },
      {
        advantage: 'Espaços colaborativos',
        detail: 'Grupos de trabalho temáticos',
        cells: [
          'Vários lugares por grupo',
          'Um lugar por grupo',
          'Grupos jovens e observação',
        ],
      },
      {
        advantage: 'Convites a projetos e fundos comuns',
        detail: 'Financiamentos e coproduções',
        cells: [
          'Elegível e promotor de projeto',
          'Elegível em equipa',
          'Bolsas dedicadas a jovens',
        ],
      },
      {
        advantage: 'Mentoria e formação',
        detail: 'Reforço de competências',
        cells: [
          'Mentor para estruturas emergentes',
          'Oficinas e pares',
          'Mentoria prioritária',
        ],
      },
      {
        advantage: 'Voz na governação',
        detail: 'Assembleia geral',
        cells: [
          'Voto deliberativo',
          'Voz consultiva',
          'Voz no conselho de jovens',
        ],
      },
      {
        advantage: 'Cimeira anual em Paris',
        detail: 'Tarifa e lugares',
        cells: [
          'Vários lugares, tarifa de membro',
          'Um lugar, tarifa de membro',
          'Lugares para jovens a tarifa reduzida',
        ],
      },
    ],
  },
  faq: {
    eyebrow: 'Ajuda',
    title: 'Perguntas frequentes',
    body: 'Quota solidária, recibos fiscais, formas de pagamento, donativos e cessação.',
    items: [
      {
        q: 'Como funciona a quota solidária?',
        a: [
          'A quota ajusta-se ao nível de rendimento do país da sua organização ou da sua residência, segundo três escalões (elevado, intermédio, baixo). O objetivo é que um membro sediado em Dakar e outro sediado em Paris contribuam na medida dos seus meios respetivos, sem que a tarifa se torne um obstáculo.',
          'Os montantes apresentados nesta página são indicativos. Se a sua situação não corresponder a nenhum escalão, escreva ao secretariado: adaptamos a quota caso a caso.',
        ],
      },
      {
        q: 'O recibo fiscal é automático (associação loi 1901)?',
        a: [
          'Sim. A Democracy Together é uma associação francesa do tipo loi 1901. Após cada pagamento de quota ou donativo, é gerado um recibo e enviado automaticamente para o endereço de correio eletrónico indicado. A elegibilidade para uma dedução fiscal depende do seu país de residência e do seu regime fiscal; informe-se junto da sua administração.',
        ],
      },
      {
        q: 'Como se paga a quota?',
        a: [
          'A quota e os donativos são pagos com cartão bancário, em euros (EUR) ou em dólares dos Estados Unidos (USD), à sua escolha. O pagamento é processado na moeda escolhida; o seu banco aplicará, se for caso disso, a sua própria conversão.',
          'Reside na África Ocidental? O escritório de Dakar pode acompanhá-lo no pagamento e estudar outros meios de pagamento locais.',
        ],
      },
      {
        q: 'Como funcionam os donativos e o mecenato?',
        a: [
          'Pode apoiar a rede sem ser membro, através de um donativo pontual ou regular. As organizações interessadas numa parceria de mecenato (apoio ao Barómetro, à cimeira de Paris ou ao programa jovem) podem contactar o secretariado para definir uma convenção dedicada.',
        ],
      },
      {
        q: 'Como cesso ou não renovo a minha adesão?',
        a: [
          'A adesão é anual e sem renovação tácita: não se renova automaticamente. Recebe um aviso antes do termo e decide livremente se renova. Pode também escrever-nos a qualquer momento para pôr fim à sua adesão.',
        ],
      },
    ],
  },
  don: {
    eyebrow: 'Sem aderir',
    title: 'Não é membro? Apoie com um donativo',
    body: 'Um donativo pontual ou regular financia diretamente a produção de análises abertas, o Barómetro e a mentoria de jovens contribuidores. O recibo fiscal é enviado automaticamente.',
    cta: 'Fazer um donativo',
  },
  cta: {
    title: 'Pronto para se juntar à rede?',
    body: 'Escolha o seu perfil, estime a sua quota solidária e adira em poucos minutos.',
    primary: 'Escolher a minha adesão',
    secondary: 'Fazer um donativo',
  },
};
const ar: MembershipContent = {
  pills: ['اشتراك تضامني', 'وصل أداء', 'اليورو (EUR) أو الدولار (USD)'],
  intro: {
    eyebrow: 'الانضمام',
    title: 'اختيار نوع العضوية',
    body: 'ثلاثة أنماط، وثلاثة أدوار داخل الشبكة. منظمات وأفراد وشباب دون الخامسة والثلاثين: قدّموا ترشيحكم، وستعود إليكم الأمانة بالاشتراك التضامني الملائم لوضعكم.',
  },
  estimator: {
    eyebrow: 'التعرفة التضامنية',
    title: 'حاسبة التعرفة التضامنية',
    body: 'يتكيّف الاشتراك مع مستوى دخل بلد منظمتكم أو بلد إقامتكم. حدّدوا هذين العنصرين للحصول على مبلغ تقريبي.',
    incomeLabel: 'مستوى دخل البلد',
    incomeHint: '(تصنيف تقريبي)',
    incomes: [
      { value: 'high', label: 'مرتفع', desc: 'دخل مرتفع' },
      { value: 'mid', label: 'متوسط', desc: 'دخل متوسط' },
      { value: 'low', label: 'منخفض', desc: 'دخل محدود' },
    ],
    typeLabel: 'نوع العضوية',
    types: [
      { value: 'org', label: 'منظمة', desc: 'مركز دراسات' },
      { value: 'ind', label: 'فردية', desc: 'باحث' },
      { value: 'jeu', label: 'شاب', desc: 'دون 35 سنة' },
    ],
    outLabel: 'الاشتراك السنوي المقترح',
    perYear: 'في السنة',
    ctxTemplate: '{type}، بلد ذو دخل {income}.',
    solidarity:
      'تعرفة تضامنية. هذه المبالغ تقريبية، ويمكن تكييف الاشتراك الفعلي مع وضعكم بمجرد طلب يوجَّه إلى الأمانة، حتى لا يحول أي عائق مالي دون الانضمام.',
  },
  comparison: {
    eyebrow: 'مقارنة',
    title: 'ما يشمله كل نوع',
    body: 'تختلف المزايا باختلاف دور كل عضو داخل الشبكة. وفيما يلي تفصيل الخدمات والحقوق المرتبطة بها.',
    caption: 'مقارنة المزايا · بيانات توضيحية',
    advantageHeader: 'الميزة',
    tiers: [
      { label: 'مركز دراسات', sub: 'منظمة' },
      { label: 'فردية', sub: 'باحث · مواطن' },
      { label: 'شاب', sub: 'دون 35 سنة' },
    ],
    rows: [
      {
        advantage: 'ملف عمومي في الدليل',
        detail: 'الحضور داخل الشبكة',
        cells: ['ملف منظمة مفصَّل', 'ملف عضو فردي', 'ملف مساهم شاب'],
      },
      {
        advantage: 'النفاذ إلى المنشورات',
        detail: 'مكتبة الشبكة',
        cells: [
          'نفاذ كامل، بما في ذلك المحتويات المحجوزة',
          'نفاذ كامل، بما في ذلك المحتويات المحجوزة',
          'نفاذ كامل للقراءة',
        ],
      },
      {
        advantage: 'النشر في المكتبة',
        detail: 'إيداع تحليلات قابلة للاستشهاد',
        cells: [
          'إيداع مؤسسي غير محدود',
          'إيداع بصفة مساهم',
          'عبر التوجيه التحريري',
        ],
      },
      {
        advantage: 'فضاءات العمل المشترك',
        detail: 'مجموعات عمل مواضيعية',
        cells: [
          'عدة مقاعد في كل مجموعة',
          'مقعد واحد في كل مجموعة',
          'مجموعات الشباب وصفة الملاحظ',
        ],
      },
      {
        advantage: 'الدعوات إلى المشاريع والصناديق المشتركة',
        detail: 'تمويلات وإنتاج مشترك',
        cells: ['مؤهَّل وصاحب مشروع', 'مؤهَّل ضمن فريق', 'منح مخصصة للشباب'],
      },
      {
        advantage: 'التوجيه والتكوين',
        detail: 'تطوير الكفاءات',
        cells: [
          'موجِّه للهياكل الناشئة',
          'ورشات وتبادل بين الأقران',
          'توجيه بالأولوية',
        ],
      },
      {
        advantage: 'صوت في الحوكمة',
        detail: 'الجمع العام',
        cells: ['صوت تقريري', 'صوت استشاري', 'صوت في مجلس الشباب'],
      },
      {
        advantage: 'القمة السنوية بباريس',
        detail: 'التعرفة والمقاعد',
        cells: [
          'عدة مقاعد بتعرفة الأعضاء',
          'مقعد واحد بتعرفة الأعضاء',
          'مقاعد للشباب بتعرفة مخفَّضة',
        ],
      },
    ],
  },
  faq: {
    eyebrow: 'مساعدة',
    title: 'أسئلة متكررة',
    body: 'الاشتراك التضامني، والوصولات الضريبية، وطرق الأداء، والتبرعات، وإنهاء العضوية.',
    items: [
      {
        q: 'كيف يشتغل الاشتراك التضامني؟',
        a: [
          'يتكيّف الاشتراك مع مستوى دخل بلد منظمتكم أو بلد إقامتكم، وفق ثلاث شرائح (مرتفع، متوسط، منخفض). والهدف أن يساهم عضو مقيم بداكار وعضو مقيم بباريس كل بقدر إمكاناته، دون أن تصير التعرفة عائقاً.',
          'المبالغ المعروضة في هذه الصفحة تقريبية. وإذا لم يوافق وضعكم أي شريحة، فاكتبوا إلى الأمانة: نكيّف الاشتراك حالة بحالة.',
        ],
      },
      {
        q: 'هل الوصل الضريبي تلقائي (جمعية خاضعة لقانون 1901)؟',
        a: [
          'نعم. Democracy Together جمعية فرنسية خاضعة لقانون 1901. وبعد كل أداء لاشتراك أو تبرع، يُصدَر وصل ويُرسَل تلقائياً إلى عنوان البريد الإلكتروني المصرَّح به. أما أهلية الاستفادة من تخفيض ضريبي فتتوقف على بلد إقامتكم وعلى نظامكم الجبائي؛ استعلموا لدى إدارتكم.',
        ],
      },
      {
        q: 'كيف يتم أداء الاشتراك؟',
        a: [
          'يُؤدى الاشتراك وتُؤدى التبرعات بالبطاقة المصرفية، باليورو (EUR) أو بالدولار الأمريكي (USD)، حسب اختياركم. تُعالَج العملية بالعملة المختارة؛ ويطبّق بنككم عند الاقتضاء سعر صرفه الخاص.',
          'هل تقيمون في غرب أفريقيا؟ يمكن لمكتب داكار مرافقتكم في الأداء ودراسة وسائل دفع محلية أخرى.',
        ],
      },
      {
        q: 'كيف تشتغل التبرعات والرعاية؟',
        a: [
          'يمكنكم دعم الشبكة دون أن تكونوا أعضاء، بتبرع ظرفي أو منتظم. أما المنظمات المهتمة بشراكة رعاية (دعم المؤشر أو قمة باريس أو برنامج الشباب) فيمكنها الاتصال بالأمانة لتحديد اتفاقية خاصة.',
        ],
      },
      {
        q: 'كيف أنهي عضويتي أو لا أجدّدها؟',
        a: [
          'العضوية سنوية وبلا تجديد ضمني: فهي لا تتجدد تلقائياً. تصلكم رسالة تذكير قبل حلول الأجل وتختارون بحرية التجديد من عدمه. ويمكنكم أيضاً مراسلتنا في أي وقت لإنهاء عضويتكم.',
        ],
      },
    ],
  },
  don: {
    eyebrow: 'دون انضمام',
    title: 'لستم أعضاء؟ ادعموا بتبرع',
    body: 'التبرع الظرفي أو المنتظم يموّل مباشرةً إنتاج تحليلات مفتوحة، والمؤشر، وتوجيه المساهمين الشباب. ويُرسَل الوصل الضريبي تلقائياً.',
    cta: 'تبرّعوا',
  },
  cta: {
    title: 'هل أنتم مستعدون للانضمام إلى الشبكة؟',
    body: 'اختاروا نمطكم، وقدّروا اشتراككم التضامني، وانضموا في بضع دقائق.',
    primary: 'اختيار عضويتي',
    secondary: 'تبرّعوا',
  },
};

// Table exhaustive par construction (cf. `projects-content.ts`).
const BY_LOCALE: Record<Locale, MembershipContent> = { fr, en, es, pt, ar };

export function getMembershipContent(locale: Locale): MembershipContent {
  return BY_LOCALE[locale];
}
