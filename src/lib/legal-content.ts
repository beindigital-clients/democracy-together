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

export type LegalSection = { heading: string; body: string[] };

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

  accessibilite: {
    fr: {
      eyebrow: 'Accessibilité',
      title: 'Déclaration d’accessibilité',
      updatedLabel: 'Dernière mise à jour',
      updated: '27 juin 2026',
      homeLabel: 'Accueil',
      intro:
        'Democracy Together s’engage à rendre son site accessible au plus grand nombre, conformément à l’article 47 de la loi n° 2005-102 du 11 février 2005 et au Référentiel général d’amélioration de l’accessibilité (RGAA).',
      sections: [
        {
          heading: 'État de conformité',
          body: [
            `Un audit RGAA complet n’a pas encore été réalisé. À ce stade, le niveau de conformité ne peut être déclaré : ${TODO_FR} (audit RGAA à mener, puis indiquer « conforme », « partiellement conforme » ou « non conforme »).`,
            'Le site a néanmoins été conçu en intégrant de bonnes pratiques d’accessibilité : structure sémantique, navigation au clavier, respect du contraste, libellés de formulaires associés, respect de la préférence « mouvement réduit » et alternatives textuelles.',
          ],
        },
        {
          heading: 'Contenus non accessibles',
          body: [
            `La liste des contenus non conformes et des dérogations éventuelles sera publiée à l’issue de l’audit : ${TODO_FR}.`,
          ],
        },
        {
          heading: 'Établissement de cette déclaration',
          body: [
            'Cette déclaration a été établie le 27 juin 2026. Elle sera mise à jour après la réalisation de l’audit de conformité.',
          ],
        },
        {
          heading: 'Retour d’information et contact',
          body: [
            'Si vous rencontrez un défaut d’accessibilité vous empêchant d’accéder à un contenu, contactez-nous via le formulaire de contact afin que nous puissions vous orienter vers une alternative et corriger le problème.',
          ],
        },
        {
          heading: 'Voies de recours',
          body: [
            'Si vous constatez un défaut d’accessibilité et que, après nous avoir signalé le problème, vous n’obtenez pas de réponse satisfaisante, vous pouvez adresser une réclamation ou une demande de saisine au Défenseur des droits (www.defenseurdesdroits.fr).',
          ],
        },
      ],
    },
    en: {
      eyebrow: 'Accessibility',
      title: 'Accessibility statement',
      updatedLabel: 'Last updated',
      updated: 'June 27, 2026',
      homeLabel: 'Home',
      intro:
        'Democracy Together is committed to making its website accessible to as many people as possible, in line with French accessibility law (Article 47 of Act No. 2005-102) and the RGAA accessibility framework.',
      sections: [
        {
          heading: 'Compliance status',
          body: [
            `A full RGAA audit has not yet been carried out. At this stage, the level of compliance cannot be declared: ${TODO_EN} (RGAA audit to be conducted, then state “compliant”, “partially compliant” or “non-compliant”).`,
            'The site was nonetheless built with accessibility good practices: semantic structure, keyboard navigation, colour contrast, associated form labels, respect for the “reduced motion” preference and text alternatives.',
          ],
        },
        {
          heading: 'Non-accessible content',
          body: [
            `The list of non-compliant content and any exemptions will be published once the audit is complete: ${TODO_EN}.`,
          ],
        },
        {
          heading: 'Preparation of this statement',
          body: [
            'This statement was prepared on 27 June 2026. It will be updated once the compliance audit has been carried out.',
          ],
        },
        {
          heading: 'Feedback and contact',
          body: [
            'If you encounter an accessibility barrier that prevents you from accessing content, contact us via the contact form so we can point you to an alternative and fix the issue.',
          ],
        },
        {
          heading: 'Remedies',
          body: [
            'If you report an accessibility problem and do not receive a satisfactory response, you may refer the matter to the French Defender of Rights (www.defenseurdesdroits.fr).',
          ],
        },
      ],
    },
    es: {
      eyebrow: 'Accesibilidad',
      title: 'Declaración de accesibilidad',
      updatedLabel: 'Última actualización',
      updated: '27 de junio de 2026',
      homeLabel: 'Inicio',
      intro:
        'Democracy Together se compromete a hacer su sitio accesible al mayor número de personas, de conformidad con el artículo 47 de la ley francesa n.º 2005-102, de 11 de febrero de 2005, y con el Referencial general de mejora de la accesibilidad (RGAA).',
      sections: [
        {
          heading: 'Estado de conformidad',
          body: [
            `Todavía no se ha realizado una auditoría RGAA completa. En esta fase no puede declararse el nivel de conformidad: ${TODO_ES} (auditoría RGAA pendiente; después, indicar «conforme», «parcialmente conforme» o «no conforme»).`,
            'Aun así, el sitio se ha concebido integrando buenas prácticas de accesibilidad: estructura semántica, navegación por teclado, respeto del contraste, etiquetas de formulario asociadas, respeto de la preferencia de «movimiento reducido» y alternativas textuales.',
          ],
        },
        {
          heading: 'Contenidos no accesibles',
          body: [
            `La lista de contenidos no conformes y de las eventuales exenciones se publicará una vez concluida la auditoría: ${TODO_ES}.`,
          ],
        },
        {
          heading: 'Elaboración de esta declaración',
          body: [
            'Esta declaración se estableció el 27 de junio de 2026. Se actualizará tras la realización de la auditoría de conformidad.',
          ],
        },
        {
          heading: 'Comentarios y contacto',
          body: [
            'Si encuentra un problema de accesibilidad que le impida acceder a un contenido, póngase en contacto con nosotros mediante el formulario de contacto para que podamos orientarle hacia una alternativa y corregir el problema.',
          ],
        },
        {
          heading: 'Vías de recurso',
          body: [
            'Si constata un defecto de accesibilidad y, tras habérnoslo comunicado, no obtiene una respuesta satisfactoria, puede dirigir una reclamación al Defensor de Derechos francés (www.defenseurdesdroits.fr).',
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
      updated: '27 de junho de 2026',
      homeLabel: 'Início',
      intro:
        'A Democracy Together compromete-se a tornar o seu sítio acessível ao maior número de pessoas, em conformidade com o artigo 47.º da lei francesa n.º 2005-102, de 11 de fevereiro de 2005, e com o Referencial geral de melhoria da acessibilidade (RGAA).',
      sections: [
        {
          heading: 'Estado de conformidade',
          body: [
            `Ainda não foi realizada uma auditoria RGAA completa. Nesta fase, o nível de conformidade não pode ser declarado: ${TODO_PT} (auditoria RGAA a realizar; depois, indicar «conforme», «parcialmente conforme» ou «não conforme»).`,
            'Ainda assim, o sítio foi concebido integrando boas práticas de acessibilidade: estrutura semântica, navegação por teclado, respeito do contraste, etiquetas de formulário associadas, respeito da preferência de «movimento reduzido» e alternativas textuais.',
          ],
        },
        {
          heading: 'Conteúdos não acessíveis',
          body: [
            `A lista dos conteúdos não conformes e das eventuais derrogações será publicada no final da auditoria: ${TODO_PT}.`,
          ],
        },
        {
          heading: 'Elaboração desta declaração',
          body: [
            'Esta declaração foi estabelecida a 27 de junho de 2026. Será atualizada após a realização da auditoria de conformidade.',
          ],
        },
        {
          heading: 'Comentários e contacto',
          body: [
            'Se encontrar uma falha de acessibilidade que o impeça de aceder a um conteúdo, contacte-nos através do formulário de contacto para que possamos orientá-lo para uma alternativa e corrigir o problema.',
          ],
        },
        {
          heading: 'Vias de recurso',
          body: [
            'Se constatar uma falha de acessibilidade e, depois de nos ter comunicado o problema, não obtiver uma resposta satisfatória, pode dirigir uma reclamação ao Defensor dos Direitos francês (www.defenseurdesdroits.fr).',
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
      updated: '27 يونيو 2026',
      homeLabel: 'الرئيسية',
      intro:
        'تلتزم Democracy Together بجعل موقعها متاحاً لأكبر عدد من الناس، عملاً بالمادة 47 من القانون الفرنسي رقم 2005-102 الصادر في 11 فبراير 2005، وبالمرجع العام لتحسين إتاحة الوصول (RGAA).',
      sections: [
        {
          heading: 'حالة المطابقة',
          body: [
            `لم يُنجَز بعدُ تدقيق كامل وفق مرجع RGAA. وفي هذه المرحلة لا يمكن التصريح بمستوى المطابقة: ${TODO_AR} (تدقيق RGAA مرتقب، ثم يُذكر «مطابق» أو «مطابق جزئياً» أو «غير مطابق»).`,
            'ومع ذلك، صُمّم الموقع بإدماج ممارسات جيدة في مجال إتاحة الوصول: بنية دلالية، وتصفح بلوحة المفاتيح، واحترام التباين، وربط عناوين حقول الاستمارات بحقولها، واحترام تفضيل «تقليل الحركة»، وبدائل نصية.',
          ],
        },
        {
          heading: 'المحتويات غير المتاحة',
          body: [
            `ستُنشر لائحة المحتويات غير المطابقة والاستثناءات المحتملة عند انتهاء التدقيق: ${TODO_AR}.`,
          ],
        },
        {
          heading: 'إعداد هذا التصريح',
          body: [
            'أُعِدّ هذا التصريح في 27 يونيو 2026، وسيُحدَّث بعد إنجاز تدقيق المطابقة.',
          ],
        },
        {
          heading: 'الملاحظات والاتصال',
          body: [
            'إذا صادفتم عائقاً في إتاحة الوصول يمنعكم من بلوغ محتوى ما، فاتصلوا بنا عبر استمارة الاتصال حتى نوجّهكم إلى بديل ونصحّح الخلل.',
          ],
        },
        {
          heading: 'سبل الطعن',
          body: [
            'إذا لاحظتم خللاً في إتاحة الوصول ولم تحصلوا، بعد إبلاغنا به، على جواب مُرضٍ، فبإمكانكم رفع شكاية إلى المدافع عن الحقوق بفرنسا (www.defenseurdesdroits.fr).',
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
