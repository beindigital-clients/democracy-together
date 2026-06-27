// F-14 — Partenaires & soutiens. Page publique sans backend Convex : contenu
// éditorial local bilingue (même approche que `reports-content.ts` /
// `themes-content.ts`). On décrit des CATÉGORIES / niveaux de partenariat — ce
// que chaque type de partenaire APPORTE au réseau et ce qu'il en REÇOIT —
// SANS jamais nommer d'organisation ni inventer de logo. Positions et rôles,
// pas de chiffres ni de noms. Vérifié sans terme banni.

export type PartnerCategory = {
  slug: string;
  kicker: string; // intitulé court (ex. « Institutions »)
  title: string;
  summary: string;
  gives: string; // ce que ce partenaire apporte au réseau
  gets: string; // ce que le réseau lui apporte en retour
};

// Slugs neutres (partagés fr/en), ordre d'affichage.
export const PARTNER_SLUGS = [
  'institutions',
  'fondations',
  'think-tanks',
  'medias',
  'techniques',
] as const;

export type PartnerSlug = (typeof PARTNER_SLUGS)[number];

const fr: Record<PartnerSlug, PartnerCategory> = {
  institutions: {
    slug: 'institutions',
    kicker: 'Institutions publiques',
    title: 'Institutions publiques & organisations multilatérales',
    summary:
      "Acteurs publics, agences de coopération et organisations internationales engagés sur la gouvernance démocratique en Afrique et en Europe.",
    gives:
      "Un ancrage institutionnel, l'accès à des données publiques et la possibilité de relier les travaux du réseau aux politiques réelles. Leur participation crédibilise la comparaison sans en dicter les conclusions.",
    gets:
      "Une analyse indépendante et bicontinentale, des synthèses méthodiques sur leurs domaines et un espace neutre de dialogue entre praticiens africains et européens.",
  },
  fondations: {
    slug: 'fondations',
    kicker: 'Fondations & mécènes',
    title: 'Fondations & mécènes',
    summary:
      "Fondations, philanthropes et mécènes qui financent la recherche d'intérêt général et l'indépendance éditoriale du réseau.",
    gives:
      "Un soutien financier pluriannuel qui rend possible un travail de fond, libéré de la pression du court terme. Leur appui finance la méthode — données ouvertes, relecture scientifique — plutôt que des conclusions attendues.",
    gets:
      "Un impact mesurable sur le débat démocratique, des livrables citables en accès ouvert et la transparence sur l'usage des fonds, condition de la confiance.",
  },
  'think-tanks': {
    slug: 'think-tanks',
    kicker: 'Think tanks membres',
    title: 'Think tanks & centres de recherche membres',
    summary:
      "Les organisations membres qui composent le réseau : think tanks, laboratoires et centres de recherche d'Afrique et d'Europe.",
    gives:
      "L'expertise de terrain et les publications qui nourrissent la bibliothèque commune et les synthèses thématiques. Ce sont eux qui produisent la matière : le réseau ne fait que la relier et la mettre en perspective.",
    gets:
      "Une visibilité au-delà de leurs frontières, des cadres de comparaison partagés et une infrastructure commune — bibliothèque, annuaire, baromètre — qu'aucun centre ne porterait seul.",
  },
  medias: {
    slug: 'medias',
    kicker: 'Médias & diffusion',
    title: 'Médias & partenaires de diffusion',
    summary:
      "Rédactions, médias spécialisés et plateformes de diffusion qui relaient les travaux du réseau vers un public plus large.",
    gives:
      "Une portée éditoriale et la capacité de traduire des analyses exigeantes en récits accessibles, sans les déformer. La diffusion fait sortir la recherche du cercle des spécialistes.",
    gets:
      "Une source rigoureuse, des données vérifiables et un regard croisé Afrique-Europe sur des sujets souvent traités à l'échelle d'un seul pays.",
  },
  techniques: {
    slug: 'techniques',
    kicker: 'Partenaires techniques',
    title: 'Partenaires techniques & open source',
    summary:
      "Contributeurs techniques, fournisseurs d'outils et communautés open source qui soutiennent l'infrastructure numérique du réseau.",
    gives:
      "Des compétences techniques, des outils et des bonnes pratiques — accessibilité, données ouvertes, sécurité — qui font tenir une plateforme sobre et durable.",
    gets:
      "Un cas d'usage d'intérêt général, une mise en avant de leurs contributions et un partenaire attaché à la transparence du code et des méthodes.",
  },
};

const en: Record<PartnerSlug, PartnerCategory> = {
  institutions: {
    slug: 'institutions',
    kicker: 'Public institutions',
    title: 'Public institutions & multilateral organisations',
    summary:
      'Public bodies, cooperation agencies and international organisations engaged in democratic governance across Africa and Europe.',
    gives:
      "An institutional anchor, access to public data and a way to connect the network's work to real policy. Their involvement lends credibility to the comparison without dictating its conclusions.",
    gets:
      'An independent, two-continent analysis, methodical syntheses on their fields and a neutral space for dialogue between African and European practitioners.',
  },
  fondations: {
    slug: 'fondations',
    kicker: 'Foundations & patrons',
    title: 'Foundations & patrons',
    summary:
      "Foundations, philanthropists and patrons funding public-interest research and the network's editorial independence.",
    gives:
      'Multi-year financial support that makes in-depth work possible, free from short-term pressure. Their backing funds the method — open data, scientific review — rather than expected conclusions.',
    gets:
      'A measurable impact on democratic debate, citable open-access outputs and transparency on how funds are used, the condition of trust.',
  },
  'think-tanks': {
    slug: 'think-tanks',
    kicker: 'Member think tanks',
    title: 'Member think tanks & research centres',
    summary:
      'The member organisations that make up the network: think tanks, labs and research centres from Africa and Europe.',
    gives:
      'The field expertise and publications that feed the shared library and the thematic syntheses. They produce the substance; the network only links it and puts it in perspective.',
    gets:
      'Visibility beyond their borders, shared comparison frameworks and a common infrastructure — library, directory, barometer — that no single centre would build alone.',
  },
  medias: {
    slug: 'medias',
    kicker: 'Media & distribution',
    title: 'Media & distribution partners',
    summary:
      "Newsrooms, specialist media and distribution platforms that carry the network's work to a wider audience.",
    gives:
      'Editorial reach and the ability to turn demanding analysis into accessible stories without distorting it. Distribution takes research beyond the circle of specialists.',
    gets:
      'A rigorous source, verifiable data and a cross Africa-Europe perspective on topics often covered within a single country.',
  },
  techniques: {
    slug: 'techniques',
    kicker: 'Technical partners',
    title: 'Technical & open-source partners',
    summary:
      "Technical contributors, tool providers and open-source communities supporting the network's digital infrastructure.",
    gives:
      'Technical skills, tools and good practices — accessibility, open data, security — that keep a lean, durable platform standing.',
    gets:
      'A public-interest use case, recognition of their contributions and a partner committed to transparency of code and methods.',
  },
};

export function getPartners(locale: 'fr' | 'en'): PartnerCategory[] {
  const table = locale === 'en' ? en : fr;
  return PARTNER_SLUGS.map((s) => table[s]);
}

export function getPartner(
  locale: 'fr' | 'en',
  slug: string,
): PartnerCategory | null {
  const table = locale === 'en' ? en : fr;
  return (PARTNER_SLUGS as readonly string[]).includes(slug)
    ? table[slug as PartnerSlug]
    : null;
}
