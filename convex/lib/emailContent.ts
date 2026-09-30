import { type SiteLocale, intlTag } from './locales';
import {
  emailDocument,
  emailKit,
  escapeHtml,
  type Phrase,
} from './emailLayout';

// The layout lives in emailLayout.ts; these two stay importable from here,
// where every template already takes them.
export { escapeHtml, type Phrase };

// TRANSACTIONAL E-MAILS, IN THE FIVE LANGUAGES.
//
// WHY THIS FILE EXISTS. The site serves five languages; its e-mails
// all went out in French — sign-in code, membership approval, event
// reminder. This was true before Spanish, Portuguese and
// Arabic were added: an English-speaking member already received "Vérifiez votre adresse
// e-mail". The defect cannot be seen from a browser, and no test
// showed it, because an e-mail is never rendered in a page.
//
// WHY NOT THE SITE'S CATALOG. `src/messages/*.json` is out of reach:
// Convex is deployed separately and has no `@/` alias (cf. `locales.ts`, same
// constraint). And the mechanism used for notifications
// (`lib/notify.ts`: a KEY and parameters, rendered client-side) does not work
// here — an e-mail is composed at send time, on the server, and
// goes out frozen. The text must therefore live on this side of the wall.
//
// EXHAUSTIVE BY CONSTRUCTION. Each sentence is a `Record<SiteLocale, string>`:
// adding a language without its labels no longer compiles. It is the discipline
// already applied to the site's editorial content.
//
// WHAT WAS DELIBERATELY LEFT IN FRENCH: nothing. On the other hand, the name
// "Democracy Together" is not translated, and technical errors
// (`EMAIL_PROVIDER_NOT_CONFIGURED`…) are not here: they are addressed to
// the operator, not the recipient.

// --- Shared pieces ------------------------------------------------------------

const BRAND = 'Democracy Together';

export const GREETING: Phrase = {
  fr: 'Bonjour,',
  en: 'Hello,',
  es: 'Hola:',
  pt: 'Olá,',
  ar: 'مرحباً،',
};

/** Subject suffixed with the brand, like the current e-mails. */
export function subject(p: Phrase, loc: SiteLocale): string {
  return `${p[loc]} · ${BRAND}`;
}

/** Plain text of a phrase that carries markup, for a preheader. */
export function plain(html: string): string {
  return html
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');
}

// --- One-time code -----------------------------------------------------------

export type OtpPurpose = 'verification' | 'reset' | 'signin';

const OTP_SUBJECT: Record<OtpPurpose, Phrase> = {
  verification: {
    fr: 'Vérifiez votre adresse e-mail',
    en: 'Verify your email address',
    es: 'Verifique su dirección de correo electrónico',
    pt: 'Confirme o seu endereço de correio eletrónico',
    ar: 'تأكيد عنوان بريدكم الإلكتروني',
  },
  reset: {
    fr: 'Réinitialisez votre mot de passe',
    en: 'Reset your password',
    es: 'Restablezca su contraseña',
    pt: 'Reponha a sua palavra-passe',
    ar: 'إعادة تعيين كلمة المرور',
  },
  signin: {
    fr: 'Votre code de connexion',
    en: 'Your sign-in code',
    es: 'Su código de inicio de sesión',
    pt: 'O seu código de início de sessão',
    ar: 'رمز تسجيل الدخول الخاص بكم',
  },
};

const OTP_INTRO: Record<OtpPurpose, Phrase> = {
  verification: {
    fr: 'Confirmez votre adresse e-mail avec ce code :',
    en: 'Confirm your email address with this code:',
    es: 'Confirme su dirección de correo electrónico con este código:',
    pt: 'Confirme o seu endereço de correio eletrónico com este código:',
    ar: 'أكّدوا عنوان بريدكم الإلكتروني بهذا الرمز:',
  },
  reset: {
    fr: 'Voici votre code pour réinitialiser votre mot de passe :',
    en: 'Here is your code to reset your password:',
    es: 'Este es su código para restablecer la contraseña:',
    pt: 'Este é o seu código para repor a palavra-passe:',
    ar: 'هذا رمزكم لإعادة تعيين كلمة المرور:',
  },
  signin: {
    fr: 'Voici votre code de connexion à usage unique :',
    en: 'Here is your single-use sign-in code:',
    es: 'Este es su código de inicio de sesión de un solo uso:',
    pt: 'Este é o seu código de início de sessão de utilização única:',
    ar: 'هذا رمز تسجيل الدخول لمرة واحدة:',
  },
};

const OTP_EXPIRY: Phrase = {
  fr: "Ce code expire dans 15 minutes. Si vous n'êtes pas à l'origine de cette demande, ignorez cet e-mail.",
  en: 'This code expires in 15 minutes. If you did not request it, please ignore this email.',
  es: 'Este código caduca en 15 minutos. Si no ha solicitado este mensaje, ignórelo.',
  pt: 'Este código expira dentro de 15 minutos. Se não fez este pedido, ignore esta mensagem.',
  ar: 'ينتهي هذا الرمز خلال 15 دقيقة. إذا لم تطلبوه، تجاهلوا هذه الرسالة.',
};

/** One-time code e-mail (verification, reset, sign-in). */
export function otpEmail(
  code: string,
  purpose: OtpPurpose,
  loc: SiteLocale,
): { subject: string; html: string } {
  // The code block reads left to right even in Arabic (see emailKit.code).
  const kit = emailKit(loc);
  const body =
    kit.paragraph(OTP_INTRO[purpose][loc]) +
    kit.code(code) +
    kit.note(OTP_EXPIRY[loc]);
  return {
    subject: subject(OTP_SUBJECT[purpose], loc),
    html: emailDocument({
      loc,
      title: OTP_SUBJECT[purpose][loc],
      preheader: OTP_INTRO[purpose][loc],
      body,
    }),
  };
}

// --- Invitation / membership approved ----------------------------------------

const INVITE_SUBJECT_APPROVED: Phrase = {
  fr: 'Votre adhésion est validée',
  en: 'Your membership has been approved',
  es: 'Su adhesión ha sido validada',
  pt: 'A sua adesão foi validada',
  ar: 'تمت الموافقة على عضويتكم',
};

const INVITE_SUBJECT_ACCOUNT: Phrase = {
  fr: 'Votre compte Democracy Together',
  en: 'Your Democracy Together account',
  es: 'Su cuenta de Democracy Together',
  pt: 'A sua conta Democracy Together',
  ar: 'حسابكم على Democracy Together',
};

/** `{org}` is replaced by the organization's name, already escaped. */
const INVITE_INTRO_APPROVED: Phrase = {
  fr: 'La candidature de <b>{org}</b> a été validée par le secrétariat. Votre compte est désormais actif.',
  en: 'The application from <b>{org}</b> has been approved by the secretariat. Your account is now active.',
  es: 'La candidatura de <b>{org}</b> ha sido validada por la secretaría. Su cuenta ya está activa.',
  pt: 'A candidatura de <b>{org}</b> foi validada pelo secretariado. A sua conta está agora ativa.',
  ar: 'وافقت الأمانة على ترشّح <b>{org}</b>. حسابكم مُفعَّل الآن.',
};

const INVITE_INTRO_ACCOUNT: Phrase = {
  fr: 'Un compte vous a été ouvert sur la plateforme Democracy Together.',
  en: 'An account has been opened for you on the Democracy Together platform.',
  es: 'Se le ha abierto una cuenta en la plataforma Democracy Together.',
  pt: 'Foi-lhe aberta uma conta na plataforma Democracy Together.',
  ar: 'فُتِح لكم حساب على منصّة Democracy Together.',
};

const INVITE_HOWTO: Phrase = {
  fr: 'Pour vous connecter, demandez un code à usage unique à cette adresse e-mail :',
  en: 'To sign in, request a single-use code sent to this email address:',
  es: 'Para iniciar sesión, solicite un código de un solo uso a esta dirección de correo electrónico:',
  pt: 'Para iniciar sessão, peça um código de utilização única para este endereço de correio eletrónico:',
  ar: 'لتسجيل الدخول، اطلبوا رمزاً لمرة واحدة يُرسَل إلى هذا العنوان:',
};

const INVITE_CTA: Phrase = {
  fr: 'Se connecter',
  en: 'Sign in',
  es: 'Iniciar sesión',
  pt: 'Iniciar sessão',
  ar: 'تسجيل الدخول',
};

const INVITE_NOTE: Phrase = {
  fr: "Aucun mot de passe n'est nécessaire : un code vous sera envoyé à chaque connexion. Vous pourrez en définir un depuis votre espace membre.",
  en: 'No password is needed: a code will be sent to you each time you sign in. You can set one later from your member area.',
  es: 'No se necesita contraseña: se le enviará un código en cada inicio de sesión. Podrá definir una desde su área de miembros.',
  pt: 'Não é necessária palavra-passe: receberá um código sempre que iniciar sessão. Poderá definir uma a partir da sua área de membro.',
  ar: 'لا حاجة إلى كلمة مرور: سيصلكم رمز عند كل تسجيل دخول. ويمكنكم تعيين كلمة مرور لاحقاً من فضاء العضو.',
};

/**
 * Invitation e-mail. The member has NO password: we direct them to
 * one-time code sign-in, which works as soon as their account
 * exists.
 *
 * The link carries the RECIPIENT'S LANGUAGE. It was hard-coded as `/fr/connexion-otp`:
 * an Arabic-speaking member received an e-mail that, even translated,
 * would have dropped them on a French page.
 */
export function invitationEmail(args: {
  organizationName?: string;
  siteUrl: string;
  locale: SiteLocale;
}): { subject: string; html: string } {
  const loc = args.locale;
  const signInUrl = `${args.siteUrl.replace(/\/+$/, '')}/${loc}/connexion-otp`;
  const approuve = args.organizationName !== undefined;
  const intro = approuve
    ? INVITE_INTRO_APPROVED[loc].replace(
        '{org}',
        escapeHtml(args.organizationName ?? ''),
      )
    : INVITE_INTRO_ACCOUNT[loc];

  const kit = emailKit(loc);
  const body =
    kit.paragraph(GREETING[loc]) +
    kit.paragraph(intro) +
    kit.paragraph(INVITE_HOWTO[loc]) +
    kit.button(signInUrl, INVITE_CTA[loc]) +
    kit.fallback(signInUrl) +
    kit.signature() +
    kit.note(INVITE_NOTE[loc]);
  const heading = approuve ? INVITE_SUBJECT_APPROVED : INVITE_SUBJECT_ACCOUNT;

  return {
    subject: subject(heading, loc),
    html: emailDocument({
      loc,
      title: heading[loc],
      preheader: plain(intro),
      body,
    }),
  };
}

// --- Event reminder -----------------------------------------------------------

const REMINDER_SUBJECT: Phrase = {
  fr: 'Rappel — un événement approche',
  en: 'Reminder — an event is coming up',
  es: 'Recordatorio: se acerca un evento',
  pt: 'Lembrete — está a aproximar-se um evento',
  ar: 'تذكير — تقترب فعالية',
};

const REMINDER_LEAD: Phrase = {
  fr: 'Vous aviez demandé un rappel pour un événement à venir.',
  en: 'You asked to be reminded about an upcoming event.',
  es: 'Solicitó un recordatorio para un evento próximo.',
  pt: 'Pediu um lembrete para um evento que se aproxima.',
  ar: 'كنتم قد طلبتم تذكيراً بفعالية قادمة.',
};

/** `{date}` is replaced by the date formatted in the recipient's language. */
const REMINDER_WHEN: Phrase = {
  fr: 'Il a lieu le <strong>{date}</strong>. Retrouvez les informations pratiques et confirmez votre présence :',
  en: 'It takes place on <strong>{date}</strong>. Find the practical details and confirm your attendance:',
  es: 'Se celebra el <strong>{date}</strong>. Consulte la información práctica y confirme su asistencia:',
  pt: 'Realiza-se a <strong>{date}</strong>. Consulte as informações práticas e confirme a sua presença:',
  ar: 'تُقام في <strong>{date}</strong>. اطّلعوا على المعلومات العملية وأكّدوا حضوركم:',
};

const REMINDER_CTA: Phrase = {
  fr: 'Voir l’événement',
  en: 'View the event',
  es: 'Ver el evento',
  pt: 'Ver o evento',
  ar: 'عرض الفعالية',
};

const REMINDER_FOOTER: Phrase = {
  fr: 'Vous recevez cet e-mail car vous avez demandé un rappel sur le site de Democracy Together.',
  en: 'You are receiving this email because you requested a reminder on the Democracy Together website.',
  es: 'Recibe este mensaje porque solicitó un recordatorio en el sitio de Democracy Together.',
  pt: 'Recebe esta mensagem porque pediu um lembrete no sítio da Democracy Together.',
  ar: 'تصلكم هذه الرسالة لأنكم طلبتم تذكيراً على موقع Democracy Together.',
};

/**
 * Event reminder e-mail.
 *
 * The date is formatted in the RECIPIENT'S LANGUAGE. It used to be hard-coded
 * in French (`Intl.DateTimeFormat('fr', …)`), even though the reminder row already
 * carried its locale — which was only used to build the URL.
 */
export function eventReminderEmail(args: {
  eventSlug: string;
  eventDate: number;
  siteUrl: string;
  locale: SiteLocale;
  // Time zone of the event's VENUE ("contenus" workstream): `eventDate` is
  // the start instant, and a day that starts at midnight in Paris is
  // still the day before in UTC. Without a known time zone, UTC (previous behavior).
  timeZone?: string;
}): { subject: string; html: string } {
  const loc = args.locale;
  const url = `${args.siteUrl.replace(/\/+$/, '')}/${loc}/evenements/${encodeURIComponent(args.eventSlug)}`;
  const when = new Intl.DateTimeFormat(intlTag(loc), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: args.timeZone ?? 'UTC',
  }).format(args.eventDate);

  const kit = emailKit(loc);
  const body =
    kit.paragraph(REMINDER_LEAD[loc]) +
    kit.paragraph(REMINDER_WHEN[loc].replace('{date}', escapeHtml(when))) +
    kit.button(url, REMINDER_CTA[loc]) +
    kit.fallback(url);

  return {
    subject: subject(REMINDER_SUBJECT, loc),
    html: emailDocument({
      loc,
      title: REMINDER_SUBJECT[loc],
      preheader: REMINDER_LEAD[loc],
      body,
      reason: REMINDER_FOOTER[loc],
    }),
  };
}

// --- Videoconference link (F-54) ---------------------------------------------

const VISIO_SUBJECT: Phrase = {
  fr: 'Votre lien de visioconférence',
  en: 'Your video conference link',
  es: 'Su enlace de videoconferencia',
  pt: 'A sua ligação de videoconferência',
  ar: 'رابط مؤتمر الفيديو الخاص بكم',
};

/** `{title}` and `{date}` are replaced at send time. */
const VISIO_LEAD: Phrase = {
  fr: 'Vous êtes inscrit·e à <strong>{title}</strong>, le <strong>{date}</strong>. Voici le lien pour rejoindre la séance en ligne :',
  en: 'You are registered for <strong>{title}</strong> on <strong>{date}</strong>. Here is the link to join the online session:',
  es: 'Está inscrito/a en <strong>{title}</strong>, el <strong>{date}</strong>. Este es el enlace para unirse a la sesión en línea:',
  pt: 'Está inscrito/a em <strong>{title}</strong>, a <strong>{date}</strong>. Eis a ligação para participar na sessão em linha:',
  ar: 'أنتم مسجَّلون في <strong>{title}</strong> بتاريخ <strong>{date}</strong>. إليكم رابط الانضمام إلى الجلسة عن بُعد:',
};

const VISIO_CTA: Phrase = {
  fr: 'Rejoindre la séance en ligne',
  en: 'Join the online session',
  es: 'Unirse a la sesión en línea',
  pt: 'Participar na sessão em linha',
  ar: 'الانضمام إلى الجلسة عن بُعد',
};

const VISIO_PRIVATE: Phrase = {
  fr: 'Ce lien vous est personnel : merci de ne pas le diffuser. La fiche de l’événement reste consultable ici :',
  en: 'This link is for you only: please do not share it. The event page remains available here:',
  es: 'Este enlace es personal: le rogamos que no lo difunda. La ficha del evento sigue disponible aquí:',
  pt: 'Esta ligação é pessoal: pedimos-lhe que não a divulgue. A página do evento continua disponível aqui:',
  ar: 'هذا الرابط خاص بكم: نرجو عدم نشره. تبقى صفحة الفعالية متاحة هنا:',
};

const VISIO_FOOTER: Phrase = {
  fr: 'Vous recevez cet e-mail car vous vous êtes inscrit·e à cet événement sur le site de Democracy Together.',
  en: 'You are receiving this email because you registered for this event on the Democracy Together website.',
  es: 'Recibe este mensaje porque se inscribió en este evento en el sitio de Democracy Together.',
  pt: 'Recebe esta mensagem porque se inscreveu neste evento no sítio da Democracy Together.',
  ar: 'تصلكم هذه الرسالة لأنكم سجّلتم في هذه الفعالية على موقع Democracy Together.',
};

/**
 * E-mail carrying the videoconference link to a REGISTRANT, before the event.
 * The link is public nowhere else: it is its only channel for
 * registrants without an account.
 */
export function eventVisioEmail(args: {
  eventSlug: string;
  eventTitle: string;
  eventDate: number;
  timeZone: string;
  visioUrl: string;
  siteUrl: string;
  locale: SiteLocale;
}): { subject: string; html: string } {
  const loc = args.locale;
  const page = `${args.siteUrl.replace(/\/+$/, '')}/${loc}/evenements/${encodeURIComponent(args.eventSlug)}`;
  const when = new Intl.DateTimeFormat(intlTag(loc), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: args.timeZone,
    timeZoneName: 'short',
  }).format(args.eventDate);
  const lead = VISIO_LEAD[loc]
    .replace('{title}', escapeHtml(args.eventTitle))
    .replace('{date}', escapeHtml(when));
  const kit = emailKit(loc);
  const body =
    kit.paragraph(GREETING[loc]) +
    kit.paragraph(lead) +
    kit.button(args.visioUrl, VISIO_CTA[loc]) +
    kit.fallback(args.visioUrl) +
    kit.paragraph(`${VISIO_PRIVATE[loc]} ${kit.link(page, escapeHtml(page))}`) +
    kit.signature();
  return {
    subject: subject(VISIO_SUBJECT, loc),
    html: emailDocument({
      loc,
      title: VISIO_SUBJECT[loc],
      preheader: plain(lead),
      body,
      reason: VISIO_FOOTER[loc],
    }),
  };
}
