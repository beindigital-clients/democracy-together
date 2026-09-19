// F-60 — Appels à projets collaboratifs. Présentation HONNÊTE du dispositif :
// le principe des projets menés en commun entre think tanks et contributeurs du
// réseau. Aucun appel daté ni financement chiffré n'est inventé ici — on décrit
// le cadre (axes éligibles, critères qualitatifs, accompagnement) et la voie de
// proposition ouverte aux membres. Les axes éligibles sont le miroir des cinq
// axes du réseau (PUB_THEMES) ; les libellés viennent de l'i18n
// (`library.themes.*`). Module local bilingue (même approche que
// `themes-content.ts`). Vérifié sans terme banni.

export type ProjectsIntro = {
  // Principe du dispositif : ce qu'est un projet collaboratif dans le réseau.
  principle: string[];
  // Axes éligibles (cadre, pas une liste d'appels) — chapeau + slugs des 5 axes.
  scopeLead: string;
  // Critères qualitatifs de sélection (pas de barème chiffré inventé).
  criteria: { title: string; body: string }[];
  // Ce que le réseau apporte concrètement à un projet retenu.
  support: { title: string; body: string }[];
  // Précision honnête : pas d'appel en cours / pas de montant annoncé ici.
  disclaimer: string;
};

const fr: ProjectsIntro = {
  principle: [
    "Un projet collaboratif réunit plusieurs membres du réseau — think tanks, chercheurs, contributeurs — autour d'une question démocratique commune, en Afrique comme en Europe. L'idée n'est pas de financer un acteur isolé, mais de faire travailler ensemble des équipes qui, séparément, ne se seraient pas rencontrées.",
    "Chaque proposition part d'un besoin concret : une enquête de terrain, un outil partagé, une étude comparative, une campagne de sensibilisation. Le réseau aide à relier les porteurs entre eux, à structurer la démarche et à diffuser les résultats au-delà des frontières nationales.",
  ],
  scopeLead:
    "Une proposition doit s'inscrire dans l'un des cinq axes de travail du réseau. C'est le cadre qui garantit la cohérence collective et la mise en relation avec les équipes déjà actives sur le même terrain.",
  criteria: [
    {
      title: 'Une question claire',
      body: 'Le projet répond à une question démocratique précise et vérifiable, pas à une intention vague. On doit comprendre ce qui sera produit et pourquoi cela compte.',
    },
    {
      title: 'Une dimension collaborative',
      body: "Au moins deux contributeurs ou organisations s'engagent, de préférence à cheval sur plusieurs pays ou langues. La coopération est le cœur du dispositif, pas un supplément.",
    },
    {
      title: 'Un résultat partageable',
      body: "Le projet débouche sur une production ouverte — étude, données, méthode, outil — réutilisable par d'autres membres et accessible au public quand c'est possible.",
    },
    {
      title: 'Un ancrage de terrain',
      body: "La proposition s'appuie sur une connaissance réelle du contexte local, en particulier dans les régions où les institutions démocratiques sont fragiles.",
    },
  ],
  support: [
    {
      title: 'Mise en relation',
      body: 'Le réseau identifie les membres dont les travaux recoupent le projet et facilite les premiers échanges entre porteurs.',
    },
    {
      title: 'Appui méthodologique',
      body: 'Relecture du cadrage, partage de méthodes éprouvées et accès aux ressources communes du réseau (baromètre, bibliothèque, contacts).',
    },
    {
      title: 'Diffusion',
      body: "Une fois aboutis, les résultats sont relayés par les canaux du réseau — bibliothèque, événements, lettre d'information — pour toucher au-delà du cercle des porteurs.",
    },
  ],
  disclaimer:
    "Cette page présente le principe des projets collaboratifs et la manière d'en proposer un. Elle n'annonce ni appel daté ni montant de financement : chaque proposition est étudiée au cas par cas par le réseau.",
};

const en: ProjectsIntro = {
  principle: [
    'A collaborative project brings together several members of the network — think tanks, researchers, contributors — around a shared democratic question, in Africa as in Europe. The point is not to fund a single actor, but to make teams work together that, on their own, would never have met.',
    'Every proposal starts from a concrete need: field research, a shared tool, a comparative study, an awareness campaign. The network helps connect the people behind it, structure the approach and spread the results beyond national borders.',
  ],
  scopeLead:
    "A proposal must fall within one of the network's five pillars of work. This framing is what keeps the effort coherent and connects you with teams already active on the same ground.",
  criteria: [
    {
      title: 'A clear question',
      body: 'The project answers a precise, verifiable democratic question rather than a vague intention. It must be clear what will be produced and why it matters.',
    },
    {
      title: 'A collaborative dimension',
      body: 'At least two contributors or organisations commit to it, ideally across several countries or languages. Cooperation is the heart of the scheme, not an add-on.',
    },
    {
      title: 'A shareable outcome',
      body: 'The project leads to an open output — study, data, method, tool — reusable by other members and accessible to the public where possible.',
    },
    {
      title: 'Grounded in the field',
      body: 'The proposal draws on real knowledge of the local context, especially in regions where democratic institutions are fragile.',
    },
  ],
  support: [
    {
      title: 'Introductions',
      body: 'The network identifies members whose work overlaps with the project and helps the first exchanges between the people behind it.',
    },
    {
      title: 'Methodological support',
      body: "A review of the framing, shared proven methods and access to the network's common resources (barometer, library, contacts).",
    },
    {
      title: 'Dissemination',
      body: "Once completed, results are relayed through the network's channels — library, events, newsletter — to reach beyond the circle of contributors.",
    },
  ],
  disclaimer:
    'This page sets out the principle of collaborative projects and how to propose one. It announces neither a dated call nor a funding amount: each proposal is reviewed case by case by the network.',
};

export function getProjectsIntro(locale: 'fr' | 'en'): ProjectsIntro {
  return locale === 'en' ? en : fr;
}
