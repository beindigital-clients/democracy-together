import type { Locale } from '@/i18n/routing';
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

const es: Record<ThemeSlug, ThemeSynthesis> = {
  'gouvernance-numerique': {
    slug: 'gouvernance-numerique',
    dimension: 'D1',
    lead: 'Cómo regulan las democracias lo digital sin renunciar a las libertades, y cómo lo digital redefine a su vez el espacio público.',
    stance: [
      'Hoy son las plataformas las que deciden qué se ve, qué se comparte y qué se cree. Ese poder privado escapa en gran medida al control democrático, tanto en África como en Europa. La red documenta estos mecanismos y compara las respuestas regulatorias, desde las normas europeas hasta las leyes nacionales africanas sobre datos.',
      'Nuestro ángulo no es la desconfianza hacia la tecnología, sino la exigencia de rendición de cuentas: quién modera, con qué reglas y con qué recurso para la ciudadanía. Seguimos también los cortes de acceso y la vigilancia, que siguen siendo instrumentos de control político.',
    ],
    questions: [
      '¿Qué regulación de las plataformas protege el debate sin abrir la puerta a la censura estatal?',
      '¿Cómo garantizar la soberanía de los datos sin fragmentar su acceso?',
      '¿Qué recurso concreto tiene una persona frente a una decisión algorítmica?',
    ],
  },
  participation: {
    slug: 'participation',
    dimension: 'D2',
    lead: 'Más allá del voto: deliberación, compromiso local y confianza en las instituciones.',
    stance: [
      'La democracia no se reduce a las elecciones. Entre dos comicios, es la calidad de la participación —presupuestos participativos, consultas, vida asociativa— la que mantiene la confianza. La red estudia estos dispositivos y lo que los hace creíbles en lugar de cosméticos.',
      'Nos interesa en particular la juventud y las formas de compromiso que no pasan por los partidos. La desconfianza no es apatía: busca otros canales, que las instituciones captan mal.',
    ],
    questions: [
      '¿Qué distingue una consulta real de una consulta de fachada?',
      '¿Cómo volver a implicar a una juventud que se aleja de las urnas sin alejarse de la política?',
      '¿Qué papel corresponde a la sociedad civil en la elaboración de las decisiones?',
    ],
  },
  'anti-corruption': {
    slug: 'anti-corruption',
    dimension: 'D3',
    lead: 'Transparencia presupuestaria, integridad pública y rendición de cuentas: las condiciones concretas de la confianza.',
    stance: [
      'La corrupción no es solo una cuestión moral: desvía recursos, desacredita al Estado y alimenta el autoritarismo. La red privilegia el ángulo de los mecanismos —contratación pública, declaraciones de patrimonio, control independiente— antes que la indignación general.',
      'Documentamos lo que funciona: datos presupuestarios abiertos, protección de quienes alertan, tribunales de cuentas independientes. Y lo que falla, porque la lucha anticorrupción se utiliza a veces como arma contra los opositores.',
    ],
    questions: [
      '¿Cómo hacer que el gasto público sea realmente trazable y legible?',
      '¿Qué protección eficaz existe para quienes alertan?',
      '¿Cómo evitar que la lucha anticorrupción se convierta en un instrumento político?',
    ],
  },
  transitions: {
    slug: 'transitions',
    dimension: 'D4',
    lead: 'Salida del autoritarismo, alternancias y resiliencia: qué consolida una transición y qué la hace retroceder.',
    stance: [
      'Una transición no termina el día de la primera elección libre. Los retrocesos llegan a menudo después: captura de las instituciones, revisiones constitucionales, neutralización de los contrapesos. La red sigue estas trayectorias a largo plazo.',
      'Es aquí donde la comparación África-Europa resulta más fecunda: ambos continentes han conocido transiciones, consolidaciones y reversiones, a ritmos distintos. Cruzar estas experiencias ilumina más que cualquier caso aislado.',
    ],
    questions: [
      '¿Qué distingue una alternancia real de una simple rotación de élites?',
      '¿Cómo proteger los contrapesos durante una transición?',
      '¿Qué señales advierten de un retroceso democrático antes de que se haga visible?',
    ],
  },
  crises: {
    slug: 'crises',
    dimension: 'D5',
    lead: 'Clima, seguridad, migraciones, salud: cómo pesan las conmociones globales sobre la gobernanza democrática.',
    stance: [
      'Las crisis se han convertido en la prueba de fuego de las democracias. La urgencia justifica la excepción, la excepción se instala, y las libertades retroceden en nombre de la protección. La red estudia cómo responder a las conmociones sin sacrificar el Estado de derecho.',
      'Este eje es transversal: cruza los otros cuatro. Una crisis climática pone a prueba a la vez la participación, la transparencia y la resiliencia institucional. Lo tratamos como un revelador, no como un campo aparte.',
    ],
    questions: [
      '¿Cómo preservar el Estado de derecho bajo una urgencia prolongada?',
      '¿Quién decide, y bajo qué control, cuando la excepción se vuelve la regla?',
      '¿Qué lugar ocupa la ciudadanía en la respuesta a las crisis?',
    ],
  },
};

const pt: Record<ThemeSlug, ThemeSynthesis> = {
  'gouvernance-numerique': {
    slug: 'gouvernance-numerique',
    dimension: 'D1',
    lead: 'Como as democracias regulam o digital sem renunciar às liberdades — e como o digital, por sua vez, redefine o espaço público.',
    stance: [
      'Hoje são as plataformas que decidem o que é visto, partilhado e acreditado. Esse poder privado escapa em larga medida ao controlo democrático, tanto em África como na Europa. A rede documenta estes mecanismos e compara as respostas regulatórias, das regras europeias às leis nacionais africanas sobre dados.',
      'O nosso ângulo não é a desconfiança face à tecnologia, mas a exigência de prestação de contas: quem modera, segundo que regras, com que recurso para os cidadãos. Seguimos também os cortes de acesso e a vigilância, que continuam a ser instrumentos de controlo político.',
    ],
    questions: [
      'Que regulação das plataformas protege o debate sem abrir caminho à censura do Estado?',
      'Como garantir a soberania dos dados sem fragmentar o seu acesso?',
      'Que recurso concreto tem um cidadão perante uma decisão algorítmica?',
    ],
  },
  participation: {
    slug: 'participation',
    dimension: 'D2',
    lead: 'Para além do voto: deliberação, envolvimento local e confiança nas instituições.',
    stance: [
      'A democracia não se resume à eleição. Entre dois atos eleitorais, é a qualidade da participação — orçamentos participativos, consultas, vida associativa — que sustenta a confiança. A rede estuda estes dispositivos e aquilo que os torna credíveis em vez de cosméticos.',
      'Interessa-nos em particular a juventude e as formas de envolvimento que não passam pelos partidos. A desconfiança não é apatia: procura outros canais, que as instituições captam mal.',
    ],
    questions: [
      'O que distingue uma consulta real de uma consulta de fachada?',
      'Como voltar a envolver uma juventude que se afasta das urnas sem se afastar da política?',
      'Que papel cabe à sociedade civil na construção das decisões?',
    ],
  },
  'anti-corruption': {
    slug: 'anti-corruption',
    dimension: 'D3',
    lead: 'Transparência orçamental, integridade pública e prestação de contas: as condições concretas da confiança.',
    stance: [
      'A corrupção não é apenas uma questão moral: desvia recursos, descredibiliza o Estado e alimenta o autoritarismo. A rede privilegia o ângulo dos mecanismos — contratação pública, declarações de património, controlo independente — em vez da indignação genérica.',
      'Documentamos o que funciona: dados orçamentais abertos, proteção de quem denuncia, tribunais de contas independentes. E o que falha, já que o combate à corrupção é por vezes usado como arma contra opositores.',
    ],
    questions: [
      'Como tornar a despesa pública verdadeiramente rastreável e legível?',
      'Que proteção eficaz existe para quem denuncia?',
      'Como impedir que o combate à corrupção se torne um instrumento político?',
    ],
  },
  transitions: {
    slug: 'transitions',
    dimension: 'D4',
    lead: 'Saída do autoritarismo, alternâncias e resiliência: o que consolida uma transição e o que a faz recuar.',
    stance: [
      'Uma transição não termina no dia da primeira eleição livre. Os recuos surgem muitas vezes depois: captura das instituições, revisões constitucionais, neutralização dos contrapoderes. A rede acompanha estas trajetórias no longo prazo.',
      'É aqui que a comparação África-Europa é mais fecunda: ambos os continentes conheceram transições, consolidações e reversões, a ritmos diferentes. Cruzar estas experiências esclarece mais do que qualquer caso isolado.',
    ],
    questions: [
      'O que distingue uma alternância real de uma simples rotação de elites?',
      'Como proteger os contrapoderes durante uma transição?',
      'Que sinais avisam de um retrocesso democrático antes de ele se tornar visível?',
    ],
  },
  crises: {
    slug: 'crises',
    dimension: 'D5',
    lead: 'Clima, segurança, migrações, saúde: como os choques globais pesam sobre a governação democrática.',
    stance: [
      'As crises tornaram-se a prova de fogo das democracias. A urgência justifica a exceção, a exceção instala-se, e as liberdades recuam em nome da proteção. A rede estuda como responder aos choques sem sacrificar o Estado de direito.',
      'Este eixo é transversal: cruza os outros quatro. Uma crise climática põe à prova, ao mesmo tempo, a participação, a transparência e a resiliência institucional. Tratamo-lo como um revelador, não como um campo à parte.',
    ],
    questions: [
      'Como preservar o Estado de direito sob uma urgência prolongada?',
      'Quem decide, e sob que controlo, quando a exceção se torna regra?',
      'Que lugar cabe aos cidadãos na resposta às crises?',
    ],
  },
};

const ar: Record<ThemeSlug, ThemeSynthesis> = {
  'gouvernance-numerique': {
    slug: 'gouvernance-numerique',
    dimension: 'D1',
    lead: 'كيف تنظّم الديمقراطيات المجال الرقمي دون التخلي عن الحريات، وكيف يعيد الرقمي بدوره تشكيل الفضاء العام.',
    stance: [
      'صارت المنصات اليوم هي التي تقرر ما يُرى وما يُتقاسَم وما يُصدَّق. وهذه السلطة الخاصة تفلت إلى حد بعيد من الرقابة الديمقراطية، في أفريقيا كما في أوروبا. توثّق الشبكة هذه الآليات وتقارن الاستجابات التنظيمية، من القواعد الأوروبية إلى القوانين الوطنية الأفريقية المتعلقة بالبيانات.',
      'زاوية نظرنا ليست الارتياب من التقنية بل المطالبة بالمساءلة: من يراجع المحتوى، ووفق أي قواعد، وبأي سبيل انتصاف للمواطنين. ونتابع كذلك قطع خدمة الإنترنت والمراقبة، وهما أداتان ما زالتا في خدمة السيطرة السياسية.',
    ],
    questions: [
      'أي تنظيم للمنصات يحمي النقاش دون أن يفتح الباب لرقابة الدولة؟',
      'كيف تُضمن السيادة على البيانات دون تشتيت النفاذ إليها؟',
      'ما سبيل الانتصاف الملموس المتاح لمواطن أمام قرار خوارزمي؟',
    ],
  },
  participation: {
    slug: 'participation',
    dimension: 'D2',
    lead: 'أبعد من الاقتراع: التداول، والانخراط المحلي، والثقة في المؤسسات.',
    stance: [
      'لا تختزل الديمقراطية في الانتخاب. فبين استحقاقين، جودة المشاركة — الميزانيات التشاركية، والاستشارات، والحياة الجمعوية — هي ما يصون الثقة. تدرس الشبكة هذه الآليات وما يجعلها ذات مصداقية بدل أن تكون شكلية.',
      'ونهتم بوجه خاص بالشباب وبأشكال الانخراط التي لا تمرّ عبر الأحزاب. فالارتياب ليس لامبالاة: إنه يبحث عن قنوات أخرى تلتقطها المؤسسات على نحو رديء.',
    ],
    questions: [
      'ما الذي يميّز استشارة حقيقية عن استشارة صورية؟',
      'كيف يُعاد إشراك شباب ينصرف عن صناديق الاقتراع دون أن ينصرف عن السياسة؟',
      'أي دور للمجتمع المدني في صنع القرار؟',
    ],
  },
  'anti-corruption': {
    slug: 'anti-corruption',
    dimension: 'D3',
    lead: 'شفافية الميزانية، ونزاهة المرفق العام، والمساءلة: الشروط الملموسة للثقة.',
    stance: [
      'الفساد ليس مسألة أخلاقية فحسب: فهو يحوّل الموارد، وينزع المصداقية عن الدولة، ويغذّي الاستبداد. تفضّل الشبكة زاوية الآليات — الصفقات العمومية، والتصريح بالممتلكات، والرقابة المستقلة — على السخط العام.',
      'نوثّق ما ينجح: البيانات الميزانياتية المفتوحة، وحماية المبلّغين، ومحاكم الحسابات المستقلة. ونوثّق أيضاً ما يخفق، لأن مكافحة الفساد تُستعمل أحياناً سلاحاً ضد الخصوم.',
    ],
    questions: [
      'كيف يصبح الإنفاق العمومي قابلاً فعلاً للتتبّع وللقراءة؟',
      'أي حماية فعلية متاحة للمبلّغين؟',
      'كيف نحول دون أن تتحوّل مكافحة الفساد إلى أداة سياسية؟',
    ],
  },
  transitions: {
    slug: 'transitions',
    dimension: 'D4',
    lead: 'الخروج من الاستبداد، والتناوب، والقدرة على الصمود: ما الذي يرسّخ انتقالاً وما الذي يعيده إلى الوراء.',
    stance: [
      'لا ينتهي الانتقال يوم أول انتخاب حر. فالانتكاسات تأتي غالباً بعده: الاستحواذ على المؤسسات، والمراجعات الدستورية، وتحييد السلطات المضادة. تتابع الشبكة هذه المسارات على المدى الطويل.',
      'وهنا تحديداً تكون المقارنة بين أفريقيا وأوروبا أكثر خصوبة: فقد عرفت القارتان انتقالات وترسيخاً وانتكاسات، بإيقاعات مختلفة. وتقاطع هذه التجارب يضيء أكثر من أي حالة منفردة.',
    ],
    questions: [
      'ما الذي يميّز تناوباً حقيقياً عن مجرد دوران للنخب؟',
      'كيف تُحمى السلطات المضادة أثناء فترة انتقالية؟',
      'ما الإشارات التي تنذر بتراجع ديمقراطي قبل أن يصبح مرئياً؟',
    ],
  },
  crises: {
    slug: 'crises',
    dimension: 'D5',
    lead: 'المناخ والأمن والهجرة والصحة: كيف تثقل الصدمات العالمية كاهل الحوكمة الديمقراطية.',
    stance: [
      'صارت الأزمات محكّ الديمقراطيات. الاستعجال يبرّر الاستثناء، والاستثناء يستقرّ، وتتراجع الحريات باسم الحماية. تدرس الشبكة كيف يمكن مواجهة الصدمات دون التضحية بدولة القانون.',
      'هذا المحور عرضاني: يتقاطع مع المحاور الأربعة الأخرى. فالأزمة المناخية تختبر في آن واحد المشاركة والشفافية وقدرة المؤسسات على الصمود. ونتعامل معها بوصفها كاشفاً، لا حقلاً منفصلاً.',
    ],
    questions: [
      'كيف تُصان دولة القانون في ظل استعجال يطول أمده؟',
      'من يقرّر، وتحت أي رقابة، حين يصير الاستثناء قاعدة؟',
      'أي موقع للمواطنين في الاستجابة للأزمات؟',
    ],
  },
};

// Table exhaustive par construction (cf. `projects-content.ts`).
const BY_LOCALE: Record<Locale, Record<ThemeSlug, ThemeSynthesis>> = {
  fr,
  en,
  es,
  pt,
  ar,
};

export function getThemeSyntheses(locale: Locale): ThemeSynthesis[] {
  const table = BY_LOCALE[locale];
  return THEME_SLUGS.map((s) => table[s]);
}

export function getThemeSynthesis(
  locale: Locale,
  slug: string,
): ThemeSynthesis | null {
  const table = BY_LOCALE[locale];
  return (THEME_SLUGS as readonly string[]).includes(slug)
    ? table[slug as ThemeSlug]
    : null;
}
