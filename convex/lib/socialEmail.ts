import { escapeHtml } from './emailContent';
import { type SiteLocale, isRtlLocale } from './locales';

// "NEW MESSAGE FROM X" E-MAIL (private messaging).
//
// It carries ONLY the sender's name and a link to the inbox: never the
// message content. An e-mail leaves the platform (mail servers, lock-screen
// previews, forwards); the content of a private exchange has no business
// following it.
//
// Same discipline as `emailContent.ts`: each sentence is a
// `Record<SiteLocale, string>`, so a language added without its labels no
// longer compiles.

type Phrase = Record<SiteLocale, string>;

const SUBJECT: Phrase = {
  fr: 'Nouveau message de {name}',
  en: 'New message from {name}',
  es: 'Nuevo mensaje de {name}',
  pt: 'Nova mensagem de {name}',
  ar: 'رسالة جديدة من {name}',
};

const LEAD: Phrase = {
  fr: '{name} vous a écrit sur Democracy Together.',
  en: '{name} has written to you on Democracy Together.',
  es: '{name} le ha escrito en Democracy Together.',
  pt: '{name} escreveu-lhe na Democracy Together.',
  ar: 'راسلكم {name} على منصة Democracy Together.',
};

const CTA: Phrase = {
  fr: 'Lire le message',
  en: 'Read the message',
  es: 'Leer el mensaje',
  pt: 'Ler a mensagem',
  ar: 'قراءة الرسالة',
};

const FOOTER: Phrase = {
  fr: 'Vous recevez ce courriel parce que vous avez activé l’alerte « nouveau message » dans votre profil. Vous pouvez la désactiver depuis votre espace membre.',
  en: 'You are receiving this email because you turned on “new message” alerts in your profile. You can turn them off from your member area.',
  es: 'Recibe este correo porque activó el aviso de «nuevo mensaje» en su perfil. Puede desactivarlo desde su espacio de miembro.',
  pt: 'Recebe esta mensagem porque ativou o alerta de «nova mensagem» no seu perfil. Pode desativá-lo a partir do seu espaço de membro.',
  ar: 'تصلكم هذه الرسالة لأنكم فعّلتم تنبيه «رسالة جديدة» في ملفكم الشخصي. يمكنكم إيقافه من فضاء العضو.',
};

export function newMessageEmail(args: {
  senderName: string;
  siteUrl: string;
  locale: SiteLocale;
}): { subject: string; html: string } {
  const loc = args.locale;
  const rtl = isRtlLocale(loc);
  const name = escapeHtml(args.senderName);
  const url = `${args.siteUrl.replace(/\/+$/, '')}/${loc}/espace-membre/messages`;
  const html = `<div lang="${loc}" dir="${rtl ? 'rtl' : 'ltr'}" style="font-family:system-ui,sans-serif;max-width:520px;margin:auto;color:#16191f;text-align:${rtl ? 'right' : 'left'}">
    <h2 style="font-family:Georgia,serif;color:#1f3d6e">Democracy Together</h2>
    <p>${LEAD[loc].replace('{name}', name)}</p>
    <p><a href="${url}">${CTA[loc]}</a></p>
    <hr style="border:none;border-top:1px solid #d9d6cd;margin:24px 0"/>
    <p style="color:#646771;font-size:12px">${FOOTER[loc]}</p>
  </div>`;
  // The subject is plain text: no HTML escaping, but no line break either
  // (header injection).
  const subjectName = args.senderName.replace(/[\r\n]+/g, ' ');
  return {
    subject: `${SUBJECT[loc].replace('{name}', subjectName)} · Democracy Together`,
    html,
  };
}
