import type { Locale } from '@/i18n/routing';

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

const es: ProjectsIntro = {
  principle: [
    'Un proyecto colaborativo reúne a varios miembros de la red —centros de estudios, investigadores, colaboradores— en torno a una pregunta democrática común, tanto en África como en Europa. No se trata de financiar a un actor aislado, sino de hacer trabajar juntos a equipos que, por separado, nunca se habrían encontrado.',
    'Cada propuesta parte de una necesidad concreta: una investigación de campo, una herramienta compartida, un estudio comparado, una campaña de sensibilización. La red ayuda a poner en contacto a quienes la impulsan, a estructurar el planteamiento y a difundir los resultados más allá de las fronteras nacionales.',
  ],
  scopeLead:
    'Una propuesta debe inscribirse en uno de los cinco ejes de trabajo de la red. Ese marco es lo que garantiza la coherencia colectiva y la conexión con los equipos que ya trabajan sobre el mismo terreno.',
  criteria: [
    {
      title: 'Una pregunta clara',
      body: 'El proyecto responde a una pregunta democrática precisa y verificable, no a una intención vaga. Debe entenderse qué se va a producir y por qué importa.',
    },
    {
      title: 'Una dimensión colaborativa',
      body: 'Se comprometen al menos dos colaboradores u organizaciones, preferiblemente repartidos entre varios países o lenguas. La cooperación es el núcleo del dispositivo, no un añadido.',
    },
    {
      title: 'Un resultado compartible',
      body: 'El proyecto desemboca en una producción abierta —estudio, datos, método, herramienta— reutilizable por otros miembros y accesible al público cuando sea posible.',
    },
    {
      title: 'Un anclaje sobre el terreno',
      body: 'La propuesta se apoya en un conocimiento real del contexto local, en particular en las regiones donde las instituciones democráticas son frágiles.',
    },
  ],
  support: [
    {
      title: 'Puesta en contacto',
      body: 'La red identifica a los miembros cuyos trabajos se cruzan con el proyecto y facilita los primeros intercambios entre quienes lo impulsan.',
    },
    {
      title: 'Apoyo metodológico',
      body: 'Revisión del planteamiento, métodos contrastados compartidos y acceso a los recursos comunes de la red (barómetro, biblioteca, contactos).',
    },
    {
      title: 'Difusión',
      body: 'Una vez concluidos, los resultados se difunden por los canales de la red —biblioteca, eventos, boletín— para llegar más allá del círculo de quienes los impulsan.',
    },
  ],
  disclaimer:
    'Esta página presenta el principio de los proyectos colaborativos y la manera de proponer uno. No anuncia ninguna convocatoria con fecha ni importe de financiación: cada propuesta se estudia caso por caso por la red.',
};

const pt: ProjectsIntro = {
  principle: [
    'Um projeto colaborativo reúne vários membros da rede — centros de estudos, investigadores, colaboradores — em torno de uma questão democrática comum, tanto em África como na Europa. Não se trata de financiar um ator isolado, mas de fazer trabalhar em conjunto equipas que, separadamente, nunca se teriam encontrado.',
    'Cada proposta parte de uma necessidade concreta: uma investigação no terreno, uma ferramenta partilhada, um estudo comparado, uma campanha de sensibilização. A rede ajuda a ligar quem a promove, a estruturar a abordagem e a difundir os resultados para além das fronteiras nacionais.',
  ],
  scopeLead:
    'Uma proposta deve inscrever-se num dos cinco eixos de trabalho da rede. É esse enquadramento que garante a coerência coletiva e a ligação às equipas já ativas no mesmo terreno.',
  criteria: [
    {
      title: 'Uma questão clara',
      body: 'O projeto responde a uma questão democrática precisa e verificável, e não a uma intenção vaga. Tem de ser claro o que será produzido e porque é que isso importa.',
    },
    {
      title: 'Uma dimensão colaborativa',
      body: 'Comprometem-se pelo menos dois colaboradores ou organizações, de preferência repartidos por vários países ou línguas. A cooperação é o cerne do dispositivo, não um acrescento.',
    },
    {
      title: 'Um resultado partilhável',
      body: 'O projeto desemboca numa produção aberta — estudo, dados, método, ferramenta — reutilizável por outros membros e acessível ao público sempre que possível.',
    },
    {
      title: 'Uma ancoragem no terreno',
      body: 'A proposta assenta num conhecimento real do contexto local, em particular nas regiões onde as instituições democráticas são frágeis.',
    },
  ],
  support: [
    {
      title: 'Ligação entre membros',
      body: 'A rede identifica os membros cujos trabalhos se cruzam com o projeto e facilita as primeiras trocas entre quem o promove.',
    },
    {
      title: 'Apoio metodológico',
      body: 'Revisão do enquadramento, partilha de métodos comprovados e acesso aos recursos comuns da rede (barómetro, biblioteca, contactos).',
    },
    {
      title: 'Difusão',
      body: 'Uma vez concluídos, os resultados são divulgados pelos canais da rede — biblioteca, eventos, boletim — para chegar para além do círculo de quem os promoveu.',
    },
  ],
  disclaimer:
    'Esta página apresenta o princípio dos projetos colaborativos e a forma de propor um. Não anuncia qualquer convite com data nem montante de financiamento: cada proposta é estudada caso a caso pela rede.',
};

const ar: ProjectsIntro = {
  principle: [
    'يجمع المشروع التعاوني عدداً من أعضاء الشبكة — مراكز دراسات وباحثين ومساهمين — حول سؤال ديمقراطي مشترك، في أفريقيا كما في أوروبا. الغاية ليست تمويل فاعل منفرد، بل جعل فرق ما كانت لتلتقي لولا ذلك تعمل معاً.',
    'ينطلق كل مقترح من حاجة ملموسة: بحث ميداني، أداة مشتركة، دراسة مقارنة، حملة توعية. تساعد الشبكة على الربط بين أصحاب المشروع، وعلى بناء المنهجية، وعلى نشر النتائج خارج الحدود الوطنية.',
  ],
  scopeLead:
    'يجب أن يندرج المقترح ضمن أحد محاور عمل الشبكة الخمسة. هذا الإطار هو ما يضمن الانسجام الجماعي والربط بالفرق العاملة أصلاً في الميدان نفسه.',
  criteria: [
    {
      title: 'سؤال واضح',
      body: 'يجيب المشروع عن سؤال ديمقراطي دقيق وقابل للتحقق، لا عن نية غامضة. ينبغي أن يكون مفهوماً ما الذي سيُنتَج ولماذا يهمّ.',
    },
    {
      title: 'بعد تعاوني',
      body: 'يلتزم مساهمان أو منظمتان على الأقل، ويُفضَّل أن يمتدّ ذلك على عدة بلدان أو لغات. التعاون هو جوهر هذا الإطار لا إضافة إليه.',
    },
    {
      title: 'نتيجة قابلة للمشاركة',
      body: 'يفضي المشروع إلى إنتاج مفتوح — دراسة أو بيانات أو منهجية أو أداة — قابل لإعادة الاستخدام من قبل أعضاء آخرين ومتاح للعموم كلما أمكن.',
    },
    {
      title: 'تجذّر ميداني',
      body: 'يستند المقترح إلى معرفة حقيقية بالسياق المحلي، ولا سيما في المناطق التي تكون فيها المؤسسات الديمقراطية هشّة.',
    },
  ],
  support: [
    {
      title: 'الربط بين الأعضاء',
      body: 'تحدّد الشبكة الأعضاء الذين تتقاطع أعمالهم مع المشروع وتيسّر التبادلات الأولى بين أصحابه.',
    },
    {
      title: 'دعم منهجي',
      body: 'مراجعة الإطار العام، وتقاسم مناهج مجرَّبة، والنفاذ إلى الموارد المشتركة للشبكة (المؤشر، المكتبة، جهات الاتصال).',
    },
    {
      title: 'النشر',
      body: 'بعد اكتمالها، تُنشَر النتائج عبر قنوات الشبكة — المكتبة والفعاليات والنشرة البريدية — لتصل إلى ما هو أبعد من دائرة أصحاب المشروع.',
    },
  ],
  disclaimer:
    'تعرض هذه الصفحة مبدأ المشاريع التعاونية وكيفية اقتراح مشروع. وهي لا تعلن عن دعوة محدَّدة التاريخ ولا عن مبلغ تمويل: تدرس الشبكة كل مقترح على حدة.',
};

// La table est EXHAUSTIVE PAR CONSTRUCTION : `Record<Locale, …>` fait échouer
// la compilation si une langue est ajoutée à `routing.locales` sans son bloc de
// contenu. Le ternaire qu'elle remplace (`locale === 'en' ? en : fr`) aurait,
// lui, servi silencieusement du français aux trois langues ajoutées — un défaut
// qu'aucune relecture ne rattrape et qu'aucun test ne voit. Même motif que
// `ATTENDANCE_MODE` dans `src/lib/seo.ts`.
const BY_LOCALE: Record<Locale, ProjectsIntro> = { fr, en, es, pt, ar };

export function getProjectsIntro(locale: Locale): ProjectsIntro {
  return BY_LOCALE[locale];
}
