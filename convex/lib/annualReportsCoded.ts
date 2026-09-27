import type { SiteLocale } from './locales';
import type { ReportContent } from './annualReports';

// ÉDITIONS CODÉES des rapports annuels (F-41) — le contenu historique, écrit
// dans le dépôt avant que les rapports aient un modèle de données.
//
// Il vit ici, côté Convex, et non plus dans `src/lib/reports-content.ts` :
// c'est la SOURCE de la migration (`annualReports.importCodedReport` le
// recopie en base, champ pour champ) ET le REPLI des pages publiques tant
// qu'une année n'a pas été importée. Une seule copie, lue par les deux
// côtés — Convex ne peut pas importer `src/`, l'inverse passe par l'alias
// `@convex`.
//
// Pour une association qui se constitue (loi 1901 en cours), le rapport
// inaugural couvre la fondation, la gouvernance, les premiers chantiers et
// les perspectives — faits établis, AUCUNE métrique inventée : d'où des
// chiffres clés VIDES. Vérifié sans terme banni.

export type CodedReport = ReportContent & { year: number; inaugural: boolean };

// Années codées (descendant). Une seule édition.
export const CODED_REPORT_YEARS = [2026] as const;

const fr: Record<number, CodedReport> = {
  2026: {
    year: 2026,
    inaugural: true,
    title: "Rapport d'activité 2026",
    intro:
      "Première année de Democracy Together : la constitution du réseau, ses fondations méthodologiques et ses premiers chantiers communs entre l'Afrique et l'Europe.",
    keyFigures: [],
    chapters: [
      {
        heading: 'Fondation et mission',
        body: [
          "Democracy Together est né en 2026 de la conviction qu'aucun continent n'a le monopole de l'expérience démocratique. Constitué en association loi 1901 (en cours de constitution), le réseau réunit des think tanks, des chercheurs et des partenaires d'Afrique et d'Europe autour d'une comparaison honnête, sans posture donneuse de leçons.",
          "Le travail s'organise autour de cinq axes : gouvernance numérique, participation citoyenne, lutte anti-corruption, transitions démocratiques et crises globales. Pour chacun, le réseau publie sa position et relie les analyses de ses membres.",
        ],
      },
      {
        heading: 'Gouvernance',
        body: [
          "La structure distingue l'orientation stratégique de l'animation opérationnelle. Les fondateurs — Abdou Samb, Philippe Kourilsky et Pierre Vimont — ont posé les statuts et les principes de fonctionnement, ouverts à l'adhésion de nouvelles organisations.",
          'Un comité scientifique indépendant du secrétariat supervise les travaux à vocation méthodologique, à commencer par le Baromètre : il relit la méthode, signale les biais et valide chaque édition avant publication.',
        ],
      },
      {
        heading: 'Le Baromètre de la démocratie',
        body: [
          'Chantier méthodologique central de la première année : un indice composite Afrique-Europe, construit par méta-agrégation de sources sous licence ouverte. Données et codebook sont publiés en accès ouvert (CC-BY), pour que chacun puisse reproduire et contester le résultat.',
          'La première édition fonctionne comme preuve de concept. Les valeurs réelles, pays par pays, seront branchées et validées par le comité scientifique au fil des éditions.',
        ],
      },
      {
        heading: 'Premiers outils du réseau',
        body: [
          "Mise en place de la bibliothèque commune (publications citables, dépôt par les membres et modération a priori), de l'annuaire des organisations et des synthèses thématiques. Ces outils forment le socle de la production collective des prochaines années.",
        ],
      },
      {
        heading: 'Perspectives 2026-2027',
        body: [
          "Consolider l'adhésion des premiers membres, brancher les données réelles du Baromètre, ouvrir un espace d'expression modéré entre membres et tenir la conférence inaugurale du réseau.",
          "La trajectoire reste celle d'un commun : ouvert, contestable, amélioré par ses contributeurs.",
        ],
      },
    ],
  },
};

const en: Record<number, CodedReport> = {
  2026: {
    year: 2026,
    inaugural: true,
    title: 'Activity report 2026',
    intro:
      "Democracy Together's first year: building the network, its methodological foundations and its first joint work between Africa and Europe.",
    keyFigures: [],
    chapters: [
      {
        heading: 'Founding and mission',
        body: [
          'Democracy Together was founded in 2026 on the conviction that no continent holds a monopoly on democratic experience. Set up as a French not-for-profit (loi 1901, in formation), the network brings together think tanks, researchers and partners from Africa and Europe around an honest comparison, without lecturing.',
          'Work is organised around five pillars: digital governance, citizen participation, anti-corruption, democratic transitions and global crises. For each, the network publishes its stance and links its members’ analyses.',
        ],
      },
      {
        heading: 'Governance',
        body: [
          'The structure separates strategic direction from operational coordination. The founders — Abdou Samb, Philippe Kourilsky and Pierre Vimont — set the statutes and operating principles, open to new member organisations.',
          'A scientific committee, independent from the secretariat, oversees methodological work, starting with the Barometer: it reviews the method, flags biases and validates each edition before publication.',
        ],
      },
      {
        heading: 'The Democracy Barometer',
        body: [
          'The central methodological project of the first year: a composite Africa-Europe index built by meta-aggregating open-licence sources. Data and codebook are published openly (CC-BY), so anyone can reproduce and challenge the result.',
          'The first edition works as a proof of concept. Real, country-by-country values will be wired in and validated by the scientific committee across future editions.',
        ],
      },
      {
        heading: 'First network tools',
        body: [
          'Setting up the shared library (citable publications, member submission and upfront moderation), the directory of organisations and the thematic syntheses. These tools form the basis of the collective output of the years to come.',
        ],
      },
      {
        heading: 'Outlook 2026-2027',
        body: [
          'Consolidate the first members, wire in the Barometer’s real data, open a moderated space for expression between members and hold the network’s inaugural conference.',
          'The course remains that of a commons: open, contestable, improved by its contributors.',
        ],
      },
    ],
  },
};

const es: Record<number, CodedReport> = {
  2026: {
    year: 2026,
    inaugural: true,
    title: 'Informe de actividad 2026',
    intro:
      'Primer año de Democracy Together: la constitución de la red, sus cimientos metodológicos y sus primeros trabajos comunes entre África y Europa.',
    keyFigures: [],
    chapters: [
      {
        heading: 'Fundación y misión',
        body: [
          'Democracy Together nació en 2026 de la convicción de que ningún continente tiene el monopolio de la experiencia democrática. Constituida como asociación de derecho francés (loi 1901, en constitución), la red reúne a centros de estudios, investigadores y socios de África y Europa en torno a una comparación honesta, sin dar lecciones a nadie.',
          'El trabajo se organiza en torno a cinco ejes: gobernanza digital, participación ciudadana, lucha contra la corrupción, transiciones democráticas y crisis globales. Para cada uno, la red publica su posición y enlaza los análisis de sus miembros.',
        ],
      },
      {
        heading: 'Gobernanza',
        body: [
          'La estructura distingue la orientación estratégica de la coordinación operativa. Los fundadores —Abdou Samb, Philippe Kourilsky y Pierre Vimont— fijaron los estatutos y los principios de funcionamiento, abiertos a la adhesión de nuevas organizaciones.',
          'Un comité científico independiente de la secretaría supervisa los trabajos de vocación metodológica, empezando por el Barómetro: revisa el método, señala los sesgos y valida cada edición antes de su publicación.',
        ],
      },
      {
        heading: 'El Barómetro de la democracia',
        body: [
          'Proyecto metodológico central del primer año: un índice compuesto África-Europa, construido por metaagregación de fuentes con licencia abierta. Los datos y el libro de códigos se publican en acceso abierto (CC-BY), para que cualquiera pueda reproducir y refutar el resultado.',
          'La primera edición funciona como prueba de concepto. Los valores reales, país por país, se incorporarán y serán validados por el comité científico a lo largo de las siguientes ediciones.',
        ],
      },
      {
        heading: 'Primeras herramientas de la red',
        body: [
          'Puesta en marcha de la biblioteca común (publicaciones citables, depósito por los miembros y moderación previa), del directorio de organizaciones y de las síntesis temáticas. Estas herramientas forman la base de la producción colectiva de los próximos años.',
        ],
      },
      {
        heading: 'Perspectivas 2026-2027',
        body: [
          'Consolidar la adhesión de los primeros miembros, incorporar los datos reales del Barómetro, abrir un espacio de expresión moderado entre miembros y celebrar la conferencia inaugural de la red.',
          'La trayectoria sigue siendo la de un bien común: abierto, refutable, mejorado por quienes contribuyen a él.',
        ],
      },
    ],
  },
};

const pt: Record<number, CodedReport> = {
  2026: {
    year: 2026,
    inaugural: true,
    title: 'Relatório de atividade 2026',
    intro:
      'Primeiro ano da Democracy Together: a constituição da rede, os seus alicerces metodológicos e os seus primeiros trabalhos comuns entre África e a Europa.',
    keyFigures: [],
    chapters: [
      {
        heading: 'Fundação e missão',
        body: [
          'A Democracy Together nasceu em 2026 da convicção de que nenhum continente detém o monopólio da experiência democrática. Constituída como associação de direito francês (loi 1901, em constituição), a rede reúne centros de estudos, investigadores e parceiros de África e da Europa em torno de uma comparação honesta, sem dar lições a ninguém.',
          'O trabalho organiza-se em torno de cinco eixos: governação digital, participação cidadã, combate à corrupção, transições democráticas e crises globais. Para cada um, a rede publica a sua posição e liga as análises dos seus membros.',
        ],
      },
      {
        heading: 'Governação',
        body: [
          'A estrutura distingue a orientação estratégica da coordenação operacional. Os fundadores — Abdou Samb, Philippe Kourilsky e Pierre Vimont — fixaram os estatutos e os princípios de funcionamento, abertos à adesão de novas organizações.',
          'Um comité científico independente do secretariado supervisiona os trabalhos de vocação metodológica, a começar pelo Barómetro: revê o método, assinala os enviesamentos e valida cada edição antes da publicação.',
        ],
      },
      {
        heading: 'O Barómetro da democracia',
        body: [
          'Projeto metodológico central do primeiro ano: um índice compósito África-Europa, construído por metaagregação de fontes com licença aberta. Os dados e o livro de códigos são publicados em acesso aberto (CC-BY), para que qualquer pessoa possa reproduzir e contestar o resultado.',
          'A primeira edição funciona como prova de conceito. Os valores reais, país a país, serão incorporados e validados pelo comité científico ao longo das edições seguintes.',
        ],
      },
      {
        heading: 'Primeiras ferramentas da rede',
        body: [
          'Criação da biblioteca comum (publicações citáveis, depósito pelos membros e moderação prévia), do diretório de organizações e das sínteses temáticas. Estas ferramentas formam a base da produção coletiva dos próximos anos.',
        ],
      },
      {
        heading: 'Perspetivas 2026-2027',
        body: [
          'Consolidar a adesão dos primeiros membros, incorporar os dados reais do Barómetro, abrir um espaço de expressão moderado entre membros e realizar a conferência inaugural da rede.',
          'A trajetória continua a ser a de um bem comum: aberto, contestável, melhorado por quem para ele contribui.',
        ],
      },
    ],
  },
};

const ar: Record<number, CodedReport> = {
  2026: {
    year: 2026,
    inaugural: true,
    title: 'تقرير النشاط 2026',
    intro:
      'السنة الأولى لـ Democracy Together: تأسيس الشبكة، وأسسها المنهجية، وأولى أوراش عملها المشتركة بين أفريقيا وأوروبا.',
    keyFigures: [],
    chapters: [
      {
        heading: 'التأسيس والرسالة',
        body: [
          'وُلدت Democracy Together سنة 2026 من قناعة مفادها أن لا قارة تحتكر التجربة الديمقراطية. تأسست الشبكة في شكل جمعية خاضعة للقانون الفرنسي (قانون 1901، قيد التأسيس)، وهي تجمع مراكز دراسات وباحثين وشركاء من أفريقيا وأوروبا حول مقارنة نزيهة، بعيداً عن منطق إلقاء الدروس.',
          'ينتظم العمل حول خمسة محاور: الحوكمة الرقمية، والمشاركة المواطنة، ومكافحة الفساد، والانتقالات الديمقراطية، والأزمات العالمية. وتنشر الشبكة موقفها في كل محور منها وتربط بين تحليلات أعضائها.',
        ],
      },
      {
        heading: 'الحوكمة',
        body: [
          'يفصل الهيكل بين التوجيه الاستراتيجي والتنسيق التنفيذي. وقد وضع المؤسسون — عبدو سامب وفيليب كوريلسكي وبيير فيمون — النظام الأساسي ومبادئ الاشتغال، وهي مفتوحة لانضمام منظمات جديدة.',
          'تشرف لجنة علمية مستقلة عن الأمانة على الأعمال ذات الطابع المنهجي، وفي مقدمتها المؤشر: تراجع المنهجية، وتنبّه إلى التحيزات، وتصادق على كل إصدار قبل نشره.',
        ],
      },
      {
        heading: 'مؤشر الديمقراطية',
        body: [
          'الورش المنهجي المركزي للسنة الأولى: مؤشر مركّب لأفريقيا وأوروبا، مبني على التجميع الفوقي لمصادر ذات رخص مفتوحة. تُنشر البيانات ودليل الترميز في وصول مفتوح (CC-BY)، حتى يتمكن كل شخص من إعادة إنتاج النتيجة والاعتراض عليها.',
          'يعمل الإصدار الأول بوصفه إثباتاً للمفهوم. أما القيم الفعلية، بلداً بلداً، فستُدمج وتصادق عليها اللجنة العلمية عبر الإصدارات المقبلة.',
        ],
      },
      {
        heading: 'أولى أدوات الشبكة',
        body: [
          'إرساء المكتبة المشتركة (منشورات قابلة للاستشهاد، وإيداع من الأعضاء، ومراجعة قبلية)، ودليل المنظمات، والخلاصات المواضيعية. تشكّل هذه الأدوات قاعدة الإنتاج الجماعي للسنوات المقبلة.',
        ],
      },
      {
        heading: 'آفاق 2026-2027',
        body: [
          'ترسيخ انضمام الأعضاء الأوائل، ودمج البيانات الفعلية للمؤشر، وفتح فضاء تعبير خاضع للمراجعة بين الأعضاء، وعقد المؤتمر التأسيسي للشبكة.',
          'يظل المسار مسار مشترَك عام: مفتوح، قابل للاعتراض، يتحسّن بفضل المساهمين فيه.',
        ],
      },
    ],
  },
};

// Table exhaustive par construction : une langue du site manquante ne
// compile pas.
export const CODED_REPORTS: Record<SiteLocale, Record<number, CodedReport>> = {
  fr,
  en,
  es,
  pt,
  ar,
};

export function codedReport(
  locale: SiteLocale,
  year: number,
): CodedReport | null {
  return CODED_REPORTS[locale][year] ?? null;
}
