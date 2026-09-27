import { type SiteLocale, intlTag, isRtlLocale } from './locales';

// LES COURRIELS TRANSACTIONNELS, DANS LES CINQ LANGUES.
//
// POURQUOI CE FICHIER EXISTE. Le site sert cinq langues ; ses courriels
// partaient tous en français — code de connexion, validation d'adhésion, rappel
// d'événement. C'était vrai avant l'ajout de l'espagnol, du portugais et de
// l'arabe : un membre anglophone recevait déjà « Vérifiez votre adresse
// e-mail ». Le défaut ne se voit pas depuis un navigateur, et aucun test ne le
// montrait, parce qu'un courriel n'est jamais rendu dans une page.
//
// POURQUOI PAS LE CATALOGUE DU SITE. `src/messages/*.json` est hors de portée :
// Convex est déployé séparément et n'a pas l'alias `@/` (cf. `locales.ts`, même
// contrainte). Et le mécanisme employé pour les notifications
// (`lib/notify.ts` : une CLÉ et des paramètres, rendus côté client) ne marche
// pas ici — un courriel est composé au moment de l'envoi, sur le serveur, et
// part figé. Le texte doit donc vivre de ce côté-ci de la cloison.
//
// EXHAUSTIF PAR CONSTRUCTION. Chaque phrase est un `Record<SiteLocale, string>`
// : ajouter une langue sans ses libellés ne compile plus. C'est la discipline
// déjà appliquée aux contenus éditoriaux du site.
//
// CE QUI EST VOLONTAIREMENT RESTÉ EN FRANÇAIS : rien. En revanche, le nom
// « Democracy Together » ne se traduit pas, et les erreurs techniques
// (`EMAIL_PROVIDER_NOT_CONFIGURED`…) ne sont pas ici : elles s'adressent à
// l'exploitant, pas au destinataire.

type Phrase = Record<SiteLocale, string>;

// --- Coque commune ----------------------------------------------------------

const BRAND = 'Democracy Together';

const GREETING: Phrase = {
  fr: 'Bonjour,',
  en: 'Hello,',
  es: 'Hola:',
  pt: 'Olá,',
  ar: 'مرحباً،',
};

/**
 * Enveloppe HTML d'un courriel.
 *
 * `dir` ET `text-align` sont posés ensemble, et ce n'est pas une redondance :
 * beaucoup de clients de messagerie (Outlook en tête) n'alignent pas le texte
 * d'après `dir` seul. Sans les deux, un courriel arabe s'affiche en drapeau à
 * gauche — la ponctuation finale du mauvais côté de chaque phrase.
 *
 * Les styles sont EN LIGNE parce qu'un client de messagerie n'exécute pas de
 * feuille externe : c'est la contrainte du format, pas un oubli.
 */
function shell(loc: SiteLocale, inner: string): string {
  const rtl = isRtlLocale(loc);
  return `<div lang="${loc}" dir="${rtl ? 'rtl' : 'ltr'}" style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;color:#16191f;text-align:${rtl ? 'right' : 'left'}">
    <h2 style="font-family:Georgia,serif;color:#1f3d6e">${BRAND}</h2>
    ${inner}
  </div>`;
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Sujet suffixé de la marque, comme les courriels actuels. */
function subject(p: Phrase, loc: SiteLocale): string {
  return `${p[loc]} · ${BRAND}`;
}

// --- Code à usage unique -----------------------------------------------------

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

/** Courriel de code à usage unique (vérification, réinitialisation, connexion). */
export function otpEmail(
  code: string,
  purpose: OtpPurpose,
  loc: SiteLocale,
): { subject: string; html: string } {
  // `dir="ltr"` SUR LE CODE, même en arabe : c'est une suite de chiffres à lire
  // de gauche à droite, et l'espacement des lettres la rend fragile à
  // l'algorithme bidirectionnel si elle hérite du sens du paragraphe.
  const body = `<p>${OTP_INTRO[purpose][loc]}</p>
    <p dir="ltr" style="font-size:30px;letter-spacing:8px;font-weight:600;font-family:monospace;text-align:center">${escapeHtml(code)}</p>
    <p style="color:#646771;font-size:13px">${OTP_EXPIRY[loc]}</p>`;
  return {
    subject: subject(OTP_SUBJECT[purpose], loc),
    html: shell(loc, body),
  };
}

// --- Invitation / adhésion validée -------------------------------------------

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

/** `{org}` est remplacé par le nom de l'organisation, déjà échappé. */
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
 * Courriel d'invitation. Le membre n'a PAS de mot de passe : on l'oriente vers
 * la connexion par code à usage unique, qui fonctionne dès que son compte
 * existe.
 *
 * Le lien porte la LANGUE DU DESTINATAIRE. Il était écrit `/fr/connexion-otp`
 * en dur : un membre arabophone recevait un courriel qui, même traduit,
 * l'aurait déposé sur une page française.
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

  const body = `<p>${GREETING[loc]}</p>
    <p>${intro}</p>
    <p>${INVITE_HOWTO[loc]}</p>
    <p><a href="${signInUrl}" style="display:inline-block;background:#1f3d6e;color:#fff;padding:12px 20px;border-radius:4px;text-decoration:none;font-weight:600">${INVITE_CTA[loc]}</a></p>
    <p style="color:#646771;font-size:13px">${INVITE_NOTE[loc]}</p>`;

  return {
    subject: subject(
      approuve ? INVITE_SUBJECT_APPROVED : INVITE_SUBJECT_ACCOUNT,
      loc,
    ),
    html: shell(loc, body),
  };
}

// --- Rappel d'événement -------------------------------------------------------

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

/** `{date}` est remplacé par la date formatée dans la langue du destinataire. */
const REMINDER_WHEN: Phrase = {
  fr: 'Il a lieu le <strong>{date}</strong>. Retrouvez les informations pratiques et confirmez votre présence :',
  en: 'It takes place on <strong>{date}</strong>. Find the practical details and confirm your attendance:',
  es: 'Se celebra el <strong>{date}</strong>. Consulte la información práctica y confirme su asistencia:',
  pt: 'Realiza-se a <strong>{date}</strong>. Consulte as informações práticas e confirme a sua presença:',
  ar: 'تُقام في <strong>{date}</strong>. اطّلعوا على المعلومات العملية وأكّدوا حضوركم:',
};

const REMINDER_FOOTER: Phrase = {
  fr: 'Vous recevez cet e-mail car vous avez demandé un rappel sur le site de Democracy Together.',
  en: 'You are receiving this email because you requested a reminder on the Democracy Together website.',
  es: 'Recibe este mensaje porque solicitó un recordatorio en el sitio de Democracy Together.',
  pt: 'Recebe esta mensagem porque pediu um lembrete no sítio da Democracy Together.',
  ar: 'تصلكم هذه الرسالة لأنكم طلبتم تذكيراً على موقع Democracy Together.',
};

/**
 * Courriel de rappel d'événement.
 *
 * La date est formatée dans la LANGUE DU DESTINATAIRE. Elle l'était en français
 * en dur (`Intl.DateTimeFormat('fr', …)`), alors que la ligne de rappel portait
 * déjà sa locale — celle-ci ne servait qu'à construire l'URL.
 */
export function eventReminderEmail(args: {
  eventSlug: string;
  eventDate: number;
  siteUrl: string;
  locale: SiteLocale;
}): { subject: string; html: string } {
  const loc = args.locale;
  const url = `${args.siteUrl.replace(/\/+$/, '')}/${loc}/evenements/${encodeURIComponent(args.eventSlug)}`;
  const when = new Intl.DateTimeFormat(intlTag(loc), {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(args.eventDate);

  const body = `<p>${REMINDER_LEAD[loc]}</p>
    <p>${REMINDER_WHEN[loc].replace('{date}', escapeHtml(when))}</p>
    <p><a href="${url}">${escapeHtml(url)}</a></p>
    <hr style="border:none;border-top:1px solid #d9d6cd;margin:24px 0"/>
    <p style="color:#646771;font-size:12px">${REMINDER_FOOTER[loc]}</p>`;

  return { subject: subject(REMINDER_SUBJECT, loc), html: shell(loc, body) };
}
