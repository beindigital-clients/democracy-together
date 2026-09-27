import type { Locale } from '@/i18n/routing';
import { resolveLocale } from '@/i18n/locale';

// Contenu légal (F-09 RGPD) — mentions légales, politique de confidentialité,
// déclaration d'accessibilité. Bilingue FR/EN. Rédigé à partir des faits connus
// (association loi 1901, agence Be in Digital, sous-traitants techniques) ; les
// éléments juridiques non confirmés sont explicitement marqués « [à compléter :
// … ] » (jamais inventés) — à renseigner avant mise en ligne / passage juridique.
//
// IMPORTANT : ne contient aucune fabrication d'identifiants (SIRET/RNA), de noms
// de responsables ou d'adresses ; ces champs portent un marqueur à compléter.

// `items` : énumération rendue en LISTE (`<ul>`), et non en paragraphes
// successifs — la déclaration d'accessibilité en porte plusieurs (non-
// conformités, voies de recours), et une liste annonce son nombre d'éléments
// (RGAA 9.3).
export type LegalSection = {
  heading: string;
  body: string[];
  items?: string[];
};

export type LegalDoc = {
  eyebrow: string;
  title: string;
  updatedLabel: string;
  updated: string;
  intro: string;
  homeLabel: string;
  sections: LegalSection[];
};

export type LegalKind = 'mentions' | 'confidentialite' | 'accessibilite';

const TODO_FR = '[à compléter avant mise en ligne]';
const TODO_EN = '[to be completed before launch]';
const TODO_ES = '[pendiente de completar antes de la publicación]';
const TODO_PT = '[a completar antes da publicação]';
const TODO_AR = '[يُستكمَل قبل النشر]';

const CONTENT: Record<LegalKind, Record<Locale, LegalDoc>> = {
  mentions: {
    fr: {
      eyebrow: 'Informations légales',
      title: 'Mentions légales',
      updatedLabel: 'Dernière mise à jour',
      updated: '27 juin 2026',
      homeLabel: 'Accueil',
      intro:
        'Conformément à la loi n° 2004-575 du 21 juin 2004 pour la confiance dans l’économie numérique, voici les informations relatives à l’éditeur et à l’hébergement du présent site.',
      sections: [
        {
          heading: 'Éditeur du site',
          body: [
            `Le site est édité par Democracy Together, association régie par la loi du 1ᵉʳ juillet 1901, dont le siège social est situé à Paris ${TODO_FR} (adresse postale complète).`,
            `Numéro RNA (Répertoire National des Associations) : ${TODO_FR}.`,
            'Contact : via le formulaire de la page Contact du site.',
          ],
        },
        {
          heading: 'Directeur de la publication',
          body: [
            `Le directeur ou la directrice de la publication est le représentant légal de l’association : ${TODO_FR} (nom et qualité).`,
          ],
        },
        {
          heading: 'Conception et réalisation',
          body: ['Conception, design et développement : Be in Digital.'],
        },
        {
          heading: 'Hébergement et infrastructure',
          body: [
            'La plateforme s’appuie sur les prestataires techniques suivants :',
            'Vercel Inc. — hébergement et diffusion de l’application web.',
            'Convex, Inc. — backend applicatif (comptes, annuaire, publications) et stockage des fichiers.',
            'Sanity AS — système de gestion des contenus éditoriaux (espace de rédaction).',
            `Les coordonnées légales complètes et les régions d’hébergement des données de ces prestataires sont précisées dans la politique de confidentialité ${TODO_FR} (régions UE à confirmer).`,
          ],
        },
        {
          heading: 'Propriété intellectuelle',
          body: [
            'Sauf mention contraire, les contenus éditoriaux du site (textes, identité visuelle, éléments graphiques) sont la propriété de Democracy Together ou de ses partenaires, et protégés par le droit de la propriété intellectuelle.',
            'Les publications déposées par les membres restent la propriété de leurs auteurs ; elles sont diffusées selon la licence indiquée sur chaque fiche de publication.',
          ],
        },
        {
          heading: 'Liens hypertextes',
          body: [
            'Le site peut contenir des liens vers des sites tiers. Democracy Together n’exerce aucun contrôle sur ces ressources externes et décline toute responsabilité quant à leur contenu.',
          ],
        },
        {
          heading: 'Données personnelles',
          body: [
            'Le traitement des données à caractère personnel est détaillé dans la politique de confidentialité, accessible depuis le pied de page du site.',
          ],
        },
      ],
    },
    en: {
      eyebrow: 'Legal information',
      title: 'Legal notice',
      updatedLabel: 'Last updated',
      updated: 'June 27, 2026',
      homeLabel: 'Home',
      intro:
        'In accordance with French Act No. 2004-575 of 21 June 2004 on confidence in the digital economy, the following information identifies the site’s publisher and host.',
      sections: [
        {
          heading: 'Site publisher',
          body: [
            `The site is published by Democracy Together, a non-profit association governed by the French Act of 1 July 1901, with its registered office in Paris ${TODO_EN} (full postal address).`,
            `Association registration number (RNA): ${TODO_EN}.`,
            'Contact: via the Contact page form on this site.',
          ],
        },
        {
          heading: 'Publication director',
          body: [
            `The publication director is the association’s legal representative: ${TODO_EN} (name and capacity).`,
          ],
        },
        {
          heading: 'Design and development',
          body: ['Design and development: Be in Digital.'],
        },
        {
          heading: 'Hosting and infrastructure',
          body: [
            'The platform relies on the following technical providers:',
            'Vercel Inc. — hosting and delivery of the web application.',
            'Convex, Inc. — application backend (accounts, directory, publications) and file storage.',
            'Sanity AS — editorial content management system.',
            `The full legal details and data-hosting regions of these providers are set out in the privacy policy ${TODO_EN} (EU regions to be confirmed).`,
          ],
        },
        {
          heading: 'Intellectual property',
          body: [
            'Unless stated otherwise, the site’s editorial content (text, visual identity, graphic elements) belongs to Democracy Together or its partners and is protected by intellectual-property law.',
            'Publications deposited by members remain the property of their authors and are distributed under the licence indicated on each publication page.',
          ],
        },
        {
          heading: 'Hyperlinks',
          body: [
            'The site may contain links to third-party sites. Democracy Together has no control over these external resources and accepts no liability for their content.',
          ],
        },
        {
          heading: 'Personal data',
          body: [
            'The processing of personal data is detailed in the privacy policy, accessible from the site footer.',
          ],
        },
      ],
    },
    es: {
      eyebrow: 'Información legal',
      title: 'Aviso legal',
      updatedLabel: 'Última actualización',
      updated: '27 de junio de 2026',
      homeLabel: 'Inicio',
      intro:
        'De conformidad con la ley francesa n.º 2004-575, de 21 de junio de 2004, para la confianza en la economía digital, se facilita a continuación la información relativa al editor y al alojamiento de este sitio.',
      sections: [
        {
          heading: 'Editor del sitio',
          body: [
            `El sitio está editado por Democracy Together, asociación regida por la ley francesa de 1 de julio de 1901, con domicilio social en París ${TODO_ES} (dirección postal completa).`,
            `Número RNA (Registro Nacional de Asociaciones de Francia): ${TODO_ES}.`,
            'Contacto: a través del formulario de la página Contacto del sitio.',
          ],
        },
        {
          heading: 'Director de la publicación',
          body: [
            `El director o la directora de la publicación es el representante legal de la asociación: ${TODO_ES} (nombre y cargo).`,
          ],
        },
        {
          heading: 'Diseño y desarrollo',
          body: ['Concepción, diseño y desarrollo: Be in Digital.'],
        },
        {
          heading: 'Alojamiento e infraestructura',
          body: [
            'La plataforma se apoya en los siguientes proveedores técnicos:',
            'Vercel Inc. — alojamiento y distribución de la aplicación web.',
            'Convex, Inc. — backend de la aplicación (cuentas, directorio, publicaciones) y almacenamiento de archivos.',
            'Sanity AS — sistema de gestión de contenidos editoriales (espacio de redacción).',
            `Los datos legales completos y las regiones de alojamiento de los datos de estos proveedores se detallan en la política de privacidad ${TODO_ES} (regiones de la UE por confirmar).`,
          ],
        },
        {
          heading: 'Propiedad intelectual',
          body: [
            'Salvo indicación en contrario, los contenidos editoriales del sitio (textos, identidad visual, elementos gráficos) son propiedad de Democracy Together o de sus socios, y están protegidos por el derecho de propiedad intelectual.',
            'Las publicaciones depositadas por los miembros siguen siendo propiedad de sus autores; se difunden según la licencia indicada en cada ficha de publicación.',
          ],
        },
        {
          heading: 'Enlaces',
          body: [
            'El sitio puede contener enlaces a sitios de terceros. Democracy Together no ejerce control alguno sobre esos recursos externos y declina toda responsabilidad sobre su contenido.',
          ],
        },
        {
          heading: 'Datos personales',
          body: [
            'El tratamiento de los datos de carácter personal se detalla en la política de privacidad, accesible desde el pie de página del sitio.',
          ],
        },
        {
          heading: 'Lengua de referencia',
          body: [
            'Esta traducción se facilita para su comodidad. En caso de divergencia de interpretación, prevalece la versión francesa, único texto de referencia ante la ley francesa aplicable.',
          ],
        },
      ],
    },
    pt: {
      eyebrow: 'Informação legal',
      title: 'Aviso legal',
      updatedLabel: 'Última atualização',
      updated: '27 de junho de 2026',
      homeLabel: 'Início',
      intro:
        'Em conformidade com a lei francesa n.º 2004-575, de 21 de junho de 2004, relativa à confiança na economia digital, apresentam-se em seguida as informações relativas ao editor e ao alojamento deste sítio.',
      sections: [
        {
          heading: 'Editor do sítio',
          body: [
            `O sítio é editado pela Democracy Together, associação regida pela lei francesa de 1 de julho de 1901, com sede em Paris ${TODO_PT} (morada postal completa).`,
            `Número RNA (Registo Nacional de Associações de França): ${TODO_PT}.`,
            'Contacto: através do formulário da página Contacto do sítio.',
          ],
        },
        {
          heading: 'Diretor da publicação',
          body: [
            `O diretor ou a diretora da publicação é o representante legal da associação: ${TODO_PT} (nome e qualidade).`,
          ],
        },
        {
          heading: 'Conceção e desenvolvimento',
          body: ['Conceção, design e desenvolvimento: Be in Digital.'],
        },
        {
          heading: 'Alojamento e infraestrutura',
          body: [
            'A plataforma assenta nos seguintes prestadores técnicos:',
            'Vercel Inc. — alojamento e distribuição da aplicação web.',
            'Convex, Inc. — backend aplicacional (contas, diretório, publicações) e armazenamento de ficheiros.',
            'Sanity AS — sistema de gestão de conteúdos editoriais (espaço de redação).',
            `Os dados legais completos e as regiões de alojamento dos dados destes prestadores são precisados na política de privacidade ${TODO_PT} (regiões da UE por confirmar).`,
          ],
        },
        {
          heading: 'Propriedade intelectual',
          body: [
            'Salvo menção em contrário, os conteúdos editoriais do sítio (textos, identidade visual, elementos gráficos) são propriedade da Democracy Together ou dos seus parceiros, e estão protegidos pelo direito de propriedade intelectual.',
            'As publicações depositadas pelos membros continuam a ser propriedade dos seus autores; são difundidas segundo a licença indicada em cada ficha de publicação.',
          ],
        },
        {
          heading: 'Hiperligações',
          body: [
            'O sítio pode conter ligações para sítios de terceiros. A Democracy Together não exerce qualquer controlo sobre esses recursos externos e declina toda a responsabilidade quanto ao seu conteúdo.',
          ],
        },
        {
          heading: 'Dados pessoais',
          body: [
            'O tratamento dos dados de caráter pessoal é detalhado na política de privacidade, acessível a partir do rodapé do sítio.',
          ],
        },
        {
          heading: 'Língua de referência',
          body: [
            'Esta tradução é disponibilizada por comodidade. Em caso de divergência de interpretação, prevalece a versão francesa, único texto de referência perante a lei francesa aplicável.',
          ],
        },
      ],
    },
    ar: {
      eyebrow: 'معلومات قانونية',
      title: 'البيانات القانونية',
      updatedLabel: 'آخر تحديث',
      updated: '27 يونيو 2026',
      homeLabel: 'الرئيسية',
      intro:
        'عملاً بالقانون الفرنسي رقم 2004-575 الصادر في 21 يونيو 2004 بشأن الثقة في الاقتصاد الرقمي، تجدون فيما يلي المعلومات المتعلقة بناشر هذا الموقع وباستضافته.',
      sections: [
        {
          heading: 'ناشر الموقع',
          body: [
            `ينشر الموقعَ Democracy Together، وهي جمعية خاضعة للقانون الفرنسي الصادر في فاتح يوليوز 1901، ويقع مقرها الاجتماعي بباريس ${TODO_AR} (العنوان البريدي الكامل).`,
            `رقم السجل الوطني للجمعيات بفرنسا (RNA): ${TODO_AR}.`,
            'الاتصال: عبر استمارة صفحة «اتصل بنا» في الموقع.',
          ],
        },
        {
          heading: 'مدير النشر',
          body: [
            `مدير النشر أو مديرته هو الممثل القانوني للجمعية: ${TODO_AR} (الاسم والصفة).`,
          ],
        },
        {
          heading: 'التصميم والتطوير',
          body: ['التصوّر والتصميم والتطوير: Be in Digital.'],
        },
        {
          heading: 'الاستضافة والبنية التحتية',
          body: [
            'تعتمد المنصة على مقدّمي الخدمات التقنية التالية:',
            'Vercel Inc. — استضافة تطبيق الويب وتوزيعه.',
            'Convex, Inc. — الواجهة الخلفية للتطبيق (الحسابات، الدليل، المنشورات) وتخزين الملفات.',
            'Sanity AS — نظام إدارة المحتوى التحريري (فضاء التحرير).',
            `تُفصَّل البيانات القانونية الكاملة لهؤلاء المزوّدين ومناطق استضافة البيانات لديهم في سياسة الخصوصية ${TODO_AR} (مناطق الاتحاد الأوروبي في انتظار التأكيد).`,
          ],
        },
        {
          heading: 'الملكية الفكرية',
          body: [
            'ما لم يُذكر خلاف ذلك، فإن المحتويات التحريرية للموقع (النصوص، والهوية البصرية، والعناصر الرسومية) ملك لـ Democracy Together أو لشركائها، وهي محمية بقانون الملكية الفكرية.',
            'تبقى المنشورات التي يودعها الأعضاء ملكاً لأصحابها؛ وتُنشر وفق الرخصة المبيَّنة في بطاقة كل منشور.',
          ],
        },
        {
          heading: 'الروابط الخارجية',
          body: [
            'قد يتضمّن الموقع روابط نحو مواقع طرف ثالث. ولا تمارس Democracy Together أي رقابة على هذه الموارد الخارجية وتخلي مسؤوليتها عن محتواها.',
          ],
        },
        {
          heading: 'المعطيات الشخصية',
          body: [
            'تُفصَّل معالجة المعطيات ذات الطابع الشخصي في سياسة الخصوصية، المتاحة من أسفل صفحات الموقع.',
          ],
        },
        {
          heading: 'اللغة المرجعية',
          body: [
            'هذه الترجمة مقدَّمة للتيسير. وفي حال اختلاف التأويل، تسري النسخة الفرنسية باعتبارها النص المرجعي الوحيد أمام القانون الفرنسي الواجب التطبيق.',
          ],
        },
      ],
    },
  },

  confidentialite: {
    fr: {
      eyebrow: 'Protection des données',
      title: 'Politique de confidentialité',
      updatedLabel: 'Dernière mise à jour',
      updated: '27 juin 2026',
      homeLabel: 'Accueil',
      intro:
        'Democracy Together accorde une grande importance à la protection de vos données personnelles. Cette politique explique quelles données nous traitons, pourquoi, et quels sont vos droits au titre du Règlement général sur la protection des données (RGPD).',
      sections: [
        {
          heading: 'Responsable du traitement',
          body: [
            'Le responsable du traitement est l’association Democracy Together (voir les Mentions légales).',
            `Délégué à la protection des données / référent RGPD : ${TODO_FR} (adresse de contact dédiée).`,
          ],
        },
        {
          heading: 'Données que nous traitons',
          body: [
            'Compte et profil : adresse e-mail, nom, rôle dans le réseau, langue préférée.',
            'Adhésion : informations transmises via le formulaire de candidature (organisation ou personne, pays, message).',
            'Contributions : publications déposées et fichiers associés, ainsi que leur statut de modération.',
            'Contact : contenu des messages envoyés via le formulaire de contact.',
            'Données techniques : journaux d’audit des actions sensibles (sécurité) et données strictement nécessaires au fonctionnement (session d’authentification).',
          ],
        },
        {
          heading: 'Finalités et bases légales',
          body: [
            'Gestion des comptes et des adhésions — exécution de la relation associative et, le cas échéant, consentement.',
            'Publication et modération des contributions — intérêt légitime du réseau à diffuser des travaux vérifiés.',
            'Sécurité, prévention des abus et journalisation — intérêt légitime et respect des obligations légales.',
            'Réponses aux demandes de contact — intérêt légitime à répondre aux sollicitations.',
          ],
        },
        {
          heading: 'Destinataires et sous-traitants',
          body: [
            'Vos données ne sont jamais vendues. Elles sont accessibles à l’équipe habilitée de Democracy Together et à nos sous-traitants techniques, liés par contrat :',
            'Vercel (hébergement), Convex (backend et stockage), Sanity (contenus éditoriaux), Resend (envoi d’e-mails transactionnels), Zoho (messagerie du domaine).',
          ],
        },
        {
          heading: 'Transferts hors Union européenne',
          body: [
            `Certains prestataires sont susceptibles d’héberger ou de traiter des données en dehors de l’Union européenne. Les garanties appropriées (clauses contractuelles types, régions UE lorsque disponibles) sont en cours de mise en conformité : ${TODO_FR} (régions et garanties à confirmer).`,
          ],
        },
        {
          heading: 'Durées de conservation',
          body: [
            `Compte : conservé tant que le compte est actif, puis supprimé ou anonymisé ${TODO_FR} (délai à valider) après la dernière activité.`,
            `Candidatures et messages de contact : ${TODO_FR} (durée à valider).`,
            'Publications publiées : conservées tant qu’elles sont en ligne dans la bibliothèque.',
            `Journaux d’audit : ${TODO_FR} (durée à valider, finalité sécurité).`,
          ],
        },
        {
          heading: 'Cookies et traceurs',
          body: [
            'Le site utilise uniquement des cookies et stockages strictement nécessaires : préférence de langue, préférence de thème et session d’authentification. Ils sont exemptés de consentement car indispensables au service.',
            'Aucun traceur publicitaire ni outil de mesure d’audience tiers n’est actuellement déposé. Si une mesure d’audience est ajoutée à l’avenir, votre consentement préalable sera recueilli.',
          ],
        },
        {
          heading: 'Vos droits',
          body: [
            'Vous disposez d’un droit d’accès, de rectification, d’effacement, de limitation, d’opposition et de portabilité de vos données.',
            'Pour exercer ces droits, contactez-nous via le formulaire de contact ou à l’adresse du référent RGPD indiquée ci-dessus.',
            'Vous pouvez également introduire une réclamation auprès de la Commission nationale de l’informatique et des libertés (CNIL), www.cnil.fr.',
          ],
        },
      ],
    },
    en: {
      eyebrow: 'Data protection',
      title: 'Privacy policy',
      updatedLabel: 'Last updated',
      updated: 'June 27, 2026',
      homeLabel: 'Home',
      intro:
        'Democracy Together takes the protection of your personal data seriously. This policy explains what data we process, why, and what your rights are under the General Data Protection Regulation (GDPR).',
      sections: [
        {
          heading: 'Data controller',
          body: [
            'The data controller is the Democracy Together association (see the Legal notice).',
            `Data protection officer / GDPR contact: ${TODO_EN} (dedicated contact address).`,
          ],
        },
        {
          heading: 'Data we process',
          body: [
            'Account and profile: email address, name, network role, preferred language.',
            'Membership: information submitted via the application form (organisation or individual, country, message).',
            'Contributions: deposited publications and associated files, along with their moderation status.',
            'Contact: the content of messages sent via the contact form.',
            'Technical data: audit logs of sensitive actions (security) and data strictly necessary for operation (authentication session).',
          ],
        },
        {
          heading: 'Purposes and legal bases',
          body: [
            'Managing accounts and memberships — performance of the association relationship and, where applicable, consent.',
            'Publishing and moderating contributions — the network’s legitimate interest in disseminating vetted work.',
            'Security, abuse prevention and logging — legitimate interest and compliance with legal obligations.',
            'Responding to contact requests — legitimate interest in answering enquiries.',
          ],
        },
        {
          heading: 'Recipients and processors',
          body: [
            'Your data is never sold. It is accessible to authorised Democracy Together staff and to our contractually bound technical processors:',
            'Vercel (hosting), Convex (backend and storage), Sanity (editorial content), Resend (transactional email), Zoho (domain mailboxes).',
          ],
        },
        {
          heading: 'Transfers outside the European Union',
          body: [
            `Some providers may host or process data outside the European Union. Appropriate safeguards (standard contractual clauses, EU regions where available) are being brought into compliance: ${TODO_EN} (regions and safeguards to be confirmed).`,
          ],
        },
        {
          heading: 'Retention periods',
          body: [
            `Account: kept while the account is active, then deleted or anonymised ${TODO_EN} (period to be confirmed) after the last activity.`,
            `Applications and contact messages: ${TODO_EN} (period to be confirmed).`,
            'Published publications: kept while they remain online in the library.',
            `Audit logs: ${TODO_EN} (period to be confirmed, security purpose).`,
          ],
        },
        {
          heading: 'Cookies and trackers',
          body: [
            'The site uses only strictly necessary cookies and storage: language preference, theme preference and authentication session. These are exempt from consent as they are essential to the service.',
            'No advertising trackers or third-party analytics are currently set. If audience measurement is added in the future, your prior consent will be collected.',
          ],
        },
        {
          heading: 'Your rights',
          body: [
            'You have the right to access, rectify, erase, restrict, object to and port your data.',
            'To exercise these rights, contact us via the contact form or at the GDPR contact address above.',
            'You may also lodge a complaint with the French data protection authority (CNIL), www.cnil.fr.',
          ],
        },
      ],
    },
    es: {
      eyebrow: 'Protección de datos',
      title: 'Política de privacidad',
      updatedLabel: 'Última actualización',
      updated: '27 de junio de 2026',
      homeLabel: 'Inicio',
      intro:
        'Democracy Together concede una gran importancia a la protección de sus datos personales. Esta política explica qué datos tratamos, con qué finalidad y cuáles son sus derechos en virtud del Reglamento General de Protección de Datos (RGPD).',
      sections: [
        {
          heading: 'Responsable del tratamiento',
          body: [
            'El responsable del tratamiento es la asociación Democracy Together (véase el Aviso legal).',
            `Delegado de protección de datos / referente RGPD: ${TODO_ES} (dirección de contacto específica).`,
          ],
        },
        {
          heading: 'Datos que tratamos',
          body: [
            'Cuenta y perfil: dirección de correo electrónico, nombre, función en la red, lengua preferida.',
            'Adhesión: información enviada mediante el formulario de candidatura (organización o persona, país, mensaje).',
            'Contribuciones: publicaciones depositadas y archivos asociados, así como su estado de moderación.',
            'Contacto: contenido de los mensajes enviados a través del formulario de contacto.',
            'Datos técnicos: registros de auditoría de las acciones sensibles (seguridad) y datos estrictamente necesarios para el funcionamiento (sesión de autenticación).',
          ],
        },
        {
          heading: 'Finalidades y bases jurídicas',
          body: [
            'Gestión de cuentas y adhesiones — ejecución de la relación asociativa y, en su caso, consentimiento.',
            'Publicación y moderación de las contribuciones — interés legítimo de la red en difundir trabajos verificados.',
            'Seguridad, prevención de abusos y registro — interés legítimo y cumplimiento de obligaciones legales.',
            'Respuesta a las solicitudes de contacto — interés legítimo en atender las peticiones.',
          ],
        },
        {
          heading: 'Destinatarios y encargados del tratamiento',
          body: [
            'Sus datos nunca se venden. Son accesibles al equipo autorizado de Democracy Together y a nuestros encargados técnicos, vinculados por contrato:',
            'Vercel (alojamiento), Convex (backend y almacenamiento), Sanity (contenidos editoriales), Resend (envío de correos transaccionales), Zoho (correo del dominio).',
          ],
        },
        {
          heading: 'Transferencias fuera de la Unión Europea',
          body: [
            `Algunos proveedores pueden alojar o tratar datos fuera de la Unión Europea. Las garantías adecuadas (cláusulas contractuales tipo, regiones de la UE cuando estén disponibles) están en proceso de adecuación: ${TODO_ES} (regiones y garantías por confirmar).`,
          ],
        },
        {
          heading: 'Plazos de conservación',
          body: [
            `Cuenta: conservada mientras la cuenta esté activa y, después, suprimida o anonimizada ${TODO_ES} (plazo por validar) tras la última actividad.`,
            `Candidaturas y mensajes de contacto: ${TODO_ES} (plazo por validar).`,
            'Publicaciones publicadas: conservadas mientras estén en línea en la biblioteca.',
            `Registros de auditoría: ${TODO_ES} (plazo por validar, finalidad de seguridad).`,
          ],
        },
        {
          heading: 'Cookies y rastreadores',
          body: [
            'El sitio utiliza únicamente cookies y almacenamientos estrictamente necesarios: preferencia de lengua, preferencia de tema y sesión de autenticación. Están exentos de consentimiento por ser indispensables para el servicio.',
            'Actualmente no se instala ningún rastreador publicitario ni herramienta de medición de audiencia de terceros. Si en el futuro se añade una medición de audiencia, se recabará su consentimiento previo.',
          ],
        },
        {
          heading: 'Sus derechos',
          body: [
            'Usted dispone de los derechos de acceso, rectificación, supresión, limitación, oposición y portabilidad de sus datos.',
            'Para ejercerlos, póngase en contacto con nosotros mediante el formulario de contacto o en la dirección del referente RGPD indicada más arriba.',
            'También puede presentar una reclamación ante la autoridad francesa de protección de datos (CNIL), www.cnil.fr.',
          ],
        },
        {
          heading: 'Lengua de referencia',
          body: [
            'Esta traducción se facilita para su comodidad. En caso de divergencia de interpretación, prevalece la versión francesa, único texto de referencia ante la ley francesa aplicable.',
          ],
        },
      ],
    },
    pt: {
      eyebrow: 'Proteção de dados',
      title: 'Política de privacidade',
      updatedLabel: 'Última atualização',
      updated: '27 de junho de 2026',
      homeLabel: 'Início',
      intro:
        'A Democracy Together atribui grande importância à proteção dos seus dados pessoais. Esta política explica que dados tratamos, com que finalidade, e quais são os seus direitos ao abrigo do Regulamento Geral sobre a Proteção de Dados (RGPD).',
      sections: [
        {
          heading: 'Responsável pelo tratamento',
          body: [
            'O responsável pelo tratamento é a associação Democracy Together (ver o Aviso legal).',
            `Encarregado da proteção de dados / responsável RGPD: ${TODO_PT} (endereço de contacto dedicado).`,
          ],
        },
        {
          heading: 'Dados que tratamos',
          body: [
            'Conta e perfil: endereço de correio eletrónico, nome, função na rede, língua preferida.',
            'Adesão: informações transmitidas através do formulário de candidatura (organização ou pessoa, país, mensagem).',
            'Contribuições: publicações depositadas e ficheiros associados, bem como o respetivo estado de moderação.',
            'Contacto: conteúdo das mensagens enviadas através do formulário de contacto.',
            'Dados técnicos: registos de auditoria das ações sensíveis (segurança) e dados estritamente necessários ao funcionamento (sessão de autenticação).',
          ],
        },
        {
          heading: 'Finalidades e fundamentos jurídicos',
          body: [
            'Gestão das contas e das adesões — execução da relação associativa e, se for caso disso, consentimento.',
            'Publicação e moderação das contribuições — interesse legítimo da rede em difundir trabalhos verificados.',
            'Segurança, prevenção de abusos e registo — interesse legítimo e cumprimento de obrigações legais.',
            'Resposta aos pedidos de contacto — interesse legítimo em responder às solicitações.',
          ],
        },
        {
          heading: 'Destinatários e subcontratantes',
          body: [
            'Os seus dados nunca são vendidos. São acessíveis à equipa habilitada da Democracy Together e aos nossos subcontratantes técnicos, vinculados por contrato:',
            'Vercel (alojamento), Convex (backend e armazenamento), Sanity (conteúdos editoriais), Resend (envio de mensagens transacionais), Zoho (correio do domínio).',
          ],
        },
        {
          heading: 'Transferências para fora da União Europeia',
          body: [
            `Alguns prestadores podem alojar ou tratar dados fora da União Europeia. As garantias adequadas (cláusulas contratuais-tipo, regiões da UE quando disponíveis) estão em processo de conformidade: ${TODO_PT} (regiões e garantias por confirmar).`,
          ],
        },
        {
          heading: 'Prazos de conservação',
          body: [
            `Conta: conservada enquanto a conta estiver ativa, sendo depois suprimida ou anonimizada ${TODO_PT} (prazo a validar) após a última atividade.`,
            `Candidaturas e mensagens de contacto: ${TODO_PT} (prazo a validar).`,
            'Publicações publicadas: conservadas enquanto estiverem em linha na biblioteca.',
            `Registos de auditoria: ${TODO_PT} (prazo a validar, finalidade de segurança).`,
          ],
        },
        {
          heading: 'Cookies e rastreadores',
          body: [
            'O sítio utiliza unicamente cookies e armazenamentos estritamente necessários: preferência de língua, preferência de tema e sessão de autenticação. Estão isentos de consentimento por serem indispensáveis ao serviço.',
            'Não é atualmente colocado qualquer rastreador publicitário nem ferramenta de medição de audiência de terceiros. Se no futuro for acrescentada uma medição de audiência, o seu consentimento prévio será recolhido.',
          ],
        },
        {
          heading: 'Os seus direitos',
          body: [
            'Dispõe dos direitos de acesso, retificação, apagamento, limitação, oposição e portabilidade dos seus dados.',
            'Para exercer estes direitos, contacte-nos através do formulário de contacto ou no endereço do responsável RGPD indicado acima.',
            'Pode igualmente apresentar uma reclamação junto da autoridade francesa de proteção de dados (CNIL), www.cnil.fr.',
          ],
        },
        {
          heading: 'Língua de referência',
          body: [
            'Esta tradução é disponibilizada por comodidade. Em caso de divergência de interpretação, prevalece a versão francesa, único texto de referência perante a lei francesa aplicável.',
          ],
        },
      ],
    },
    ar: {
      eyebrow: 'حماية المعطيات',
      title: 'سياسة الخصوصية',
      updatedLabel: 'آخر تحديث',
      updated: '27 يونيو 2026',
      homeLabel: 'الرئيسية',
      intro:
        'تولي Democracy Together أهمية كبرى لحماية معطياتكم الشخصية. توضّح هذه السياسة ما هي المعطيات التي نعالجها، ولأي غرض، وما هي حقوقكم بموجب النظام الأوروبي العام لحماية المعطيات (RGPD).',
      sections: [
        {
          heading: 'المسؤول عن المعالجة',
          body: [
            'المسؤول عن المعالجة هو جمعية Democracy Together (انظر البيانات القانونية).',
            `مندوب حماية المعطيات / المرجع في مجال RGPD: ${TODO_AR} (عنوان اتصال مخصص).`,
          ],
        },
        {
          heading: 'المعطيات التي نعالجها',
          body: [
            'الحساب والملف الشخصي: عنوان البريد الإلكتروني، والاسم، والدور داخل الشبكة، واللغة المفضلة.',
            'الانضمام: المعلومات المرسَلة عبر استمارة الترشح (منظمة أو شخص، البلد، الرسالة).',
            'المساهمات: المنشورات المودَعة والملفات المرتبطة بها، وكذا وضعها من حيث المراجعة.',
            'الاتصال: مضمون الرسائل المرسَلة عبر استمارة الاتصال.',
            'المعطيات التقنية: سجلات تدقيق العمليات الحساسة (الأمان) والمعطيات الضرورية حصراً للاشتغال (جلسة المصادقة).',
          ],
        },
        {
          heading: 'الغايات والأسس القانونية',
          body: [
            'تدبير الحسابات والانضمامات — تنفيذ العلاقة الجمعوية، والموافقة عند الاقتضاء.',
            'نشر المساهمات ومراجعتها — المصلحة المشروعة للشبكة في نشر أعمال مُتحقَّق منها.',
            'الأمان والوقاية من التجاوزات وحفظ السجلات — المصلحة المشروعة والوفاء بالالتزامات القانونية.',
            'الرد على طلبات الاتصال — المصلحة المشروعة في الاستجابة للطلبات.',
          ],
        },
        {
          heading: 'المرسَل إليهم والمتعاقدون من الباطن',
          body: [
            'لا تُباع معطياتكم أبداً. وهي متاحة للفريق المخوَّل داخل Democracy Together ولمتعاقدينا التقنيين المرتبطين بعقد:',
            'Vercel (الاستضافة)، وConvex (الواجهة الخلفية والتخزين)، وSanity (المحتويات التحريرية)، وResend (إرسال الرسائل المعاملاتية)، وZoho (بريد النطاق).',
          ],
        },
        {
          heading: 'النقل خارج الاتحاد الأوروبي',
          body: [
            `قد يستضيف بعض المزوّدين معطيات أو يعالجونها خارج الاتحاد الأوروبي. والضمانات الملائمة (البنود التعاقدية النموذجية، ومناطق الاتحاد الأوروبي عند توفرها) في طور المطابقة: ${TODO_AR} (المناطق والضمانات في انتظار التأكيد).`,
          ],
        },
        {
          heading: 'مدد الحفظ',
          body: [
            `الحساب: يُحفظ ما دام نشطاً، ثم يُحذف أو يُجهَّل ${TODO_AR} (المدة في انتظار المصادقة) بعد آخر نشاط.`,
            `الترشيحات ورسائل الاتصال: ${TODO_AR} (المدة في انتظار المصادقة).`,
            'المنشورات المنشورة: تُحفظ ما دامت متاحة في المكتبة.',
            `سجلات التدقيق: ${TODO_AR} (المدة في انتظار المصادقة، لغرض الأمان).`,
          ],
        },
        {
          heading: 'ملفات تعريف الارتباط وأدوات التتبّع',
          body: [
            'لا يستعمل الموقع سوى ملفات تعريف ارتباط ووسائل تخزين ضرورية حصراً: تفضيل اللغة، وتفضيل السمة، وجلسة المصادقة. وهي معفاة من الموافقة لكونها لا غنى عنها للخدمة.',
            'لا يُوضَع حالياً أي متتبّع إعلاني ولا أي أداة لقياس الجمهور تابعة لطرف ثالث. وإذا أُضيف قياس للجمهور مستقبلاً، فستُطلب موافقتكم المسبقة.',
          ],
        },
        {
          heading: 'حقوقكم',
          body: [
            'لكم الحق في النفاذ إلى معطياتكم وتصحيحها ومحوها وتقييد معالجتها والاعتراض عليها ونقلها.',
            'لممارسة هذه الحقوق، اتصلوا بنا عبر استمارة الاتصال أو على عنوان المرجع في مجال RGPD المذكور أعلاه.',
            'يمكنكم كذلك تقديم شكاية لدى السلطة الفرنسية لحماية المعطيات (CNIL)، www.cnil.fr.',
          ],
        },
        {
          heading: 'اللغة المرجعية',
          body: [
            'هذه الترجمة مقدَّمة للتيسير. وفي حال اختلاف التأويل، تسري النسخة الفرنسية باعتبارها النص المرجعي الوحيد أمام القانون الفرنسي الواجب التطبيق.',
          ],
        },
      ],
    },
  },

  // DÉCLARATION D'ACCESSIBILITÉ au format RGAA (F-08), établie à partir de
  // l'audit du 27/09/2026 (`docs/rgaa/audit-2026-09.md`). Elle affiche le taux
  // MESURÉ (72,6 %), pas le taux projeté après correctifs : ceux-ci sont
  // intégrés mais pas encore re-mesurés sur la version en ligne, et la
  // restitution par lecteur d'écran n'a pas été testée. Une déclaration ne
  // doit pas promettre plus que ce qui a été vérifié. À mettre à jour après le
  // contre-audit (taux, date, liste des non-conformités).
  accessibilite: {
    fr: {
      eyebrow: 'Accessibilité',
      title: 'Déclaration d’accessibilité',
      updatedLabel: 'Dernière mise à jour',
      updated: '27 septembre 2026',
      homeLabel: 'Accueil',
      intro:
        'Democracy Together s’engage à rendre son site accessible conformément à l’article 47 de la loi n° 2005-102 du 11 février 2005. La présente déclaration d’accessibilité s’applique au site Democracy Together, dans toutes ses versions linguistiques.',
      sections: [
        {
          heading: 'État de conformité',
          body: [
            'Le site Democracy Together est partiellement conforme avec le référentiel général d’amélioration de l’accessibilité (RGAA), version 4.1.2, en raison des non-conformités énumérées ci-dessous.',
          ],
        },
        {
          heading: 'Résultats des tests',
          body: [
            'L’audit de conformité réalisé le 27 septembre 2026 sur un échantillon de 19 pages révèle que 72,6 % des critères du RGAA 4.1.2 applicables sont respectés : 53 critères conformes, 20 non conformes, 33 non applicables. Le taux moyen de conformité par page est de 88,5 %.',
            'Des corrections portant sur les 20 critères non conformes ont été intégrées au site depuis l’audit. Elles seront vérifiées par un contre-audit, à l’issue duquel cette déclaration sera mise à jour avec le taux mesuré.',
          ],
        },
        {
          heading: 'Contenus non accessibles — non-conformités',
          body: [
            'Relevées lors de l’audit du 27 septembre 2026 (corrections intégrées, en attente de vérification par le contre-audit) :',
          ],
          items: [
            'des photographies d’illustration portaient une alternative textuelle inutile (critère 1.2) et deux images légendées n’étaient pas reliées à leur légende (1.9) ;',
            'l’option sélectionnée de certains filtres et formulaires n’était signalée que par la couleur (3.1) ; la bordure des champs de formulaire manquait de contraste (3.3) ;',
            'deux tableaux de données n’avaient pas de titre associé et l’un n’avait pas d’en-têtes de lignes (5.4, 5.6) ;',
            'certains liens n’étaient pas explicites : numéros de page, liens « CSV », entrées du menu d’administration (6.1) ;',
            'le bouton de choix de la langue et la palette de recherche n’étaient pas correctement restitués par les technologies d’assistance ; le nombre de résultats de recherche et certaines confirmations d’envoi n’étaient pas annoncés (7.1, 7.5) ;',
            'les pages de l’espace membre et de l’administration n’avaient pas de titre pertinent (8.6) ;',
            'dans les pages en arabe, les textes rédigés en français (descriptions des membres, titres de publications, billets) n’indiquaient ni leur langue ni leur sens de lecture (8.7, 8.10) ;',
            'la hiérarchie des titres présentait des sauts sur deux pages (9.1) ;',
            'la prise de focus n’était pas visible sur le champ de la palette de recherche et sur certains boutons radio (10.7) ;',
            'la page d’une publication défilait horizontalement sur un écran de 320 pixels de large (10.11) ;',
            'des champs de recherche n’avaient pas d’étiquette visible (11.1), un groupe de boutons radio n’avait pas de légende restituée (11.6) et le champ « Pays » de deux formulaires n’indiquait pas sa finalité (11.13) ;',
            'des compteurs n’étaient signalés que par un symbole (13.5) ;',
            'le globe interactif tournait en continu sans moyen de l’arrêter (13.8).',
          ],
        },
        {
          heading: 'Dérogations pour charge disproportionnée',
          body: ['Aucune.'],
        },
        {
          heading: 'Contenus non évalués ou tiers',
          body: [
            'Les contenus suivants n’ont pas été évalués lors de l’audit et leur accessibilité n’est pas garantie :',
          ],
          items: [
            'les documents PDF déposés par les membres dans la bibliothèque ; une version HTML (« Lire le document ») est proposée lorsque le texte peut en être extrait ;',
            'les replays vidéo d’événements publiés sur des plateformes externes (sous-titres et transcriptions à la charge des organisateurs) ;',
            'le module anti-robot reCAPTCHA de Google, contenu tiers invisible qui ne demande aucune action.',
          ],
        },
        {
          heading: 'Établissement de cette déclaration',
          body: [
            'Cette déclaration a été établie le 27 septembre 2026, à partir d’un audit de conformité réalisé le même jour.',
          ],
        },
        {
          heading: 'Technologies utilisées pour la réalisation du site',
          body: ['HTML5, CSS, JavaScript (React, Next.js), WAI-ARIA.'],
        },
        {
          heading: 'Environnement de test',
          body: [
            'Les vérifications ont été menées avec le navigateur Chromium 141 piloté par Playwright, sur ordinateur et en émulation mobile, en français et en arabe, en thème clair et sombre : arbre d’accessibilité du navigateur (noms, rôles, états, messages de statut), navigation au clavier seul, visibilité du focus, zoom de la page et du texte à 200 %, affichage à 320 pixels de large, espacement du texte.',
            'La restitution par des lecteurs d’écran (NVDA, JAWS, VoiceOver, TalkBack) n’a pas encore été testée ; elle fera partie du contre-audit.',
          ],
        },
        {
          heading: 'Outils pour évaluer l’accessibilité',
          body: [
            'axe-core 4.12, Playwright 1.61, html-validate 11, et des scripts de mesure de l’ordre de tabulation, du focus visible, du contraste, du redimensionnement et du zoom.',
          ],
        },
        {
          heading: 'Pages du site ayant fait l’objet de la vérification',
          body: [
            'Accueil, À propos, Annuaire du réseau, une fiche membre, Bibliothèque, une publication, Événements, un événement, Tribune, Hub jeunes, Baromètre, Rapport d’activité 2026, Adhésion, Contact, Recherche, Connexion, Espace membre, un écran d’administration (utilisateurs) et la présente déclaration.',
          ],
        },
        {
          heading: 'Retour d’information et contact',
          body: [
            'Si vous n’arrivez pas à accéder à un contenu ou à un service, vous pouvez nous contacter pour être orienté vers une alternative accessible ou obtenir le contenu sous une autre forme :',
          ],
          items: [
            'par le formulaire de la page « Contact » du site ;',
            `par courrier postal : ${TODO_FR} (adresse du siège).`,
          ],
        },
        {
          heading: 'Voies de recours',
          body: [
            'Cette procédure est à utiliser dans le cas suivant : vous avez signalé au responsable du site un défaut d’accessibilité qui vous empêche d’accéder à un contenu ou à un des services du site, et vous n’avez pas obtenu de réponse satisfaisante. Vous pouvez :',
          ],
          items: [
            'écrire un message au Défenseur des droits (formulaire en ligne sur www.defenseurdesdroits.fr) ;',
            'contacter le délégué du Défenseur des droits dans votre région ;',
            'envoyer un courrier par la poste (gratuit, ne pas mettre de timbre) : Défenseur des droits, Libre réponse 71120, 75342 Paris CEDEX 07.',
          ],
        },
      ],
    },
    en: {
      eyebrow: 'Accessibility',
      title: 'Accessibility statement',
      updatedLabel: 'Last updated',
      updated: 'September 27, 2026',
      homeLabel: 'Home',
      intro:
        'Democracy Together is committed to making its website accessible in accordance with Article 47 of French Act No. 2005-102 of 11 February 2005. This accessibility statement applies to the Democracy Together website in all its language versions.',
      sections: [
        {
          heading: 'Compliance status',
          body: [
            'The Democracy Together website is partially compliant with the French accessibility framework RGAA, version 4.1.2, due to the non-compliances listed below.',
          ],
        },
        {
          heading: 'Test results',
          body: [
            'The compliance audit carried out on 27 September 2026 on a sample of 19 pages shows that 72.6% of the applicable RGAA 4.1.2 criteria are met: 53 criteria compliant, 20 non-compliant, 33 not applicable. The average compliance rate per page is 88.5%.',
            'Fixes addressing the 20 non-compliant criteria have been integrated into the site since the audit. They will be verified by a follow-up audit, after which this statement will be updated with the measured rate.',
          ],
        },
        {
          heading: 'Non-accessible content — non-compliances',
          body: [
            'Found during the audit of 27 September 2026 (fixes integrated, pending verification by the follow-up audit):',
          ],
          items: [
            'illustrative photographs carried a needless text alternative (criterion 1.2) and two captioned images were not linked to their caption (1.9);',
            'the selected option of some filters and forms was indicated by colour alone (3.1); form field borders lacked contrast (3.3);',
            'two data tables had no associated title and one had no row headers (5.4, 5.6);',
            'some links were not explicit: page numbers, “CSV” links, administration menu entries (6.1);',
            'the language button and the search palette were not correctly conveyed to assistive technologies; the number of search results and some submission confirmations were not announced (7.1, 7.5);',
            'the member area and administration pages had no relevant page title (8.6);',
            'on Arabic pages, texts written in French (member descriptions, publication titles, posts) did not state their language or reading direction (8.7, 8.10);',
            'the heading hierarchy skipped levels on two pages (9.1);',
            'keyboard focus was not visible on the search palette field and on some radio buttons (10.7);',
            'a publication page scrolled horizontally on a 320-pixel-wide screen (10.11);',
            'search fields had no visible label (11.1), a radio button group had no conveyed legend (11.6) and the “Country” field of two forms did not state its purpose (11.13);',
            'some counters were indicated by a symbol alone (13.5);',
            'the interactive globe rotated continuously with no way to stop it (13.8).',
          ],
        },
        {
          heading: 'Exemptions for disproportionate burden',
          body: ['None.'],
        },
        {
          heading: 'Content not assessed or third-party content',
          body: [
            'The following content was not assessed during the audit and its accessibility is not guaranteed:',
          ],
          items: [
            'PDF documents uploaded by members to the library; an HTML version (“Read the document”) is offered when their text can be extracted;',
            'video replays of events published on external platforms (captions and transcripts are the organisers’ responsibility);',
            'Google’s reCAPTCHA anti-bot module, an invisible third-party component that requires no action.',
          ],
        },
        {
          heading: 'Preparation of this statement',
          body: [
            'This statement was prepared on 27 September 2026, based on a compliance audit carried out on the same day.',
          ],
        },
        {
          heading: 'Technologies used to build the site',
          body: ['HTML5, CSS, JavaScript (React, Next.js), WAI-ARIA.'],
        },
        {
          heading: 'Test environment',
          body: [
            'Checks were carried out with the Chromium 141 browser driven by Playwright, on desktop and in mobile emulation, in French and Arabic, in light and dark themes: the browser’s accessibility tree (names, roles, states, status messages), keyboard-only navigation, focus visibility, 200% page and text zoom, display at 320 pixels wide, text spacing.',
            'Output through screen readers (NVDA, JAWS, VoiceOver, TalkBack) has not yet been tested; it will be part of the follow-up audit.',
          ],
        },
        {
          heading: 'Tools used to assess accessibility',
          body: [
            'axe-core 4.12, Playwright 1.61, html-validate 11, and scripts measuring tab order, visible focus, contrast, reflow and zoom.',
          ],
        },
        {
          heading: 'Pages checked for compliance',
          body: [
            'Home, About, Network directory, a member profile, Library, a publication, Events, an event, Forum, Youth hub, Barometer, 2026 Activity report, Membership, Contact, Search, Sign in, Member area, an administration screen (users) and this statement.',
          ],
        },
        {
          heading: 'Feedback and contact',
          body: [
            'If you cannot access a piece of content or a service, contact us to be directed to an accessible alternative or to obtain the content in another form:',
          ],
          items: [
            'through the form on the site’s “Contact” page;',
            `by post: ${TODO_EN} (head office address).`,
          ],
        },
        {
          heading: 'Remedies',
          body: [
            'Use this procedure if you have reported an accessibility barrier preventing you from accessing content or a service on the site to the site manager and have not received a satisfactory response. You can:',
          ],
          items: [
            'write to the French Defender of Rights (online form at www.defenseurdesdroits.fr);',
            'contact the Defender of Rights delegate in your region;',
            'send a letter by post (free of charge, no stamp needed): Défenseur des droits, Libre réponse 71120, 75342 Paris CEDEX 07, France.',
          ],
        },
        {
          heading: 'Reference language',
          body: [
            'This translation is provided for convenience. In the event of any difference in interpretation, the French version prevails as the sole reference text under the applicable French law.',
          ],
        },
      ],
    },
    es: {
      eyebrow: 'Accesibilidad',
      title: 'Declaración de accesibilidad',
      updatedLabel: 'Última actualización',
      updated: '27 de septiembre de 2026',
      homeLabel: 'Inicio',
      intro:
        'Democracy Together se compromete a hacer accesible su sitio conforme al artículo 47 de la ley francesa n.º 2005-102, de 11 de febrero de 2005. La presente declaración de accesibilidad se aplica al sitio Democracy Together en todas sus versiones lingüísticas.',
      sections: [
        {
          heading: 'Estado de conformidad',
          body: [
            'El sitio Democracy Together es parcialmente conforme con el Referencial general de mejora de la accesibilidad (RGAA), versión 4.1.2, debido a los incumplimientos enumerados a continuación.',
          ],
        },
        {
          heading: 'Resultados de las pruebas',
          body: [
            'La auditoría de conformidad realizada el 27 de septiembre de 2026 sobre una muestra de 19 páginas revela que se cumple el 72,6 % de los criterios aplicables del RGAA 4.1.2: 53 criterios conformes, 20 no conformes y 33 no aplicables. La tasa media de conformidad por página es del 88,5 %.',
            'Desde la auditoría se han integrado en el sitio correcciones para los 20 criterios no conformes. Se comprobarán en una auditoría de control, tras la cual esta declaración se actualizará con la tasa medida.',
          ],
        },
        {
          heading: 'Contenidos no accesibles — incumplimientos',
          body: [
            'Detectados en la auditoría del 27 de septiembre de 2026 (correcciones integradas, pendientes de verificación en la auditoría de control):',
          ],
          items: [
            'algunas fotografías ilustrativas tenían una alternativa textual innecesaria (criterio 1.2) y dos imágenes con leyenda no estaban vinculadas a ella (1.9);',
            'la opción seleccionada de algunos filtros y formularios solo se indicaba mediante el color (3.1); el borde de los campos de formulario carecía de contraste (3.3);',
            'dos tablas de datos no tenían un título asociado y una no tenía encabezados de fila (5.4, 5.6);',
            'algunos enlaces no eran explícitos: números de página, enlaces «CSV», entradas del menú de administración (6.1);',
            'el botón de idioma y la paleta de búsqueda no se transmitían correctamente a las tecnologías de apoyo; el número de resultados de búsqueda y algunas confirmaciones de envío no se anunciaban (7.1, 7.5);',
            'las páginas del espacio de miembros y de administración no tenían un título pertinente (8.6);',
            'en las páginas en árabe, los textos redactados en francés (descripciones de miembros, títulos de publicaciones, artículos) no indicaban su idioma ni su sentido de lectura (8.7, 8.10);',
            'la jerarquía de títulos presentaba saltos en dos páginas (9.1);',
            'el foco del teclado no era visible en el campo de la paleta de búsqueda ni en algunos botones de opción (10.7);',
            'la página de una publicación se desplazaba horizontalmente en una pantalla de 320 píxeles de ancho (10.11);',
            'algunos campos de búsqueda no tenían etiqueta visible (11.1), un grupo de botones de opción no tenía leyenda transmitida (11.6) y el campo «País» de dos formularios no indicaba su finalidad (11.13);',
            'algunos contadores solo se indicaban con un símbolo (13.5);',
            'el globo interactivo giraba continuamente sin forma de detenerlo (13.8).',
          ],
        },
        {
          heading: 'Exenciones por carga desproporcionada',
          body: ['Ninguna.'],
        },
        {
          heading: 'Contenidos no evaluados o de terceros',
          body: [
            'Los siguientes contenidos no se evaluaron en la auditoría y su accesibilidad no está garantizada:',
          ],
          items: [
            'los documentos PDF depositados por los miembros en la biblioteca; se ofrece una versión HTML («Leer el documento») cuando su texto puede extraerse;',
            'las grabaciones en vídeo de eventos publicadas en plataformas externas (subtítulos y transcripciones a cargo de los organizadores);',
            'el módulo antirrobots reCAPTCHA de Google, contenido de terceros invisible que no exige ninguna acción.',
          ],
        },
        {
          heading: 'Elaboración de esta declaración',
          body: [
            'Esta declaración se estableció el 27 de septiembre de 2026, a partir de una auditoría de conformidad realizada el mismo día.',
          ],
        },
        {
          heading: 'Tecnologías utilizadas para la realización del sitio',
          body: ['HTML5, CSS, JavaScript (React, Next.js), WAI-ARIA.'],
        },
        {
          heading: 'Entorno de prueba',
          body: [
            'Las comprobaciones se realizaron con el navegador Chromium 141 controlado por Playwright, en ordenador y en emulación móvil, en francés y en árabe, con tema claro y oscuro: árbol de accesibilidad del navegador (nombres, roles, estados, mensajes de estado), navegación solo con teclado, visibilidad del foco, zoom de página y de texto al 200 %, visualización a 320 píxeles de ancho y espaciado del texto.',
            'La restitución mediante lectores de pantalla (NVDA, JAWS, VoiceOver, TalkBack) aún no se ha probado; formará parte de la auditoría de control.',
          ],
        },
        {
          heading: 'Herramientas para evaluar la accesibilidad',
          body: [
            'axe-core 4.12, Playwright 1.61, html-validate 11 y scripts de medición del orden de tabulación, del foco visible, del contraste, del redimensionamiento y del zoom.',
          ],
        },
        {
          heading: 'Páginas del sitio verificadas',
          body: [
            'Inicio, Quiénes somos, Directorio de la red, una ficha de miembro, Biblioteca, una publicación, Eventos, un evento, Tribuna, Espacio jóvenes, Barómetro, Informe de actividad 2026, Adhesión, Contacto, Búsqueda, Inicio de sesión, Espacio de miembros, una pantalla de administración (usuarios) y la presente declaración.',
          ],
        },
        {
          heading: 'Comentarios y contacto',
          body: [
            'Si no puede acceder a un contenido o a un servicio, puede ponerse en contacto con nosotros para que le orientemos hacia una alternativa accesible u obtener el contenido en otro formato:',
          ],
          items: [
            'mediante el formulario de la página «Contacto» del sitio;',
            `por correo postal: ${TODO_ES} (dirección de la sede).`,
          ],
        },
        {
          heading: 'Vías de recurso',
          body: [
            'Utilice este procedimiento si ha comunicado al responsable del sitio un defecto de accesibilidad que le impide acceder a un contenido o a un servicio y no ha obtenido una respuesta satisfactoria. Puede:',
          ],
          items: [
            'escribir al Defensor de Derechos francés (formulario en línea en www.defenseurdesdroits.fr);',
            'ponerse en contacto con el delegado del Defensor de Derechos de su región;',
            'enviar una carta por correo postal (gratuito, sin sello): Défenseur des droits, Libre réponse 71120, 75342 Paris CEDEX 07, Francia.',
          ],
        },
        {
          heading: 'Lengua de referencia',
          body: [
            'Esta traducción se facilita para su comodidad. En caso de divergencia de interpretación, prevalece la versión francesa, único texto de referencia ante la ley francesa aplicable.',
          ],
        },
      ],
    },
    pt: {
      eyebrow: 'Acessibilidade',
      title: 'Declaração de acessibilidade',
      updatedLabel: 'Última atualização',
      updated: '27 de setembro de 2026',
      homeLabel: 'Início',
      intro:
        'A Democracy Together compromete-se a tornar o seu sítio acessível em conformidade com o artigo 47.º da lei francesa n.º 2005-102, de 11 de fevereiro de 2005. A presente declaração de acessibilidade aplica-se ao sítio Democracy Together em todas as suas versões linguísticas.',
      sections: [
        {
          heading: 'Estado de conformidade',
          body: [
            'O sítio Democracy Together está parcialmente conforme com o Referencial geral de melhoria da acessibilidade (RGAA), versão 4.1.2, devido às não conformidades enumeradas abaixo.',
          ],
        },
        {
          heading: 'Resultados dos testes',
          body: [
            'A auditoria de conformidade realizada a 27 de setembro de 2026 sobre uma amostra de 19 páginas revela que 72,6 % dos critérios aplicáveis do RGAA 4.1.2 são respeitados: 53 critérios conformes, 20 não conformes e 33 não aplicáveis. A taxa média de conformidade por página é de 88,5 %.',
            'Desde a auditoria, foram integradas no sítio correções para os 20 critérios não conformes. Serão verificadas numa auditoria de controlo, após a qual esta declaração será atualizada com a taxa medida.',
          ],
        },
        {
          heading: 'Conteúdos não acessíveis — não conformidades',
          body: [
            'Detetadas na auditoria de 27 de setembro de 2026 (correções integradas, a aguardar verificação na auditoria de controlo):',
          ],
          items: [
            'algumas fotografias ilustrativas tinham uma alternativa textual desnecessária (critério 1.2) e duas imagens legendadas não estavam ligadas à respetiva legenda (1.9);',
            'a opção selecionada de alguns filtros e formulários só era indicada pela cor (3.1); a margem dos campos de formulário não tinha contraste suficiente (3.3);',
            'duas tabelas de dados não tinham título associado e uma não tinha cabeçalhos de linha (5.4, 5.6);',
            'algumas ligações não eram explícitas: números de página, ligações «CSV», entradas do menu de administração (6.1);',
            'o botão de idioma e a paleta de pesquisa não eram corretamente transmitidos às tecnologias de apoio; o número de resultados da pesquisa e algumas confirmações de envio não eram anunciados (7.1, 7.5);',
            'as páginas da área de membros e da administração não tinham um título pertinente (8.6);',
            'nas páginas em árabe, os textos redigidos em francês (descrições de membros, títulos de publicações, artigos) não indicavam o seu idioma nem o sentido de leitura (8.7, 8.10);',
            'a hierarquia de títulos apresentava saltos em duas páginas (9.1);',
            'o foco do teclado não era visível no campo da paleta de pesquisa nem em alguns botões de opção (10.7);',
            'a página de uma publicação deslocava-se na horizontal num ecrã com 320 píxeis de largura (10.11);',
            'alguns campos de pesquisa não tinham etiqueta visível (11.1), um grupo de botões de opção não tinha legenda transmitida (11.6) e o campo «País» de dois formulários não indicava a sua finalidade (11.13);',
            'alguns contadores só eram indicados por um símbolo (13.5);',
            'o globo interativo rodava continuamente sem forma de o parar (13.8).',
          ],
        },
        {
          heading: 'Derrogações por encargo desproporcionado',
          body: ['Nenhuma.'],
        },
        {
          heading: 'Conteúdos não avaliados ou de terceiros',
          body: [
            'Os conteúdos seguintes não foram avaliados na auditoria e a sua acessibilidade não é garantida:',
          ],
          items: [
            'os documentos PDF depositados pelos membros na biblioteca; é proposta uma versão HTML («Ler o documento») quando o texto pode ser extraído;',
            'as gravações em vídeo de eventos publicadas em plataformas externas (legendas e transcrições a cargo dos organizadores);',
            'o módulo antirrobô reCAPTCHA da Google, conteúdo de terceiros invisível que não exige qualquer ação.',
          ],
        },
        {
          heading: 'Elaboração desta declaração',
          body: [
            'Esta declaração foi estabelecida a 27 de setembro de 2026, com base numa auditoria de conformidade realizada no mesmo dia.',
          ],
        },
        {
          heading: 'Tecnologias utilizadas na realização do sítio',
          body: ['HTML5, CSS, JavaScript (React, Next.js), WAI-ARIA.'],
        },
        {
          heading: 'Ambiente de teste',
          body: [
            'As verificações foram realizadas com o navegador Chromium 141 controlado pelo Playwright, em computador e em emulação móvel, em francês e em árabe, com tema claro e escuro: árvore de acessibilidade do navegador (nomes, funções, estados, mensagens de estado), navegação apenas por teclado, visibilidade do foco, zoom da página e do texto a 200 %, apresentação com 320 píxeis de largura e espaçamento do texto.',
            'A restituição por leitores de ecrã (NVDA, JAWS, VoiceOver, TalkBack) ainda não foi testada; fará parte da auditoria de controlo.',
          ],
        },
        {
          heading: 'Ferramentas para avaliar a acessibilidade',
          body: [
            'axe-core 4.12, Playwright 1.61, html-validate 11 e scripts de medição da ordem de tabulação, do foco visível, do contraste, do redimensionamento e do zoom.',
          ],
        },
        {
          heading: 'Páginas do sítio verificadas',
          body: [
            'Início, Quem somos, Diretório da rede, uma ficha de membro, Biblioteca, uma publicação, Eventos, um evento, Tribuna, Espaço jovens, Barómetro, Relatório de atividade 2026, Adesão, Contacto, Pesquisa, Início de sessão, Área de membros, um ecrã de administração (utilizadores) e a presente declaração.',
          ],
        },
        {
          heading: 'Comentários e contacto',
          body: [
            'Se não conseguir aceder a um conteúdo ou a um serviço, pode contactar-nos para ser orientado para uma alternativa acessível ou obter o conteúdo noutro formato:',
          ],
          items: [
            'através do formulário da página «Contacto» do sítio;',
            `por correio postal: ${TODO_PT} (morada da sede).`,
          ],
        },
        {
          heading: 'Vias de recurso',
          body: [
            'Utilize este procedimento se tiver comunicado ao responsável do sítio uma falha de acessibilidade que o impede de aceder a um conteúdo ou a um serviço e não tiver obtido uma resposta satisfatória. Pode:',
          ],
          items: [
            'escrever ao Defensor dos Direitos francês (formulário em linha em www.defenseurdesdroits.fr);',
            'contactar o delegado do Defensor dos Direitos da sua região;',
            'enviar uma carta pelo correio (gratuito, sem selo): Défenseur des droits, Libre réponse 71120, 75342 Paris CEDEX 07, França.',
          ],
        },
        {
          heading: 'Língua de referência',
          body: [
            'Esta tradução é disponibilizada por comodidade. Em caso de divergência de interpretação, prevalece a versão francesa, único texto de referência perante a lei francesa aplicável.',
          ],
        },
      ],
    },
    ar: {
      eyebrow: 'إتاحة الوصول',
      title: 'تصريح بشأن إتاحة الوصول',
      updatedLabel: 'آخر تحديث',
      updated: '27 سبتمبر 2026',
      homeLabel: 'الرئيسية',
      intro:
        'تلتزم Democracy Together بجعل موقعها متاحاً للجميع عملاً بالمادة 47 من القانون الفرنسي رقم 2005-102 الصادر في 11 فبراير 2005. ويسري هذا التصريح على موقع Democracy Together بجميع نسخه اللغوية.',
      sections: [
        {
          heading: 'حالة المطابقة',
          body: [
            'موقع Democracy Together مطابق جزئياً للمرجع العام لتحسين إتاحة الوصول (RGAA) في نسخته 4.1.2، بسبب حالات عدم المطابقة المذكورة أدناه.',
          ],
        },
        {
          heading: 'نتائج الاختبارات',
          body: [
            'كشف تدقيق المطابقة المُنجَز في 27 سبتمبر 2026 على عيّنة من 19 صفحة أن 72,6 % من معايير RGAA 4.1.2 المنطبقة مستوفاة: 53 معياراً مطابقاً، و20 غير مطابق، و33 غير منطبق. ويبلغ متوسط نسبة المطابقة لكل صفحة 88,5 %.',
            'أُدمِجت في الموقع منذ التدقيق تصحيحات تخصّ المعايير العشرين غير المطابقة. وسيتحقَّق منها تدقيقٌ لاحق، يُحدَّث هذا التصريح بعده بالنسبة المقيسة.',
          ],
        },
        {
          heading: 'المحتويات غير المتاحة — حالات عدم المطابقة',
          body: [
            'رُصدت خلال تدقيق 27 سبتمبر 2026 (والتصحيحات مُدمَجة في انتظار التحقق منها في التدقيق اللاحق):',
          ],
          items: [
            'حملت صور توضيحية بديلاً نصياً لا حاجة إليه (المعيار 1.2)، ولم تكن صورتان مرفقتان بتعليق مربوطتين بتعليقهما (1.9)؛',
            'كان الخيار المحدَّد في بعض عوامل التصفية والاستمارات يُبيَّن باللون وحده (3.1)، وكان تباين حدود حقول الاستمارات غير كافٍ (3.3)؛',
            'لم يكن لجدولَي بيانات عنوان مرتبط بهما، ولم يكن لأحدهما رؤوس صفوف (5.4، 5.6)؛',
            'لم تكن بعض الروابط صريحة: أرقام الصفحات، وروابط «CSV»، وعناصر قائمة الإدارة (6.1)؛',
            'لم يكن زر اختيار اللغة ولوحة البحث يُنقلان على نحو سليم إلى التقنيات المساعدة، ولم يكن عدد نتائج البحث وبعض تأكيدات الإرسال يُعلَن عنها (7.1، 7.5)؛',
            'لم يكن لصفحات فضاء الأعضاء والإدارة عنوان ملائم (8.6)؛',
            'في الصفحات العربية، لم تكن النصوص المحرَّرة بالفرنسية (أوصاف الأعضاء، وعناوين المنشورات، والمقالات) تُبيِّن لغتها ولا اتجاه قراءتها (8.7، 8.10)؛',
            'كان تسلسل العناوين يتخطّى مستويات في صفحتين (9.1)؛',
            'لم يكن التركيز مرئياً في حقل لوحة البحث وعلى بعض أزرار الاختيار (10.7)؛',
            'كانت صفحة أحد المنشورات تتطلّب تمريراً أفقياً على شاشة عرضها 320 بكسلاً (10.11)؛',
            'لم يكن لبعض حقول البحث عنوان مرئي (11.1)، ولم يكن لمجموعة من أزرار الاختيار وسيلة إيضاح تُنقَل (11.6)، ولم يكن حقل «البلد» في استمارتين يُبيِّن غرضه (11.13)؛',
            'كانت بعض العدّادات تُبيَّن برمز وحده (13.5)؛',
            'كانت الكرة الأرضية التفاعلية تدور باستمرار دون وسيلة لإيقافها (13.8).',
          ],
        },
        {
          heading: 'الاستثناءات بسبب العبء غير المتناسب',
          body: ['لا توجد.'],
        },
        {
          heading: 'محتويات لم تُقيَّم أو محتويات أطراف أخرى',
          body: [
            'لم تُقيَّم المحتويات التالية خلال التدقيق، ولا تُضمَن إتاحتها:',
          ],
          items: [
            'وثائق PDF التي يودِعها الأعضاء في المكتبة، مع إتاحة نسخة HTML («قراءة الوثيقة») متى أمكن استخراج نصها؛',
            'تسجيلات الفيديو للفعاليات المنشورة على منصات خارجية (الترجمة المكتوبة والنصوص المفرَّغة على عاتق المنظِّمين)؛',
            'وحدة reCAPTCHA لمكافحة الروبوتات من Google، وهي محتوى خارجي غير مرئي لا يتطلب أي إجراء.',
          ],
        },
        {
          heading: 'إعداد هذا التصريح',
          body: [
            'أُعِدّ هذا التصريح في 27 سبتمبر 2026 بناءً على تدقيق مطابقة أُجري في اليوم نفسه.',
          ],
        },
        {
          heading: 'التقنيات المستخدمة في إنجاز الموقع',
          body: ['HTML5، CSS، JavaScript (React، Next.js)، WAI-ARIA.'],
        },
        {
          heading: 'بيئة الاختبار',
          body: [
            'أُجريت عمليات التحقق بمتصفح Chromium 141 المُدار عبر Playwright، على الحاسوب وبمحاكاة الهاتف المحمول، بالفرنسية والعربية، في المظهرين الفاتح والداكن: شجرة إتاحة الوصول في المتصفح (الأسماء، والأدوار، والحالات، ورسائل الحالة)، والتصفح بلوحة المفاتيح وحدها، ووضوح التركيز، وتكبير الصفحة والنص إلى 200 %، والعرض بعرض 320 بكسلاً، وتباعد النص.',
            'لم تُختبَر بعدُ القراءة عبر قارئات الشاشة (NVDA وJAWS وVoiceOver وTalkBack)، وستكون جزءاً من التدقيق اللاحق.',
          ],
        },
        {
          heading: 'أدوات تقييم إتاحة الوصول',
          body: [
            'axe-core 4.12، وPlaywright 1.61، وhtml-validate 11، وبرامج لقياس ترتيب التنقل، ووضوح التركيز، والتباين، وإعادة التدفق، والتكبير.',
          ],
        },
        {
          heading: 'صفحات الموقع التي شملها التحقق',
          body: [
            'الرئيسية، ومن نحن، ودليل الشبكة، وصفحة عضو، والمكتبة، ومنشور، والفعاليات، وفعالية، والمنبر، وفضاء الشباب، والمؤشر، وتقرير النشاط 2026، والانضمام، والاتصال، والبحث، وتسجيل الدخول، وفضاء الأعضاء، وشاشة إدارة (المستخدمون)، وهذا التصريح.',
          ],
        },
        {
          heading: 'الملاحظات والاتصال',
          body: [
            'إذا تعذّر عليكم الوصول إلى محتوى أو خدمة، يمكنكم الاتصال بنا لتوجيهكم إلى بديل متاح أو للحصول على المحتوى بشكل آخر:',
          ],
          items: [
            'عبر استمارة صفحة «اتصلوا بنا» في الموقع؛',
            `بالبريد: ${TODO_AR} (عنوان المقر).`,
          ],
        },
        {
          heading: 'سبل الطعن',
          body: [
            'تُتَّبع هذه الإجراءات إذا أبلغتم المسؤول عن الموقع بخلل في إتاحة الوصول يمنعكم من بلوغ محتوى أو خدمة، ولم تحصلوا على جواب مُرضٍ. يمكنكم:',
          ],
          items: [
            'مراسلة المدافع عن الحقوق بفرنسا (استمارة على الإنترنت في www.defenseurdesdroits.fr)؛',
            'الاتصال بمندوب المدافع عن الحقوق في منطقتكم؛',
            'إرسال رسالة بالبريد (مجاناً ودون طابع): Défenseur des droits, Libre réponse 71120, 75342 Paris CEDEX 07, France.',
          ],
        },
        {
          heading: 'اللغة المرجعية',
          body: [
            'هذه الترجمة مقدَّمة للتيسير. وفي حال اختلاف التأويل، تسري النسخة الفرنسية باعتبارها النص المرجعي الوحيد أمام القانون الفرنسي الواجب التطبيق.',
          ],
        },
      ],
    },
  },
};

// Les trois documents existent dans les cinq langues. Les versions traduites
// portent une section « Langue de référence » qui dit que le FRANÇAIS PRÉVAUT :
// ce sont des textes de droit français (loi 1901, loi 2004-575, RGAA, RGPD) et
// une traduction ne peut pas en déplacer le sens sans devenir un autre
// engagement. C'est la clause d'usage des pages légales multilingues ; elle est
// écrite dans le contenu plutôt que laissée à l'implicite.
//
// `resolveLocale` plutôt qu'un test d'égalité : cette fonction reçoit un
// `string` (segment d'URL) et doit ramener toute valeur inconnue à la langue
// par défaut, exactement comme avant — mais pour les cinq langues.
export function getLegalContent(kind: LegalKind, locale: string): LegalDoc {
  return CONTENT[kind][resolveLocale(locale)];
}
