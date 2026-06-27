// Adhésion (F-20) — contenu éditorial porté 1:1 depuis la maquette agence
// `design/rmdl-adhesion.html` (sections autour du formulaire F-22). Cotisation
// SOLIDAIRE (ajustée au niveau de revenu du pays) : pilier d'accessibilité
// Afrique-Europe. Montants = **tarifs indicatifs / illustration** (explicite
// dans la maquette). Module bilingue. Le formulaire reste géré par
// `membership-form.tsx` (namespace i18n `membership`). Vérifié sans terme banni.

export type IncomeLevel = 'high' | 'mid' | 'low';
export type MemberType = 'org' | 'ind' | 'jeu';

// Barème indicatif EUR/an : base par type au revenu élevé, atténuée par palier.
export const BASE_EUR: Record<MemberType, number> = { org: 1200, ind: 120, jeu: 25 };
export const INCOME_FACTOR: Record<IncomeLevel, number> = { high: 1, mid: 0.5, low: 0.25 };
export const XOF_PER_EUR = 655;

export function estimate(type: MemberType, income: IncomeLevel, currency: 'EUR' | 'XOF'): number {
  const eur = Math.round((BASE_EUR[type] * INCOME_FACTOR[income]) / 5) * 5;
  return currency === 'XOF' ? eur * XOF_PER_EUR : eur;
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
    currencyLabel: string;
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
  faq: { eyebrow: string; title: string; body: string; items: { q: string; a: string[] }[] };
  don: { eyebrow: string; title: string; body: string; cta: string };
  cta: { title: string; body: string; primary: string; secondary: string };
};

const fr: MembershipContent = {
  pills: ['Cotisation solidaire', 'Reçu fiscal · loi 1901', 'Paiement EUR ou XOF'],
  intro: {
    eyebrow: 'Adhésion',
    title: "Choisir un type d'adhésion",
    body: "Trois profils, trois rôles dans le réseau. Organisations, individus et jeunes de moins de 35 ans : déposez votre candidature, le secrétariat revient vers vous avec la cotisation solidaire adaptée à votre situation.",
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
    currencyLabel: 'Devise de paiement',
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
      { advantage: "Profil public sur l'annuaire", detail: 'Visibilité dans le réseau', cells: ['Profil organisation détaillé', 'Profil membre individuel', 'Profil jeune contributeur'] },
      { advantage: 'Accès aux publications', detail: 'Bibliothèque du réseau', cells: ['Accès intégral, dont contenus réservés', 'Accès intégral, dont contenus réservés', 'Accès intégral en lecture'] },
      { advantage: 'Publier dans la bibliothèque', detail: "Dépôt d'analyses citables", cells: ['Dépôt institutionnel illimité', 'Dépôt en tant que contributeur', 'Via mentorat éditorial'] },
      { advantage: 'Espaces collaboratifs', detail: 'Groupes de travail thématiques', cells: ['Plusieurs sièges par groupe', 'Un siège par groupe', 'Groupes jeunes et observation'] },
      { advantage: 'Appels à projets et fonds communs', detail: 'Financements et co-productions', cells: ['Éligible et porteur de projet', 'Éligible en équipe', 'Bourses jeunes dédiées'] },
      { advantage: 'Mentorat et formation', detail: 'Montée en compétences', cells: ['Mentor pour les structures émergentes', 'Ateliers et pairs', 'Mentorat prioritaire'] },
      { advantage: 'Voix dans la gouvernance', detail: 'Assemblée générale', cells: ['Voix délibérative', 'Voix consultative', 'Voix au conseil des jeunes'] },
      { advantage: 'Sommet annuel à Paris', detail: 'Tarif et places', cells: ['Plusieurs places, tarif membre', 'Une place, tarif membre', 'Places jeunes à tarif réduit'] },
    ],
  },
  faq: {
    eyebrow: 'Aide',
    title: 'Questions fréquentes',
    body: "Cotisation solidaire, reçus fiscaux, paiement en Afrique de l'Ouest, dons et résiliation.",
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
        q: "Puis-je payer en XOF depuis l'Afrique de l'Ouest ?",
        a: [
          "Oui. Le paiement est possible en euro (EUR) ou en franc CFA (XOF). Pour l'Afrique de l'Ouest, nous acceptons le règlement en XOF, avec une conversion approximative de 1 EUR pour environ 655 XOF. Le bureau de Dakar peut aussi proposer d'autres moyens de paiement locaux.",
          "La conversion affichée par l'estimateur est indicative et peut différer légèrement du montant final selon le canal de paiement.",
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
  pills: ['Solidarity contribution', 'Tax receipt · loi 1901', 'Pay in EUR or XOF'],
  intro: {
    eyebrow: 'Membership',
    title: 'Choose a membership type',
    body: 'Three profiles, three roles in the network. Organisations, individuals and under-35s: submit your application, and the secretariat gets back to you with the solidarity contribution suited to your situation.',
  },
  estimator: {
    eyebrow: 'Solidarity pricing',
    title: 'Solidarity pricing estimator',
    body: 'The contribution adjusts to the income level of your organisation\'s or your residence\'s country. Enter these elements to get an indicative amount.',
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
    currencyLabel: 'Payment currency',
    outLabel: 'Suggested annual contribution',
    perYear: 'per year',
    ctxTemplate: '{type}, {income}-income country.',
    solidarity:
      "Solidarity pricing. These amounts are indicative. The actual contribution can be adapted to your situation, simply on request to the secretariat, so that no financial barrier prevents you from joining.",
  },
  comparison: {
    eyebrow: 'Comparison',
    title: "What's included, by type",
    body: 'Benefits differ by each member\'s role in the network. Here is the detail of the associated access and rights.',
    caption: 'Benefits comparison · illustration data',
    advantageHeader: 'Benefit',
    tiers: [
      { label: 'Think tank', sub: 'Organisation' },
      { label: 'Individual', sub: 'Researcher · citizen' },
      { label: 'Youth', sub: 'Under 35' },
    ],
    rows: [
      { advantage: 'Public directory profile', detail: 'Visibility in the network', cells: ['Detailed organisation profile', 'Individual member profile', 'Young contributor profile'] },
      { advantage: 'Access to publications', detail: 'Network library', cells: ['Full access, incl. reserved content', 'Full access, incl. reserved content', 'Full read access'] },
      { advantage: 'Publish in the library', detail: 'Citable analysis deposits', cells: ['Unlimited institutional deposits', 'Deposit as a contributor', 'Via editorial mentoring'] },
      { advantage: 'Collaborative spaces', detail: 'Thematic working groups', cells: ['Several seats per group', 'One seat per group', 'Youth and observer groups'] },
      { advantage: 'Calls for projects and shared funds', detail: 'Funding and co-productions', cells: ['Eligible and project lead', 'Eligible in a team', 'Dedicated youth grants'] },
      { advantage: 'Mentoring and training', detail: 'Building skills', cells: ['Mentor for emerging structures', 'Workshops and peers', 'Priority mentoring'] },
      { advantage: 'Voice in governance', detail: 'General assembly', cells: ['Deliberative vote', 'Consultative voice', 'Voice on the youth council'] },
      { advantage: 'Annual summit in Paris', detail: 'Pricing and seats', cells: ['Several seats, member rate', 'One seat, member rate', 'Youth seats at reduced rate'] },
    ],
  },
  faq: {
    eyebrow: 'Help',
    title: 'Frequently asked questions',
    body: 'Solidarity pricing, tax receipts, payment in West Africa, donations and cancellation.',
    items: [
      {
        q: 'How does solidarity pricing work?',
        a: [
          'The contribution adjusts to the income level of your organisation\'s or your residence\'s country, across three tiers (high, middle, low). The goal is that a member based in Dakar and one based in Paris contribute according to their respective means, without the rate becoming an obstacle.',
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
        q: 'Can I pay in XOF from West Africa?',
        a: [
          'Yes. Payment is possible in euro (EUR) or CFA franc (XOF). For West Africa, we accept payment in XOF, with an approximate conversion of 1 EUR for about 655 XOF. The Dakar office can also offer other local payment methods.',
          'The conversion shown by the estimator is indicative and may differ slightly from the final amount depending on the payment channel.',
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

export function getMembershipContent(locale: 'fr' | 'en'): MembershipContent {
  return locale === 'en' ? en : fr;
}
