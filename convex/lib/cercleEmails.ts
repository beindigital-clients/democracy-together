import type { SiteLocale } from './locales';
import { GREETING, subject, type Phrase } from './emailContent';
import { emailDocument, emailKit } from './emailLayout';

// E-MAILS OF THE CERCLE DES AMIS REQUEST, in the five languages — same
// discipline as lib/membershipEmails.ts: each sentence is a
// `Record<SiteLocale, string>`, so a language added without its labels no
// longer compiles.
//
// Sent to an address typed into a PUBLIC form: none of them echoes anything the
// person typed (not even their name), so the form cannot be used to deliver
// someone else's text to a third party.

function base(siteUrl: string, loc: SiteLocale): string {
  return `${siteUrl.replace(/\/+$/, '')}/${loc}`;
}

// --- Request received ----------------------------------------------------------

const RECEIVED_SUBJECT: Phrase = {
  fr: 'Nous avons bien reçu votre demande pour rejoindre le Cercle des Amis',
  en: 'We have received your request to join the Circle of Friends',
  es: 'Hemos recibido su solicitud para unirse al Círculo de Amigos',
  pt: 'Recebemos o seu pedido para aderir ao Círculo de Amigos',
  ar: 'توصّلنا بطلبكم للانضمام إلى حلقة الأصدقاء',
};

const RECEIVED_LEAD: Phrase = {
  fr: 'Merci de votre intérêt pour Democracy Together. Votre demande pour rejoindre le Cercle des Amis nous est bien parvenue.',
  en: 'Thank you for your interest in Democracy Together. Your request to join the Circle of Friends has reached us.',
  es: 'Gracias por su interés en Democracy Together. Hemos recibido su solicitud para unirse al Círculo de Amigos.',
  pt: 'Obrigado pelo seu interesse na Democracy Together. O seu pedido para aderir ao Círculo de Amigos chegou até nós.',
  ar: 'نشكركم على اهتمامكم بـ Democracy Together. لقد وصلنا طلبكم للانضمام إلى حلقة الأصدقاء.',
};

const RECEIVED_NEXT: Phrase = {
  fr: 'Le président de l’association examine chaque demande. Vous recevrez sa réponse par e-mail, à cette adresse. D’ici là, votre demande ne donne accès à aucun espace.',
  en: 'The association’s president reviews every request. You will receive the answer by email, at this address. Until then, your request does not give access to any space.',
  es: 'El presidente de la asociación examina cada solicitud. Recibirá la respuesta por correo electrónico, en esta dirección. Hasta entonces, su solicitud no da acceso a ningún espacio.',
  pt: 'O presidente da associação analisa cada pedido. Receberá a resposta por correio eletrónico, para este endereço. Até lá, o seu pedido não dá acesso a nenhum espaço.',
  ar: 'يدرس رئيس الجمعية كل طلب. ستصلكم الإجابة عبر البريد الإلكتروني على هذا العنوان. وإلى ذلك الحين، لا يمنح طلبكم الوصول إلى أي فضاء.',
};

const RECEIVED_NOTE: Phrase = {
  fr: 'Si vous n’êtes pas à l’origine de cette demande, ignorez ce message : aucun compte n’est ouvert sans l’accord du président.',
  en: 'If you did not make this request, ignore this message: no account is opened without the president’s approval.',
  es: 'Si usted no ha hecho esta solicitud, ignore este mensaje: no se abre ninguna cuenta sin la aprobación del presidente.',
  pt: 'Se não fez este pedido, ignore esta mensagem: nenhuma conta é aberta sem a aprovação do presidente.',
  ar: 'إن لم تكونوا من قدّم هذا الطلب، تجاهلوا هذه الرسالة: لا يُفتح أي حساب دون موافقة الرئيس.',
};

export function cercleRequestReceivedEmail(args: {
  siteUrl: string;
  locale: SiteLocale;
}): { subject: string; html: string } {
  const loc = args.locale;
  const kit = emailKit(loc);
  const body =
    kit.paragraph(GREETING[loc]) +
    kit.paragraph(RECEIVED_LEAD[loc]) +
    kit.paragraph(RECEIVED_NEXT[loc]) +
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

// --- Request approved: the sign-in invitation -------------------------------------

const APPROVED_SUBJECT: Phrase = {
  fr: 'Bienvenue dans le Cercle des Amis',
  en: 'Welcome to the Circle of Friends',
  es: 'Bienvenido al Círculo de Amigos',
  pt: 'Bem-vindo ao Círculo de Amigos',
  ar: 'مرحبًا بكم في حلقة الأصدقاء',
};

const APPROVED_LEAD: Phrase = {
  fr: 'Le président a accepté votre demande : vous êtes désormais Ami de Democracy Together.',
  en: 'The president has accepted your request: you are now a Friend of Democracy Together.',
  es: 'El presidente ha aceptado su solicitud: ya es Amigo de Democracy Together.',
  pt: 'O presidente aceitou o seu pedido: é agora Amigo da Democracy Together.',
  ar: 'قبل الرئيس طلبكم: أصبحتم الآن صديقًا لـ Democracy Together.',
};

const APPROVED_HOWTO: Phrase = {
  fr: 'Connectez-vous avec cette adresse e-mail : un code à usage unique vous sera envoyé. Vous accédez à l’espace privé du Cercle, et vous recevrez de temps en temps les nouvelles du Cercle par e-mail. Chaque message contient un lien pour vous désinscrire.',
  en: 'Sign in with this email address: a one-time code will be sent to you. You get access to the Circle’s private space, and you will receive the Circle’s news by email from time to time. Every message contains a link to unsubscribe.',
  es: 'Inicie sesión con esta dirección de correo: se le enviará un código de un solo uso. Accede al espacio privado del Círculo y recibirá de vez en cuando las novedades del Círculo por correo. Cada mensaje incluye un enlace para darse de baja.',
  pt: 'Inicie sessão com este endereço de correio eletrónico: ser-lhe-á enviado um código de utilização única. Acede ao espaço privado do Círculo e receberá de vez em quando as novidades do Círculo por correio eletrónico. Cada mensagem contém uma ligação para cancelar a subscrição.',
  ar: 'سجّلوا الدخول بعنوان البريد الإلكتروني هذا: سيُرسل إليكم رمز لمرة واحدة. تصلون إلى الفضاء الخاص بالحلقة، وستتلقون من حين لآخر أخبار الحلقة عبر البريد الإلكتروني. تتضمن كل رسالة رابطًا لإلغاء الاشتراك.',
};

const APPROVED_CTA: Phrase = {
  fr: 'Me connecter',
  en: 'Sign in',
  es: 'Iniciar sesión',
  pt: 'Iniciar sessão',
  ar: 'تسجيل الدخول',
};

const APPROVED_NOTE: Phrase = {
  fr: 'Si vous n’attendiez pas ce message, ignorez-le.',
  en: 'If you were not expecting this message, ignore it.',
  es: 'Si no esperaba este mensaje, ignórelo.',
  pt: 'Se não esperava esta mensagem, ignore-a.',
  ar: 'إن لم تكونوا تتوقعون هذه الرسالة، تجاهلوها.',
};

export function cercleApprovedEmail(args: {
  siteUrl: string;
  locale: SiteLocale;
}): { subject: string; html: string } {
  const loc = args.locale;
  const signInUrl = `${base(args.siteUrl, loc)}/connexion-otp`;
  const kit = emailKit(loc);
  const body =
    kit.paragraph(GREETING[loc]) +
    kit.paragraph(APPROVED_LEAD[loc]) +
    kit.paragraph(APPROVED_HOWTO[loc]) +
    kit.button(signInUrl, APPROVED_CTA[loc]) +
    kit.fallback(signInUrl) +
    kit.signature() +
    kit.note(APPROVED_NOTE[loc]);
  return {
    subject: subject(APPROVED_SUBJECT, loc),
    html: emailDocument({
      loc,
      title: APPROVED_SUBJECT[loc],
      preheader: APPROVED_LEAD[loc],
      body,
    }),
  };
}

// --- Request declined ---------------------------------------------------------------
//
// The subject does not announce the outcome (an inbox preview is not the place
// to learn it) and the reviewer's note never travels.

const DECLINED_SUBJECT: Phrase = {
  fr: 'Votre demande pour le Cercle des Amis',
  en: 'Your request for the Circle of Friends',
  es: 'Su solicitud para el Círculo de Amigos',
  pt: 'O seu pedido para o Círculo de Amigos',
  ar: 'طلبكم للانضمام إلى حلقة الأصدقاء',
};

const DECLINED_LEAD: Phrase = {
  fr: 'Merci de l’intérêt que vous portez à Democracy Together et du temps consacré à votre demande. Après examen, nous ne pouvons pas y donner une suite favorable pour le moment.',
  en: 'Thank you for your interest in Democracy Together and for the time you devoted to your request. After review, we are unable to accept it for now.',
  es: 'Gracias por su interés en Democracy Together y por el tiempo dedicado a su solicitud. Tras examinarla, no podemos darle una respuesta favorable por el momento.',
  pt: 'Obrigado pelo seu interesse na Democracy Together e pelo tempo dedicado ao seu pedido. Após análise, não podemos dar-lhe seguimento favorável por agora.',
  ar: 'نشكركم على اهتمامكم بـ Democracy Together وعلى الوقت الذي خصّصتموه لطلبكم. بعد الدراسة، لا يمكننا قبوله في الوقت الحالي.',
};

const DECLINED_CV: Phrase = {
  fr: 'Le CV que vous aviez joint a été supprimé de nos serveurs.',
  en: 'The CV you attached has been deleted from our servers.',
  es: 'El CV que adjuntó ha sido eliminado de nuestros servidores.',
  pt: 'O CV que anexou foi eliminado dos nossos servidores.',
  ar: 'تم حذف السيرة الذاتية التي أرفقتموها من خوادمنا.',
};

export function cercleDeclinedEmail(args: {
  siteUrl: string;
  locale: SiteLocale;
}): { subject: string; html: string } {
  const loc = args.locale;
  const kit = emailKit(loc);
  const body =
    kit.paragraph(GREETING[loc]) +
    kit.paragraph(DECLINED_LEAD[loc]) +
    kit.paragraph(DECLINED_CV[loc]) +
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
