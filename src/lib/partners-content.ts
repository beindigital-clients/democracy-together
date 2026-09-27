import type { Locale } from '@/i18n/routing';

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
      'Acteurs publics, agences de coopération et organisations internationales engagés sur la gouvernance démocratique en Afrique et en Europe.',
    gives:
      "Un ancrage institutionnel, l'accès à des données publiques et la possibilité de relier les travaux du réseau aux politiques réelles. Leur participation crédibilise la comparaison sans en dicter les conclusions.",
    gets: 'Une analyse indépendante et bicontinentale, des synthèses méthodiques sur leurs domaines et un espace neutre de dialogue entre praticiens africains et européens.',
  },
  fondations: {
    slug: 'fondations',
    kicker: 'Fondations & mécènes',
    title: 'Fondations & mécènes',
    summary:
      "Fondations, philanthropes et mécènes qui financent la recherche d'intérêt général et l'indépendance éditoriale du réseau.",
    gives:
      'Un soutien financier pluriannuel qui rend possible un travail de fond, libéré de la pression du court terme. Leur appui finance la méthode — données ouvertes, relecture scientifique — plutôt que des conclusions attendues.',
    gets: "Un impact mesurable sur le débat démocratique, des livrables citables en accès ouvert et la transparence sur l'usage des fonds, condition de la confiance.",
  },
  'think-tanks': {
    slug: 'think-tanks',
    kicker: 'Think tanks membres',
    title: 'Think tanks & centres de recherche membres',
    summary:
      "Les organisations membres qui composent le réseau : think tanks, laboratoires et centres de recherche d'Afrique et d'Europe.",
    gives:
      "L'expertise de terrain et les publications qui nourrissent la bibliothèque commune et les synthèses thématiques. Ce sont eux qui produisent la matière : le réseau ne fait que la relier et la mettre en perspective.",
    gets: "Une visibilité au-delà de leurs frontières, des cadres de comparaison partagés et une infrastructure commune — bibliothèque, annuaire, baromètre — qu'aucun centre ne porterait seul.",
  },
  medias: {
    slug: 'medias',
    kicker: 'Médias & diffusion',
    title: 'Médias & partenaires de diffusion',
    summary:
      'Rédactions, médias spécialisés et plateformes de diffusion qui relaient les travaux du réseau vers un public plus large.',
    gives:
      'Une portée éditoriale et la capacité de traduire des analyses exigeantes en récits accessibles, sans les déformer. La diffusion fait sortir la recherche du cercle des spécialistes.',
    gets: "Une source rigoureuse, des données vérifiables et un regard croisé Afrique-Europe sur des sujets souvent traités à l'échelle d'un seul pays.",
  },
  techniques: {
    slug: 'techniques',
    kicker: 'Partenaires techniques',
    title: 'Partenaires techniques & open source',
    summary:
      "Contributeurs techniques, fournisseurs d'outils et communautés open source qui soutiennent l'infrastructure numérique du réseau.",
    gives:
      'Des compétences techniques, des outils et des bonnes pratiques — accessibilité, données ouvertes, sécurité — qui font tenir une plateforme sobre et durable.',
    gets: "Un cas d'usage d'intérêt général, une mise en avant de leurs contributions et un partenaire attaché à la transparence du code et des méthodes.",
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
    gets: 'An independent, two-continent analysis, methodical syntheses on their fields and a neutral space for dialogue between African and European practitioners.',
  },
  fondations: {
    slug: 'fondations',
    kicker: 'Foundations & patrons',
    title: 'Foundations & patrons',
    summary:
      "Foundations, philanthropists and patrons funding public-interest research and the network's editorial independence.",
    gives:
      'Multi-year financial support that makes in-depth work possible, free from short-term pressure. Their backing funds the method — open data, scientific review — rather than expected conclusions.',
    gets: 'A measurable impact on democratic debate, citable open-access outputs and transparency on how funds are used, the condition of trust.',
  },
  'think-tanks': {
    slug: 'think-tanks',
    kicker: 'Member think tanks',
    title: 'Member think tanks & research centres',
    summary:
      'The member organisations that make up the network: think tanks, labs and research centres from Africa and Europe.',
    gives:
      'The field expertise and publications that feed the shared library and the thematic syntheses. They produce the substance; the network only links it and puts it in perspective.',
    gets: 'Visibility beyond their borders, shared comparison frameworks and a common infrastructure — library, directory, barometer — that no single centre would build alone.',
  },
  medias: {
    slug: 'medias',
    kicker: 'Media & distribution',
    title: 'Media & distribution partners',
    summary:
      "Newsrooms, specialist media and distribution platforms that carry the network's work to a wider audience.",
    gives:
      'Editorial reach and the ability to turn demanding analysis into accessible stories without distorting it. Distribution takes research beyond the circle of specialists.',
    gets: 'A rigorous source, verifiable data and a cross Africa-Europe perspective on topics often covered within a single country.',
  },
  techniques: {
    slug: 'techniques',
    kicker: 'Technical partners',
    title: 'Technical & open-source partners',
    summary:
      "Technical contributors, tool providers and open-source communities supporting the network's digital infrastructure.",
    gives:
      'Technical skills, tools and good practices — accessibility, open data, security — that keep a lean, durable platform standing.',
    gets: 'A public-interest use case, recognition of their contributions and a partner committed to transparency of code and methods.',
  },
};

const es: Record<PartnerSlug, PartnerCategory> = {
  institutions: {
    slug: 'institutions',
    kicker: 'Instituciones públicas',
    title: 'Instituciones públicas y organizaciones multilaterales',
    summary:
      'Actores públicos, agencias de cooperación y organizaciones internacionales comprometidos con la gobernanza democrática en África y Europa.',
    gives:
      'Un anclaje institucional, el acceso a datos públicos y la posibilidad de conectar los trabajos de la red con las políticas reales. Su participación da credibilidad a la comparación sin dictar sus conclusiones.',
    gets: 'Un análisis independiente y bicontinental, síntesis metódicas sobre sus ámbitos y un espacio neutral de diálogo entre profesionales africanos y europeos.',
  },
  fondations: {
    slug: 'fondations',
    kicker: 'Fundaciones y mecenas',
    title: 'Fundaciones y mecenas',
    summary:
      'Fundaciones, filántropos y mecenas que financian la investigación de interés general y la independencia editorial de la red.',
    gives:
      'Un apoyo financiero plurianual que hace posible un trabajo de fondo, liberado de la presión del corto plazo. Su respaldo financia el método —datos abiertos, revisión científica— y no unas conclusiones esperadas.',
    gets: 'Un impacto medible en el debate democrático, resultados citables en acceso abierto y transparencia sobre el uso de los fondos, condición de la confianza.',
  },
  'think-tanks': {
    slug: 'think-tanks',
    kicker: 'Centros miembros',
    title: 'Centros de estudios e investigación miembros',
    summary:
      'Las organizaciones miembros que componen la red: centros de estudios, laboratorios y centros de investigación de África y Europa.',
    gives:
      'La experiencia sobre el terreno y las publicaciones que nutren la biblioteca común y las síntesis temáticas. Son ellos quienes producen la materia: la red se limita a enlazarla y ponerla en perspectiva.',
    gets: 'Visibilidad más allá de sus fronteras, marcos de comparación compartidos y una infraestructura común —biblioteca, directorio, barómetro— que ningún centro sostendría por sí solo.',
  },
  medias: {
    slug: 'medias',
    kicker: 'Medios y difusión',
    title: 'Medios y socios de difusión',
    summary:
      'Redacciones, medios especializados y plataformas de difusión que llevan los trabajos de la red a un público más amplio.',
    gives:
      'Un alcance editorial y la capacidad de traducir análisis exigentes en relatos accesibles, sin deformarlos. La difusión saca la investigación del círculo de especialistas.',
    gets: 'Una fuente rigurosa, datos verificables y una mirada cruzada África-Europa sobre temas que a menudo se tratan a escala de un solo país.',
  },
  techniques: {
    slug: 'techniques',
    kicker: 'Socios técnicos',
    title: 'Socios técnicos y de código abierto',
    summary:
      'Colaboradores técnicos, proveedores de herramientas y comunidades de código abierto que sostienen la infraestructura digital de la red.',
    gives:
      'Competencias técnicas, herramientas y buenas prácticas —accesibilidad, datos abiertos, seguridad— que mantienen en pie una plataforma sobria y duradera.',
    gets: 'Un caso de uso de interés general, reconocimiento de sus aportaciones y un socio comprometido con la transparencia del código y de los métodos.',
  },
};

const pt: Record<PartnerSlug, PartnerCategory> = {
  institutions: {
    slug: 'institutions',
    kicker: 'Instituições públicas',
    title: 'Instituições públicas e organizações multilaterais',
    summary:
      'Atores públicos, agências de cooperação e organizações internacionais empenhados na governação democrática em África e na Europa.',
    gives:
      'Uma ancoragem institucional, o acesso a dados públicos e a possibilidade de ligar os trabalhos da rede às políticas reais. A sua participação dá credibilidade à comparação sem ditar as suas conclusões.',
    gets: 'Uma análise independente e bicontinental, sínteses metódicas sobre os seus domínios e um espaço neutro de diálogo entre profissionais africanos e europeus.',
  },
  fondations: {
    slug: 'fondations',
    kicker: 'Fundações e mecenas',
    title: 'Fundações e mecenas',
    summary:
      'Fundações, filantropos e mecenas que financiam a investigação de interesse geral e a independência editorial da rede.',
    gives:
      'Um apoio financeiro plurianual que torna possível um trabalho de fundo, liberto da pressão do curto prazo. O seu apoio financia o método — dados abertos, revisão científica — e não conclusões esperadas.',
    gets: 'Um impacto mensurável no debate democrático, resultados citáveis em acesso aberto e transparência sobre a utilização dos fundos, condição da confiança.',
  },
  'think-tanks': {
    slug: 'think-tanks',
    kicker: 'Centros membros',
    title: 'Centros de estudos e investigação membros',
    summary:
      'As organizações membros que compõem a rede: centros de estudos, laboratórios e centros de investigação de África e da Europa.',
    gives:
      'A experiência no terreno e as publicações que alimentam a biblioteca comum e as sínteses temáticas. São eles que produzem a matéria: a rede limita-se a ligá-la e a pô-la em perspetiva.',
    gets: 'Visibilidade para além das suas fronteiras, quadros de comparação partilhados e uma infraestrutura comum — biblioteca, diretório, barómetro — que nenhum centro sustentaria sozinho.',
  },
  medias: {
    slug: 'medias',
    kicker: 'Meios de comunicação',
    title: 'Meios de comunicação e parceiros de difusão',
    summary:
      'Redações, meios especializados e plataformas de difusão que levam os trabalhos da rede a um público mais alargado.',
    gives:
      'Um alcance editorial e a capacidade de traduzir análises exigentes em narrativas acessíveis, sem as deformar. A difusão faz sair a investigação do círculo dos especialistas.',
    gets: 'Uma fonte rigorosa, dados verificáveis e um olhar cruzado África-Europa sobre temas frequentemente tratados à escala de um único país.',
  },
  techniques: {
    slug: 'techniques',
    kicker: 'Parceiros técnicos',
    title: 'Parceiros técnicos e de código aberto',
    summary:
      'Colaboradores técnicos, fornecedores de ferramentas e comunidades de código aberto que sustentam a infraestrutura digital da rede.',
    gives:
      'Competências técnicas, ferramentas e boas práticas — acessibilidade, dados abertos, segurança — que mantêm de pé uma plataforma sóbria e duradoura.',
    gets: 'Um caso de uso de interesse geral, reconhecimento dos seus contributos e um parceiro comprometido com a transparência do código e dos métodos.',
  },
};

const ar: Record<PartnerSlug, PartnerCategory> = {
  institutions: {
    slug: 'institutions',
    kicker: 'المؤسسات العمومية',
    title: 'المؤسسات العمومية والمنظمات متعددة الأطراف',
    summary:
      'فاعلون عموميون ووكالات تعاون ومنظمات دولية منخرطون في الحوكمة الديمقراطية في أفريقيا وأوروبا.',
    gives:
      'تجذّر مؤسسي، ونفاذ إلى البيانات العمومية، وإمكانية ربط أعمال الشبكة بالسياسات الفعلية. مشاركتهم تمنح المقارنة مصداقية دون أن تملي نتائجها.',
    gets: 'تحليل مستقل يشمل القارتين، وخلاصات منهجية في مجالات عملهم، وفضاء محايد للحوار بين الممارسين الأفارقة والأوروبيين.',
  },
  fondations: {
    slug: 'fondations',
    kicker: 'المؤسسات المانحة',
    title: 'المؤسسات المانحة والداعمون',
    summary:
      'مؤسسات مانحة وفاعلون خيريون وداعمون يموّلون البحث ذا النفع العام والاستقلال التحريري للشبكة.',
    gives:
      'دعم مالي متعدد السنوات يتيح عملاً عميقاً متحرراً من ضغط المدى القصير. دعمهم يموّل المنهجية — البيانات المفتوحة والمراجعة العلمية — لا نتائج مرتقبة سلفاً.',
    gets: 'أثر قابل للقياس في النقاش الديمقراطي، ومخرجات قابلة للاستشهاد في وصول مفتوح، وشفافية في استخدام الأموال، وهي شرط الثقة.',
  },
  'think-tanks': {
    slug: 'think-tanks',
    kicker: 'مراكز الدراسات الأعضاء',
    title: 'مراكز الدراسات والبحث الأعضاء',
    summary:
      'المنظمات الأعضاء التي تشكّل الشبكة: مراكز دراسات ومختبرات ومراكز بحث من أفريقيا وأوروبا.',
    gives:
      'الخبرة الميدانية والمنشورات التي تغذّي المكتبة المشتركة والخلاصات المواضيعية. هم من ينتجون المادة، والشبكة لا تفعل سوى ربطها ووضعها في منظور.',
    gets: 'حضور يتجاوز حدودهم، وأطر مقارنة مشتركة، وبنية تحتية جماعية — مكتبة ودليل ومؤشر — ما كان أي مركز بمفرده ليقيمها.',
  },
  medias: {
    slug: 'medias',
    kicker: 'الإعلام والنشر',
    title: 'وسائل الإعلام وشركاء النشر',
    summary:
      'غرف تحرير ووسائل إعلام متخصصة ومنصات نشر تنقل أعمال الشبكة إلى جمهور أوسع.',
    gives:
      'مدى تحريري وقدرة على ترجمة تحليلات صعبة إلى سرد في متناول الجميع، دون تشويهها. النشر يُخرج البحث من دائرة المختصين.',
    gets: 'مصدر دقيق، وبيانات قابلة للتحقق، ونظرة متقاطعة بين أفريقيا وأوروبا في مواضيع كثيراً ما تُعالج على مقياس بلد واحد.',
  },
  techniques: {
    slug: 'techniques',
    kicker: 'الشركاء التقنيون',
    title: 'الشركاء التقنيون ومجتمعات المصدر المفتوح',
    summary:
      'مساهمون تقنيون ومزوّدو أدوات ومجتمعات مصدر مفتوح يدعمون البنية الرقمية للشبكة.',
    gives:
      'كفاءات تقنية وأدوات وممارسات جيدة — إتاحة الوصول، والبيانات المفتوحة، والأمان — تُبقي منصة رشيقة ومستدامة قائمة.',
    gets: 'حالة استخدام ذات نفع عام، وإبراز لمساهماتهم، وشريك متمسك بشفافية الشيفرة والمناهج.',
  },
};

// Table exhaustive par construction (cf. `projects-content.ts`).
const BY_LOCALE: Record<Locale, Record<PartnerSlug, PartnerCategory>> = {
  fr,
  en,
  es,
  pt,
  ar,
};

export function getPartners(locale: Locale): PartnerCategory[] {
  const table = BY_LOCALE[locale];
  return PARTNER_SLUGS.map((s) => table[s]);
}

export function getPartner(
  locale: Locale,
  slug: string,
): PartnerCategory | null {
  const table = BY_LOCALE[locale];
  return (PARTNER_SLUGS as readonly string[]).includes(slug)
    ? table[slug as PartnerSlug]
    : null;
}
