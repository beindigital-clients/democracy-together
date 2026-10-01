// CODED NEWS (F-15) — SINGLE source, shared by the site (fallback for
// /actualites while the `contentNews` table has no published article) and by
// the internal import that copies it into that table (cf. `./events.ts`).
//
// These three articles used to live in Sanity, one document per language
// (French and English only, so the news page was empty in the three other
// languages). Here an article is ONE entry carrying its five languages, under
// one slug: the French slug the French article already had.
import type { SiteLocale } from '../../locales';

export type CodedNewsText = {
  title: string;
  excerpt: string;
  // Paragraphs, in reading order.
  body: string[];
};

export type CodedNews = {
  slug: string;
  // Publication day, `YYYY-MM-DD`.
  publishedOn: string;
  text: Record<SiteLocale, CodedNewsText>;
};

// Newest first: the order of the list page.
export const CODED_NEWS: readonly CodedNews[] = [
  {
    slug: 'collectif-fondateur',
    publishedOn: '2026-06-20',
    text: {
      fr: {
        title: 'Le collectif fondateur de Democracy Together est réuni',
        excerpt:
          "Scientifiques, diplomates et entrepreneurs posent les bases d'un réseau de think tanks entre l'Afrique et l'Europe.",
        body: [
          "Democracy Together franchit une première étape : son collectif fondateur s'est réuni autour d'une conviction commune, relier les think tanks qui travaillent sur la démocratie de part et d'autre de la Méditerranée.",
          'Les fondateurs ont arrêté les quatre axes de la mission — agréger les analyses, promouvoir les idées, renforcer les capacités, innover et inclure — et engagé la rédaction des statuts de la future association loi 1901.',
        ],
      },
      en: {
        title: 'Democracy Together’s founding collective convenes',
        excerpt:
          'Scientists, diplomats and entrepreneurs lay the foundations of a think-tank network between Africa and Europe.',
        body: [
          'Democracy Together reaches a first milestone: its founding collective has convened around a shared conviction, to connect the think tanks working on democracy on both sides of the Mediterranean.',
          'The founders settled the four pillars of the mission — aggregate analyses, promote ideas, strengthen capacity, innovate and include — and began drafting the statutes of the future non-profit association.',
        ],
      },
      es: {
        title: 'Se reúne el colectivo fundador de Democracy Together',
        excerpt:
          'Científicos, diplomáticos y emprendedores sientan las bases de una red de centros de estudios entre África y Europa.',
        body: [
          'Democracy Together da un primer paso: su colectivo fundador se ha reunido en torno a una convicción común, conectar a los centros de estudios que trabajan sobre la democracia a ambas orillas del Mediterráneo.',
          'Los fundadores han fijado los cuatro ejes de la misión —agregar los análisis, promover las ideas, reforzar las capacidades, innovar e incluir— y han iniciado la redacción de los estatutos de la futura asociación de tipo loi 1901.',
        ],
      },
      pt: {
        title: 'O coletivo fundador da Democracy Together está reunido',
        excerpt:
          'Cientistas, diplomatas e empreendedores lançam as bases de uma rede de centros de estudos entre África e a Europa.',
        body: [
          'A Democracy Together dá um primeiro passo: o seu coletivo fundador reuniu-se em torno de uma convicção comum, ligar os centros de estudos que trabalham sobre a democracia nas duas margens do Mediterrâneo.',
          'Os fundadores definiram os quatro eixos da missão — agregar as análises, promover as ideias, reforçar as capacidades, inovar e incluir — e deram início à redação dos estatutos da futura associação do tipo loi 1901.',
        ],
      },
      ar: {
        title: 'اجتماع المجموعة المؤسِّسة لـ Democracy Together',
        excerpt:
          'علماء ودبلوماسيون ورواد أعمال يضعون أسس شبكة لمراكز الدراسات بين أفريقيا وأوروبا.',
        body: [
          'تخطو Democracy Together خطوتها الأولى: فقد اجتمعت مجموعتها المؤسِّسة حول قناعة مشتركة، هي الربط بين مراكز الدراسات التي تعمل على قضايا الديمقراطية على ضفتَي المتوسط.',
          'وقد حدّد المؤسسون محاور الرسالة الأربعة — تجميع التحليلات، ونشر الأفكار، وتعزيز القدرات، والابتكار والإدماج — وشرعوا في صياغة النظام الأساسي للجمعية المقبلة الخاضعة لقانون 1901.',
        ],
      },
    },
  },
  {
    slug: 'conference-inaugurale-paris',
    publishedOn: '2026-06-12',
    text: {
      fr: {
        title: 'Cap sur la conférence inaugurale à Paris',
        excerpt:
          'Le réseau prépare son lancement public et sa première conférence, prévus en 2026.',
        body: [
          'La conférence inaugurale de Democracy Together réunira à Paris chercheurs, décideurs et partenaires pour présenter le réseau, ses premiers travaux et sa feuille de route Afrique-Europe.',
          'Cet événement marquera l’ouverture des adhésions et l’amorce des relais régionaux de Dakar et de Bruxelles.',
        ],
      },
      en: {
        title: 'Heading towards the inaugural conference in Paris',
        excerpt:
          'The network is preparing its public launch and first conference, planned for 2026.',
        body: [
          'Democracy Together’s inaugural conference will bring together researchers, decision-makers and partners in Paris to present the network, its first work and its Africa–Europe roadmap.',
          'The event will mark the opening of memberships and the start of the Dakar and Brussels regional relays.',
        ],
      },
      es: {
        title: 'Rumbo a la conferencia inaugural en París',
        excerpt:
          'La red prepara su lanzamiento público y su primera conferencia, previstos para 2026.',
        body: [
          'La conferencia inaugural de Democracy Together reunirá en París a investigadores, responsables políticos y socios para presentar la red, sus primeros trabajos y su hoja de ruta África-Europa.',
          'Este evento marcará la apertura de las adhesiones y la puesta en marcha de las delegaciones regionales de Dakar y Bruselas.',
        ],
      },
      pt: {
        title: 'Rumo à conferência inaugural em Paris',
        excerpt:
          'A rede prepara o seu lançamento público e a sua primeira conferência, previstos para 2026.',
        body: [
          'A conferência inaugural da Democracy Together reunirá em Paris investigadores, decisores e parceiros para apresentar a rede, os seus primeiros trabalhos e o seu roteiro África-Europa.',
          'Este evento marcará a abertura das adesões e o arranque das delegações regionais de Dakar e de Bruxelas.',
        ],
      },
      ar: {
        title: 'نحو المؤتمر التأسيسي في باريس',
        excerpt:
          'تستعد الشبكة لإطلاقها العلني ولمؤتمرها الأول، المرتقبَين سنة 2026.',
        body: [
          'سيجمع المؤتمر التأسيسي لـ Democracy Together في باريس باحثين وصانعي قرار وشركاء، لتقديم الشبكة وأولى أعمالها وخارطة طريقها بين أفريقيا وأوروبا.',
          'وسيشكّل هذا الحدث انطلاقة العضويات وبداية إرساء فرعَي داكار وبروكسل الجهويين.',
        ],
      },
    },
  },
  {
    slug: 'afrique-europe-democratie',
    publishedOn: '2026-06-05',
    text: {
      fr: {
        title: "Relier l'Afrique et l'Europe autour de la démocratie",
        excerpt:
          'Pourquoi un réseau transcontinental de think tanks, et ce qu’il veut changer.',
        body: [
          "Les analyses sur l'état de la démocratie restent souvent cloisonnées par pays ou par continent. Democracy Together veut les rassembler en un corpus commun, comparable et citable.",
          'En reliant des institutions du Sénégal à la Belgique, le réseau entend faire circuler les idées et porter une voix commune auprès des décideurs et des médias.',
        ],
      },
      en: {
        title: 'Connecting Africa and Europe around democracy',
        excerpt:
          'Why a transcontinental think-tank network, and what it aims to change.',
        body: [
          'Analyses on the state of democracy too often stay siloed by country or by continent. Democracy Together wants to bring them together into a shared, comparable and citable corpus.',
          'By connecting institutions from Senegal to Belgium, the network intends to circulate ideas and carry a shared voice to decision-makers and the media.',
        ],
      },
      es: {
        title: 'Conectar África y Europa en torno a la democracia',
        excerpt:
          'Por qué una red transcontinental de centros de estudios, y qué quiere cambiar.',
        body: [
          'Los análisis sobre el estado de la democracia suelen quedar compartimentados por país o por continente. Democracy Together quiere reunirlos en un corpus común, comparable y citable.',
          'Al conectar instituciones desde Senegal hasta Bélgica, la red pretende hacer circular las ideas y defender una voz común ante los responsables políticos y los medios de comunicación.',
        ],
      },
      pt: {
        title: 'Ligar África e a Europa em torno da democracia',
        excerpt:
          'Porquê uma rede transcontinental de centros de estudos, e o que pretende mudar.',
        body: [
          'As análises sobre o estado da democracia continuam muitas vezes compartimentadas por país ou por continente. A Democracy Together quer reuni-las num corpus comum, comparável e citável.',
          'Ao ligar instituições do Senegal à Bélgica, a rede pretende fazer circular as ideias e defender uma voz comum junto dos decisores e dos meios de comunicação social.',
        ],
      },
      ar: {
        title: 'الربط بين أفريقيا وأوروبا حول الديمقراطية',
        excerpt:
          'لماذا شبكة عابرة للقارات لمراكز الدراسات، وما الذي تسعى إلى تغييره.',
        body: [
          'كثيراً ما تظل التحليلات المتعلقة بحالة الديمقراطية محصورة داخل حدود البلد أو القارة. وتسعى Democracy Together إلى جمعها في متن مشترك قابل للمقارنة وللاستشهاد.',
          'ومن خلال الربط بين مؤسسات تمتد من السنغال إلى بلجيكا، تعتزم الشبكة تعميم الأفكار وحمل صوت مشترك لدى صانعي القرار ووسائل الإعلام.',
        ],
      },
    },
  },
];
