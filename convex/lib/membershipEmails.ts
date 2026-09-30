import type { SiteLocale } from './locales';
import { escapeHtml, GREETING, subject, type Phrase } from './emailContent';
import { emailDocument, emailKit } from './emailLayout';

// E-MAILS OF THE MEMBERSHIP APPLICATION (F-22), in the five languages — same
// discipline as lib/emailContent.ts: each sentence is a `Record<SiteLocale,
// string>`, so a language added without its labels no longer compiles.
//
// The approval e-mail (the sign-in invitation) already lives in
// emailContent.ts. What was missing is everything around it: the applicant
// heard nothing between the form and the decision, and nothing at all when
// the answer was no; staff heard of an application only by opening the back
// office.

function base(siteUrl: string, loc: SiteLocale): string {
  return `${siteUrl.replace(/\/+$/, '')}/${loc}`;
}

// --- To the applicant: application received ----------------------------------
//
// Sent to an address typed into a PUBLIC form, so it echoes NOTHING the
// applicant typed — not even the organisation's name. A confirmation that
// repeats free text is a relay: whoever types a stranger's address and an
// advert as the "name" gets the platform to deliver the advert. One pending
// application per address, plus the form's caps, bound how often it can go.

const RECEIVED_SUBJECT: Phrase = {
  fr: 'Nous avons bien reçu votre candidature',
  en: 'We have received your application',
  es: 'Hemos recibido su candidatura',
  pt: 'Recebemos a sua candidatura',
  ar: 'توصّلنا بترشيحكم',
};

const RECEIVED_LEAD: Phrase = {
  fr: 'Merci de votre intérêt pour Democracy Together : votre candidature pour rejoindre le réseau nous est bien parvenue.',
  en: 'Thank you for your interest in Democracy Together: your application to join the network has reached us.',
  es: 'Gracias por su interés en Democracy Together: hemos recibido su candidatura para unirse a la red.',
  pt: 'Obrigado pelo seu interesse na Democracy Together: a sua candidatura para aderir à rede chegou até nós.',
  ar: 'نشكركم على اهتمامكم بـ Democracy Together: لقد وصلنا ترشيحكم للانضمام إلى الشبكة.',
};

const RECEIVED_NEXT: Phrase = {
  fr: 'Notre comité va l’examiner et vous répondra par e-mail, à cette adresse. En cas d’acceptation, ce message vous indiquera comment accéder à votre espace membre.',
  en: 'Our committee will review it and reply by email, to this address. If it is accepted, that message will tell you how to access your member area.',
  es: 'Nuestro comité la examinará y le responderá por correo electrónico, a esta dirección. Si es aceptada, ese mensaje le indicará cómo acceder a su espacio de miembro.',
  pt: 'O nosso comité irá analisá-la e responder-lhe-á por correio eletrónico, para este endereço. Se for aceite, essa mensagem indicará como aceder à sua área de membro.',
  ar: 'ستدرسه لجنتنا وستردّ عليكم عبر البريد الإلكتروني على هذا العنوان. وفي حال قبوله، ستوضّح لكم تلك الرسالة كيفية الوصول إلى فضاء العضو.',
};

const RECEIVED_MEANTIME: Phrase = {
  fr: 'En attendant, découvrez les think tanks et les chercheurs qui font déjà vivre le réseau :',
  en: 'In the meantime, discover the think tanks and researchers already active in the network:',
  es: 'Mientras tanto, descubra los centros de estudios y los investigadores que ya dan vida a la red:',
  pt: 'Entretanto, descubra os centros de estudos e os investigadores que já dão vida à rede:',
  ar: 'وفي الأثناء، تعرّفوا على مراكز الدراسات والباحثين الذين يُحيون الشبكة بالفعل:',
};

const RECEIVED_CTA: Phrase = {
  fr: 'Découvrir le réseau',
  en: 'Explore the network',
  es: 'Descubrir la red',
  pt: 'Descobrir a rede',
  ar: 'اكتشاف الشبكة',
};

const RECEIVED_NOTE: Phrase = {
  fr: 'Si vous n’êtes pas à l’origine de cette candidature, ignorez ce message : aucun compte n’est ouvert sans l’accord de notre comité.',
  en: 'If you did not submit this application, ignore this message: no account is opened without our committee’s approval.',
  es: 'Si usted no ha presentado esta candidatura, ignore este mensaje: no se abre ninguna cuenta sin la aprobación de nuestro comité.',
  pt: 'Se não apresentou esta candidatura, ignore esta mensagem: nenhuma conta é aberta sem a aprovação do nosso comité.',
  ar: 'إن لم تكونوا من قدّم هذا الترشيح، تجاهلوا هذه الرسالة: لا يُفتح أي حساب دون موافقة لجنتنا.',
};

export function applicationReceivedEmail(args: {
  siteUrl: string;
  locale: SiteLocale;
}): { subject: string; html: string } {
  const loc = args.locale;
  const networkUrl = `${base(args.siteUrl, loc)}/le-reseau`;
  const kit = emailKit(loc);
  const body =
    kit.paragraph(GREETING[loc]) +
    kit.paragraph(RECEIVED_LEAD[loc]) +
    kit.paragraph(RECEIVED_NEXT[loc]) +
    kit.paragraph(RECEIVED_MEANTIME[loc]) +
    kit.button(networkUrl, RECEIVED_CTA[loc]) +
    kit.signature() +
    kit.note(RECEIVED_NOTE[loc]);
  return {
    subject: subject(RECEIVED_SUBJECT, loc),
    html: emailDocument({
      loc,
      title: RECEIVED_SUBJECT[loc],
      preheader: RECEIVED_LEAD[loc],
      body,
    }),
  };
}

// --- To the applicant: application declined ----------------------------------
//
// The form promises an answer by e-mail. Before this, a declined applicant
// without an account — nearly all of them, self-registration being closed —
// never got one. The moderator's note stays internal: it is written for the
// team, and nothing on the screen says it would leave. The subject does not
// announce the outcome: an inbox preview is not the place to learn it.

const DECLINED_SUBJECT: Phrase = {
  fr: 'Votre candidature d’adhésion',
  en: 'Your membership application',
  es: 'Su candidatura de adhesión',
  pt: 'A sua candidatura de adesão',
  ar: 'ترشيحكم للانضمام',
};

const DECLINED_LEAD: Phrase = {
  fr: 'Merci de l’intérêt que vous portez à Democracy Together et du temps consacré à votre candidature. Après examen, notre comité n’a pas pu y donner une suite favorable.',
  en: 'Thank you for your interest in Democracy Together and for the time you devoted to your application. After review, our committee was unable to accept it.',
  es: 'Gracias por su interés en Democracy Together y por el tiempo dedicado a su candidatura. Tras examinarla, nuestro comité no ha podido darle una respuesta favorable.',
  pt: 'Obrigado pelo seu interesse na Democracy Together e pelo tempo dedicado à sua candidatura. Após análise, o nosso comité não lhe pôde dar seguimento favorável.',
  ar: 'نشكركم على اهتمامكم بـ Democracy Together وعلى الوقت الذي خصّصتموه لترشيحكم. بعد الدراسة، تعذّر على لجنتنا قبوله.',
};

const DECLINED_FOLLOW: Phrase = {
  fr: 'Cette décision ne vous empêche pas de suivre nos travaux : publications, événements et newsletter restent ouverts à tous. Pour toute question, écrivez-nous :',
  en: 'This decision does not stop you from following our work: publications, events and the newsletter remain open to all. If you have any questions, write to us:',
  es: 'Esta decisión no le impide seguir nuestro trabajo: las publicaciones, los eventos y el boletín siguen abiertos a todos. Si tiene alguna pregunta, escríbanos:',
  pt: 'Esta decisão não o impede de acompanhar o nosso trabalho: as publicações, os eventos e a newsletter continuam abertos a todos. Para qualquer questão, escreva-nos:',
  ar: 'لا يمنعكم هذا القرار من متابعة أعمالنا: فالمنشورات والفعاليات والنشرة الإخبارية تبقى مفتوحة للجميع. لأي استفسار، راسلونا:',
};

const DECLINED_CTA: Phrase = {
  fr: 'Nous écrire',
  en: 'Contact us',
  es: 'Escribirnos',
  pt: 'Escrever-nos',
  ar: 'راسلونا',
};

export function applicationDeclinedEmail(args: {
  siteUrl: string;
  locale: SiteLocale;
}): { subject: string; html: string } {
  const loc = args.locale;
  const contactUrl = `${base(args.siteUrl, loc)}/contact`;
  const kit = emailKit(loc);
  const body =
    kit.paragraph(GREETING[loc]) +
    kit.paragraph(DECLINED_LEAD[loc]) +
    kit.paragraph(DECLINED_FOLLOW[loc]) +
    kit.button(contactUrl, DECLINED_CTA[loc]) +
    kit.signature();
  return {
    subject: subject(DECLINED_SUBJECT, loc),
    html: emailDocument({
      loc,
      title: DECLINED_SUBJECT[loc],
      preheader: DECLINED_LEAD[loc],
      body,
    }),
  };
}

// --- To staff: a new application is waiting ---------------------------------
//
// It carries what a moderator needs to judge the urgency — who, what kind,
// where, how many are waiting — and a link to the queue. Not the contact
// address nor the presentation: an e-mail leaves the platform, and the back
// office remains the one place where an application is read and decided.

export type ApplicantType = 'organisation' | 'individu';

const STAFF_SUBJECT: Phrase = {
  fr: 'Nouvelle candidature d’adhésion : {name}',
  en: 'New membership application: {name}',
  es: 'Nueva candidatura de adhesión: {name}',
  pt: 'Nova candidatura de adesão: {name}',
  ar: 'ترشيح جديد للانضمام: {name}',
};

const STAFF_TITLE: Phrase = {
  fr: 'Nouvelle candidature d’adhésion',
  en: 'New membership application',
  es: 'Nueva candidatura de adhesión',
  pt: 'Nova candidatura de adesão',
  ar: 'ترشيح جديد للانضمام',
};

const STAFF_LEAD: Phrase = {
  fr: 'Une candidature vient d’être déposée sur le site. Elle attend l’examen de l’équipe.',
  en: 'An application has just been submitted on the website. It is waiting for the team’s review.',
  es: 'Se acaba de presentar una candidatura en el sitio. Está a la espera de que el equipo la examine.',
  pt: 'Acaba de ser apresentada uma candidatura no sítio. Aguarda a análise da equipa.',
  ar: 'قُدِّم للتوّ ترشيح على الموقع، وهو بانتظار دراسة الفريق.',
};

const STAFF_LABEL_NAME: Phrase = {
  fr: 'Candidat',
  en: 'Applicant',
  es: 'Candidato',
  pt: 'Candidato',
  ar: 'المترشّح',
};

const STAFF_LABEL_TYPE: Phrase = {
  fr: 'Type',
  en: 'Type',
  es: 'Tipo',
  pt: 'Tipo',
  ar: 'النوع',
};

const STAFF_LABEL_COUNTRY: Phrase = {
  fr: 'Pays',
  en: 'Country',
  es: 'País',
  pt: 'País',
  ar: 'البلد',
};

const STAFF_LABEL_PENDING: Phrase = {
  fr: 'Candidatures en attente',
  en: 'Pending applications',
  es: 'Candidaturas pendientes',
  pt: 'Candidaturas pendentes',
  ar: 'الترشيحات قيد الانتظار',
};

// The form's own labels (`membership.type_*` in src/messages).
const APPLICANT_TYPE: Record<ApplicantType, Phrase> = {
  organisation: {
    fr: 'Think tank / organisation',
    en: 'Think tank / organisation',
    es: 'Centro de estudios / organización',
    pt: 'Centro de estudos / organização',
    ar: 'مركز دراسات / منظمة',
  },
  individu: {
    fr: 'Chercheur / individuel',
    en: 'Researcher / individual',
    es: 'Investigador / individual',
    pt: 'Investigador / individual',
    ar: 'باحث / بصفة فردية',
  },
};

const STAFF_CTA: Phrase = {
  fr: 'Examiner la candidature',
  en: 'Review the application',
  es: 'Examinar la candidatura',
  pt: 'Analisar a candidatura',
  ar: 'دراسة الترشيح',
};

const STAFF_REASON: Phrase = {
  fr: 'Vous recevez cette alerte car vous faites partie de l’équipe de modération de Democracy Together. Vous pouvez la désactiver dans les préférences de notification de votre profil.',
  en: 'You are receiving this alert because you are part of the Democracy Together moderation team. You can turn it off in the notification preferences of your profile.',
  es: 'Recibe este aviso porque forma parte del equipo de moderación de Democracy Together. Puede desactivarlo en las preferencias de notificación de su perfil.',
  pt: 'Recebe este alerta porque faz parte da equipa de moderação da Democracy Together. Pode desativá-lo nas preferências de notificação do seu perfil.',
  ar: 'يصلكم هذا التنبيه لأنكم ضمن فريق الإشراف في Democracy Together. يمكنكم إيقافه من تفضيلات الإشعارات في ملفكم الشخصي.',
};

// Longest name kept in a subject line: inboxes cut beyond that anyway.
const SUBJECT_NAME_MAX = 60;

/** Free text made safe for a header: one line, bounded. */
function subjectText(value: string): string {
  const line = value.replace(/[\r\n\t]+/g, ' ').trim();
  return line.length > SUBJECT_NAME_MAX
    ? `${line.slice(0, SUBJECT_NAME_MAX - 1).trimEnd()}…`
    : line;
}

export function staffApplicationAlertEmail(args: {
  siteUrl: string;
  locale: SiteLocale;
  organizationName: string;
  type: ApplicantType;
  country: string;
  pending: number;
}): { subject: string; html: string } {
  const loc = args.locale;
  const queueUrl = `${base(args.siteUrl, loc)}/admin/candidatures`;
  const kit = emailKit(loc);
  const body =
    kit.paragraph(STAFF_LEAD[loc]) +
    kit.details([
      {
        label: STAFF_LABEL_NAME[loc],
        value: escapeHtml(args.organizationName),
      },
      { label: STAFF_LABEL_TYPE[loc], value: APPLICANT_TYPE[args.type][loc] },
      { label: STAFF_LABEL_COUNTRY[loc], value: escapeHtml(args.country) },
      {
        label: STAFF_LABEL_PENDING[loc],
        // Digits read left to right, even in an Arabic line.
        value: `<span dir="ltr">${String(Math.max(1, args.pending))}</span>`,
      },
    ]) +
    kit.button(queueUrl, STAFF_CTA[loc]) +
    kit.fallback(queueUrl);
  // A replacer FUNCTION: a string replacement would read `$&` or `$'` typed
  // into the name as substitution patterns.
  const heading = STAFF_SUBJECT[loc].replace('{name}', () =>
    subjectText(args.organizationName),
  );
  return {
    subject: `${heading} · Democracy Together`,
    html: emailDocument({
      loc,
      title: STAFF_TITLE[loc],
      preheader: STAFF_LEAD[loc],
      body,
      reason: STAFF_REASON[loc],
    }),
  };
}
