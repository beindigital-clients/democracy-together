import type { SiteLocale } from './locales';
import { escapeHtml, shell, subject, type Phrase } from './emailContent';

// E-mails of the "comptes" workstream, in the five languages — same discipline
// as lib/emailContent.ts (each sentence is a `Record<SiteLocale, string>`:
// a language without a label does not compile). Separate file so as not to
// rewrite the shared module for every workstream.

const GREETING: Phrase = {
  fr: 'Bonjour,',
  en: 'Hello,',
  es: 'Hola:',
  pt: 'Olá,',
  ar: 'مرحباً،',
};

// --- Welcome for an account created on someone's behalf ----------------------

const WELCOME_SUBJECT: Phrase = {
  fr: 'Votre compte a été créé',
  en: 'Your account has been created',
  es: 'Se ha creado su cuenta',
  pt: 'A sua conta foi criada',
  ar: 'تم إنشاء حسابكم',
};

const WELCOME_INTRO: Phrase = {
  fr: 'Un compte vient d’être ouvert pour vous sur la plateforme Democracy Together.',
  en: 'An account has just been opened for you on the Democracy Together platform.',
  es: 'Se acaba de abrir una cuenta para usted en la plataforma Democracy Together.',
  pt: 'Acabou de ser aberta uma conta para si na plataforma Democracy Together.',
  ar: 'تم للتوّ فتح حساب لكم على منصة Democracy Together.',
};

/** `{org}` is replaced by the organization's name (escaped). */
const WELCOME_ORG: Phrase = {
  fr: 'Il est rattaché à l’organisation <strong>{org}</strong>.',
  en: 'It is linked to the organisation <strong>{org}</strong>.',
  es: 'Está vinculada a la organización <strong>{org}</strong>.',
  pt: 'Está associada à organização <strong>{org}</strong>.',
  ar: 'وهو مرتبط بالمنظمة <strong>{org}</strong>.',
};

const WELCOME_HOWTO: Phrase = {
  fr: 'Pour vous connecter, saisissez votre adresse sur la page ci-dessous : vous recevrez un code à usage unique. Vous pourrez ensuite définir un mot de passe et activer la double authentification depuis votre espace membre.',
  en: 'To sign in, enter your address on the page below: you will receive a one-time code. You can then set a password and turn on two-factor authentication from your member area.',
  es: 'Para conectarse, introduzca su dirección en la página siguiente: recibirá un código de un solo uso. Después podrá definir una contraseña y activar la autenticación en dos pasos desde su espacio de miembro.',
  pt: 'Para iniciar sessão, introduza o seu endereço na página abaixo: receberá um código de utilização única. Poderá depois definir uma palavra-passe e ativar a autenticação de dois fatores a partir da sua área de membro.',
  ar: 'لتسجيل الدخول، أدخلوا عنوانكم في الصفحة أدناه: ستتلقون رمزاً صالحاً لمرة واحدة. يمكنكم بعد ذلك تعيين كلمة مرور وتفعيل المصادقة الثنائية من فضاء العضو.',
};

const WELCOME_CTA: Phrase = {
  fr: 'Me connecter',
  en: 'Sign in',
  es: 'Iniciar sesión',
  pt: 'Iniciar sessão',
  ar: 'تسجيل الدخول',
};

const WELCOME_NOTE: Phrase = {
  fr: 'Si vous n’attendiez pas ce message, vous pouvez l’ignorer : aucun accès n’est ouvert sans le code envoyé à cette adresse.',
  en: 'If you were not expecting this message, you can ignore it: no access is granted without the code sent to this address.',
  es: 'Si no esperaba este mensaje, puede ignorarlo: no se concede ningún acceso sin el código enviado a esta dirección.',
  pt: 'Se não estava à espera desta mensagem, pode ignorá-la: nenhum acesso é concedido sem o código enviado para este endereço.',
  ar: 'إن لم تكونوا تنتظرون هذه الرسالة، يمكنكم تجاهلها: لا يُمنح أي وصول دون الرمز المرسل إلى هذا العنوان.',
};

export function accountWelcomeEmail(args: {
  siteUrl: string;
  locale: SiteLocale;
  organizationName?: string;
}): { subject: string; html: string } {
  const loc = args.locale;
  const signInUrl = `${args.siteUrl.replace(/\/+$/, '')}/${loc}/connexion-otp`;
  const org = args.organizationName
    ? `<p>${WELCOME_ORG[loc].replace('{org}', escapeHtml(args.organizationName))}</p>`
    : '';
  const body = `<p>${GREETING[loc]}</p>
    <p>${WELCOME_INTRO[loc]}</p>
    ${org}
    <p>${WELCOME_HOWTO[loc]}</p>
    <p><a href="${signInUrl}" style="display:inline-block;background:#1f3d6e;color:#fff;padding:12px 20px;border-radius:4px;text-decoration:none;font-weight:600">${WELCOME_CTA[loc]}</a></p>
    <p style="color:#646771;font-size:13px">${WELCOME_NOTE[loc]}</p>`;
  return { subject: subject(WELCOME_SUBJECT, loc), html: shell(loc, body) };
}

// --- Reconfirmation of one's own account deletion ----------------------------

const DELETE_SUBJECT: Phrase = {
  fr: 'Confirmez la suppression de votre compte',
  en: 'Confirm the deletion of your account',
  es: 'Confirme la eliminación de su cuenta',
  pt: 'Confirme a eliminação da sua conta',
  ar: 'أكّدوا حذف حسابكم',
};

const DELETE_LEAD: Phrase = {
  fr: 'Vous avez demandé la suppression de votre compte Democracy Together. Pour la confirmer, saisissez ce code dans votre espace membre :',
  en: 'You asked for your Democracy Together account to be deleted. To confirm, enter this code in your member area:',
  es: 'Ha solicitado la eliminación de su cuenta de Democracy Together. Para confirmarla, introduzca este código en su espacio de miembro:',
  pt: 'Pediu a eliminação da sua conta Democracy Together. Para a confirmar, introduza este código na sua área de membro:',
  ar: 'لقد طلبتم حذف حسابكم على Democracy Together. للتأكيد، أدخلوا هذا الرمز في فضاء العضو:',
};

const DELETE_WARNING: Phrase = {
  fr: 'La suppression est définitive. Le code expire dans 15 minutes. Si vous n’êtes pas à l’origine de cette demande, ignorez ce message et changez votre mot de passe.',
  en: 'Deletion is permanent. The code expires in 15 minutes. If you did not make this request, ignore this message and change your password.',
  es: 'La eliminación es definitiva. El código caduca en 15 minutos. Si no ha realizado esta solicitud, ignore este mensaje y cambie su contraseña.',
  pt: 'A eliminação é definitiva. O código expira em 15 minutos. Se não fez este pedido, ignore esta mensagem e altere a sua palavra-passe.',
  ar: 'الحذف نهائي. تنتهي صلاحية الرمز خلال 15 دقيقة. إن لم تكونوا من قدّم هذا الطلب، تجاهلوا هذه الرسالة وغيّروا كلمة المرور.',
};

export function accountDeletionCodeEmail(args: {
  code: string;
  locale: SiteLocale;
}): { subject: string; html: string } {
  const loc = args.locale;
  const body = `<p>${GREETING[loc]}</p>
    <p>${DELETE_LEAD[loc]}</p>
    <p dir="ltr" style="font-size:28px;font-weight:700;letter-spacing:6px;font-family:ui-monospace,monospace">${escapeHtml(args.code)}</p>
    <p style="color:#646771;font-size:13px">${DELETE_WARNING[loc]}</p>`;
  return { subject: subject(DELETE_SUBJECT, loc), html: shell(loc, body) };
}
