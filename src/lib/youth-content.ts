import type { Locale } from '@/i18n/routing';

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
    badges: [
      'Gratuit pour les jeunes',
      'Mobile d’abord',
      'FR / EN / ES / PT / AR',
    ],
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
    badges: ['Free for young people', 'Mobile first', 'FR / EN / ES / PT / AR'],
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

const es: YouthContent = {
  hero: {
    chip: 'Hub joven',
    titlePre: 'Tienes ideas para la democracia. Te damos los medios para ',
    titleEm: 'actuar',
    titlePost: '.',
    lead: 'Un espacio para menores de 35 años: aprender, contribuir, publicar y contar con el acompañamiento de mentores de la red. En África como en Europa.',
    ctaJoin: 'Unirme al hub',
    ctaPrograms: 'Ver los programas',
    badges: [
      'Gratuito para jóvenes',
      'Primero el móvil',
      'FR / EN / ES / PT / AR',
    ],
  },
  parcours: {
    eyebrow: 'Tu itinerario',
    title: 'Cuatro etapas, a tu ritmo',
    lead: 'Avanzas cuando quieres. Cada etapa desbloquea la siguiente y hace crecer tu perfil dentro de la red.',
    steps: [
      {
        n: '1',
        title: 'Descubrir',
        body: 'Entender los retos con formatos breves y accesibles.',
      },
      {
        n: '2',
        title: 'Aprender',
        body: 'Caja de herramientas, seminarios web y módulos de refuerzo de capacidades.',
      },
      {
        n: '3',
        title: 'Contribuir',
        body: 'Publicar una tribuna, unirte a un grupo de trabajo, solicitar una beca.',
      },
      {
        n: '4',
        title: 'Mentorizar',
        body: 'Transmitir a tu vez y acompañar a alguien de la red.',
      },
    ],
    gam: {
      title: 'Tu progresión cuenta',
      body: 'Cada contribución te hace ganar insignias y visibilidad ante los centros de estudios miembros. Un reconocimiento concreto, no un adorno.',
      badges: [
        { letter: 'D', label: 'Descubridor', locked: false },
        { letter: 'C', label: 'Contribuidor', locked: false },
        { letter: 'M', label: 'Mentor', locked: true },
        { letter: 'A', label: 'Embajador', locked: true },
      ],
      levelLabel: 'Tu nivel',
      level: 'Nivel 2 · Contribuidor',
      points: '620 / 1000 puntos',
      remaining: 'Solo 2 contribuciones más',
      chips: ['3 publicaciones', '1 seminario web', 'Perfil verificado'],
      note: 'Perfil de ejemplo',
      pct: 62,
    },
  },
  programmes: {
    title: 'Los programas',
    lead: 'Dispositivos concretos para pasar de la idea a la acción.',
    featured: {
      kicker: 'Destacado',
      title: 'Mentoría',
      body: 'Te emparejamos con un mentor experimentado de la red, según tu lengua, tu región y tus temas. Seis meses de acompañamiento, objetivos claros y un seguimiento real.',
      cta: 'Solicitar un mentor',
    },
    funding: {
      kicker: 'Financiación',
      title: 'Becas específicas',
      body: 'Becas para jóvenes investigadores y centros de estudios emergentes, con prioridad en las regiones frágiles.',
      cta: 'Ver las becas',
    },
    items: [
      {
        kicker: 'Aprender',
        title: 'Caja de herramientas',
        body: 'Guías, plantillas y módulos breves para ganar competencias, con certificación.',
        cta: 'Abrir la caja',
      },
      {
        kicker: 'Publicar',
        title: 'Tribunas',
        body: 'Envía una contribución breve, acompañada de un apoyo editorial de la red.',
        cta: 'Proponer una tribuna',
      },
      {
        kicker: 'Actuar',
        title: 'Campañas',
        body: 'Súmate a campañas de sensibilización y a eventos jóvenes en Dakar y Bruselas.',
        cta: 'Ver las campañas',
      },
    ],
  },
  mentor: {
    eyebrow: 'Mentoría',
    title: 'Una pareja de trabajo, no un formulario',
    body: 'El emparejamiento se hace según tus temas, tu lengua y tu región. Fijas los objetivos con tu mentor; la red asegura el seguimiento y la regularidad de las sesiones.',
    cta: 'Encontrar mi mentor',
    mentors: [
      {
        initials: 'AW',
        name: 'Aminata Wade',
        field: 'Gobernanza local · Dakar',
        role: 'Mentora',
      },
      {
        initials: 'PV',
        name: 'Pieter Vandenberghe',
        field: 'Democracia digital · Bruselas',
        role: 'Mentor',
      },
      {
        initials: 'LK',
        name: 'Linda Kouassi',
        field: 'Lucha contra la corrupción · Abiyán',
        role: 'Mentora',
      },
    ],
  },
  testimonial: {
    quote:
      'Publiqué mi primera tribuna a los 23 años gracias al hub. Seis meses después, mi centro de estudios me contrató. La red me abrió puertas que creía cerradas.',
    attrName: 'Fatou N., 24 años',
    attrPlace: 'Dakar',
    attrNote: '(testimonio de ilustración)',
    stats: [
      { n: '1 200', u: '+', label: 'Jóvenes comprometidos' },
      { n: '180', label: 'Parejas de mentoría' },
      { n: '45', label: 'Becas concedidas' },
      { n: '22', label: 'Países representados' },
    ],
    note: 'Datos de ilustración',
  },
  cta: {
    title: '¿Listo para unirte al hub?',
    body: 'La inscripción lleva tres minutos. Gratuita para menores de 35 años, en toda la red.',
    primary: 'Crear mi perfil',
    secondary: 'Descubrir Democracy Together',
  },
};

const pt: YouthContent = {
  hero: {
    chip: 'Hub jovem',
    titlePre: 'Tens ideias para a democracia. Damos-te os meios para ',
    titleEm: 'agir',
    titlePost: '.',
    lead: 'Um espaço para menores de 35 anos: aprender, contribuir, publicar e ser acompanhado por mentores da rede. Em África como na Europa.',
    ctaJoin: 'Juntar-me ao hub',
    ctaPrograms: 'Ver os programas',
    badges: [
      'Gratuito para jovens',
      'Primeiro o telemóvel',
      'FR / EN / ES / PT / AR',
    ],
  },
  parcours: {
    eyebrow: 'O teu percurso',
    title: 'Quatro etapas, ao teu ritmo',
    lead: 'Avanças quando quiseres. Cada etapa desbloqueia a seguinte e faz crescer o teu perfil na rede.',
    steps: [
      {
        n: '1',
        title: 'Descobrir',
        body: 'Compreender os desafios com formatos curtos e acessíveis.',
      },
      {
        n: '2',
        title: 'Aprender',
        body: 'Caixa de ferramentas, seminários online e módulos de reforço de capacidades.',
      },
      {
        n: '3',
        title: 'Contribuir',
        body: 'Publicar uma tribuna, juntar-te a um grupo de trabalho, candidatar-te a uma bolsa.',
      },
      {
        n: '4',
        title: 'Ser mentor',
        body: 'Transmitir por tua vez e acompanhar alguém da rede.',
      },
    ],
    gam: {
      title: 'A tua progressão conta',
      body: 'Cada contribuição dá-te distintivos e visibilidade junto dos centros de estudos membros. Um reconhecimento concreto, não um adorno.',
      badges: [
        { letter: 'D', label: 'Descobridor', locked: false },
        { letter: 'C', label: 'Contribuidor', locked: false },
        { letter: 'M', label: 'Mentor', locked: true },
        { letter: 'A', label: 'Embaixador', locked: true },
      ],
      levelLabel: 'O teu nível',
      level: 'Nível 2 · Contribuidor',
      points: '620 / 1000 pontos',
      remaining: 'Faltam apenas 2 contribuições',
      chips: ['3 publicações', '1 seminário online', 'Perfil verificado'],
      note: 'Perfil de exemplo',
      pct: 62,
    },
  },
  programmes: {
    title: 'Os programas',
    lead: 'Dispositivos concretos para passar da ideia à ação.',
    featured: {
      kicker: 'Destaque',
      title: 'Mentoria',
      body: 'Associamos-te a um mentor experiente da rede, consoante a tua língua, a tua região e os teus temas. Seis meses de acompanhamento, objetivos claros e um seguimento a sério.',
      cta: 'Pedir um mentor',
    },
    funding: {
      kicker: 'Financiamento',
      title: 'Bolsas dirigidas',
      body: 'Bolsas para jovens investigadores e centros de estudos emergentes, com prioridade nas regiões frágeis.',
      cta: 'Ver as bolsas',
    },
    items: [
      {
        kicker: 'Aprender',
        title: 'Caixa de ferramentas',
        body: 'Guias, modelos e módulos curtos para ganhar competências, com certificação.',
        cta: 'Abrir a caixa',
      },
      {
        kicker: 'Publicar',
        title: 'Tribunas',
        body: 'Envia uma contribuição curta, acompanhada de um apoio editorial da rede.',
        cta: 'Propor uma tribuna',
      },
      {
        kicker: 'Agir',
        title: 'Campanhas',
        body: 'Junta-te a campanhas de sensibilização e a eventos jovens em Dakar e Bruxelas.',
        cta: 'Ver as campanhas',
      },
    ],
  },
  mentor: {
    eyebrow: 'Mentoria',
    title: 'Uma dupla, não um formulário',
    body: 'O emparelhamento faz-se pelos teus temas, pela tua língua e pela tua região. Defines os objetivos com o teu mentor; a rede garante o seguimento e a regularidade das sessões.',
    cta: 'Encontrar o meu mentor',
    mentors: [
      {
        initials: 'AW',
        name: 'Aminata Wade',
        field: 'Governação local · Dakar',
        role: 'Mentora',
      },
      {
        initials: 'PV',
        name: 'Pieter Vandenberghe',
        field: 'Democracia digital · Bruxelas',
        role: 'Mentor',
      },
      {
        initials: 'LK',
        name: 'Linda Kouassi',
        field: 'Combate à corrupção · Abidjan',
        role: 'Mentora',
      },
    ],
  },
  testimonial: {
    quote:
      'Publiquei a minha primeira tribuna aos 23 anos graças ao hub. Seis meses depois, o meu centro de estudos contratou-me. A rede abriu-me portas que julgava fechadas.',
    attrName: 'Fatou N., 24 anos',
    attrPlace: 'Dakar',
    attrNote: '(testemunho de ilustração)',
    stats: [
      { n: '1 200', u: '+', label: 'Jovens envolvidos' },
      { n: '180', label: 'Duplas de mentoria' },
      { n: '45', label: 'Bolsas atribuídas' },
      { n: '22', label: 'Países representados' },
    ],
    note: 'Dados de ilustração',
  },
  cta: {
    title: 'Pronto para te juntares ao hub?',
    body: 'A inscrição demora três minutos. Gratuita para menores de 35 anos, em toda a rede.',
    primary: 'Criar o meu perfil',
    secondary: 'Descobrir a Democracy Together',
  },
};

const ar: YouthContent = {
  hero: {
    chip: 'فضاء الشباب',
    titlePre: 'لديك أفكار من أجل الديمقراطية. ونحن نمنحك وسائل ',
    titleEm: 'الفعل',
    titlePost: '.',
    lead: 'فضاء لمن هم دون الخامسة والثلاثين: للتعلّم والمساهمة والنشر، بمرافقة موجّهين من الشبكة. في أفريقيا كما في أوروبا.',
    ctaJoin: 'الانضمام إلى الفضاء',
    ctaPrograms: 'اطّلع على البرامج',
    badges: ['مجاني للشباب', 'الهاتف أولاً', 'FR / EN / ES / PT / AR'],
  },
  parcours: {
    eyebrow: 'مسارك',
    title: 'أربع مراحل، بإيقاعك أنت',
    lead: 'تتقدّم متى شئت. كل مرحلة تفتح التي تليها وتنمّي حضورك داخل الشبكة.',
    steps: [
      {
        n: '1',
        title: 'الاكتشاف',
        body: 'فهم الرهانات عبر صيغ قصيرة وميسّرة.',
      },
      {
        n: '2',
        title: 'التعلّم',
        body: 'حقيبة أدوات، وندوات عبر الإنترنت، ووحدات لتعزيز القدرات.',
      },
      {
        n: '3',
        title: 'المساهمة',
        body: 'نشر مقال رأي، أو الانضمام إلى مجموعة عمل، أو الترشح لمنحة.',
      },
      {
        n: '4',
        title: 'التوجيه',
        body: 'أن تنقل بدورك ما تعلّمته، وأن ترافق شخصاً من الشبكة.',
      },
    ],
    gam: {
      title: 'تقدّمك له وزن',
      body: 'كل مساهمة تكسبك شارات وحضوراً لدى مراكز الدراسات الأعضاء. اعتراف ملموس، لا مجرد زينة.',
      badges: [
        { letter: 'D', label: 'مكتشِف', locked: false },
        { letter: 'C', label: 'مساهِم', locked: false },
        { letter: 'M', label: 'موجِّه', locked: true },
        { letter: 'A', label: 'سفير', locked: true },
      ],
      levelLabel: 'مستواك',
      level: 'المستوى 2 · مساهِم',
      points: '620 / 1000 نقطة',
      remaining: 'لم يتبقَّ سوى مساهمتين',
      chips: ['3 منشورات', 'ندوة واحدة', 'ملف موثَّق'],
      note: 'ملف تعريفي نموذجي',
      pct: 62,
    },
  },
  programmes: {
    title: 'البرامج',
    lead: 'آليات ملموسة للانتقال من الفكرة إلى الفعل.',
    featured: {
      kicker: 'البرنامج الرئيسي',
      title: 'التوجيه',
      body: 'نقرنك بموجّه ذي خبرة من الشبكة، وفق لغتك ومنطقتك ومواضيع اهتمامك. ستة أشهر من المرافقة، وأهداف واضحة، ومتابعة حقيقية.',
      cta: 'اطلب موجّهاً',
    },
    funding: {
      kicker: 'التمويل',
      title: 'منح موجّهة',
      body: 'منح للباحثين الشباب ولمراكز الدراسات الناشئة، بالأولوية في المناطق الهشّة.',
      cta: 'اطّلع على المنح',
    },
    items: [
      {
        kicker: 'التعلّم',
        title: 'حقيبة الأدوات',
        body: 'أدلة ونماذج ووحدات قصيرة لتطوير الكفاءات، مع شهادة.',
        cta: 'افتح الحقيبة',
      },
      {
        kicker: 'النشر',
        title: 'مقالات الرأي',
        body: 'أرسل مساهمة قصيرة، مصحوبة بدعم تحريري من الشبكة.',
        cta: 'اقترح مقال رأي',
      },
      {
        kicker: 'الفعل',
        title: 'الحملات',
        body: 'انضم إلى حملات التوعية وإلى فعاليات الشباب في داكار وبروكسل.',
        cta: 'اطّلع على الحملات',
      },
    ],
  },
  mentor: {
    eyebrow: 'التوجيه',
    title: 'ثنائي عمل، لا استمارة',
    body: 'يتم الإقران وفق مواضيعك ولغتك ومنطقتك. أنت تحدّد الأهداف مع موجّهك، والشبكة تتكفّل بالمتابعة وبانتظام الجلسات.',
    cta: 'ابحث عن موجّهي',
    mentors: [
      {
        initials: 'AW',
        name: 'أميناتا واد',
        field: 'الحوكمة المحلية · داكار',
        role: 'موجِّهة',
      },
      {
        initials: 'PV',
        name: 'بيتر فاندنبرغ',
        field: 'الديمقراطية الرقمية · بروكسل',
        role: 'موجِّه',
      },
      {
        initials: 'LK',
        name: 'ليندا كواسي',
        field: 'مكافحة الفساد · أبيدجان',
        role: 'موجِّهة',
      },
    ],
  },
  testimonial: {
    quote:
      'نشرتُ أول مقال رأي لي في الثالثة والعشرين بفضل هذا الفضاء. وبعد ستة أشهر، وظّفني مركز الدراسات الذي أعمل به. فتحت لي الشبكة أبواباً كنت أحسبها موصدة.',
    attrName: 'فاطو ن.، 24 سنة',
    attrPlace: 'داكار',
    attrNote: '(شهادة توضيحية)',
    stats: [
      { n: '1 200', u: '+', label: 'شاب منخرط' },
      { n: '180', label: 'ثنائي توجيه' },
      { n: '45', label: 'منحة مُسندة' },
      { n: '22', label: 'بلداً ممثَّلاً' },
    ],
    note: 'بيانات توضيحية',
  },
  cta: {
    title: 'هل أنت مستعد للانضمام؟',
    body: 'لا يستغرق التسجيل سوى ثلاث دقائق. مجاني لمن هم دون الخامسة والثلاثين، في كل أنحاء الشبكة.',
    primary: 'أنشئ ملفي',
    secondary: 'اكتشف Democracy Together',
  },
};

// Table exhaustive par construction (cf. `projects-content.ts`).
const BY_LOCALE: Record<Locale, YouthContent> = { fr, en, es, pt, ar };

export function getYouthContent(locale: Locale): YouthContent {
  return BY_LOCALE[locale];
}
