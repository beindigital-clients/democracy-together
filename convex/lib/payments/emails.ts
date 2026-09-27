import { escapeHtml, shell, subject, type Phrase } from '../emailContent';
import { intlTag, type SiteLocale } from '../locales';
import { fromMinor, type Currency } from './amounts';

// COURRIELS DE PAIEMENT (F-28/F-29) — dans la langue du payeur, sur la coque
// commune des courriels transactionnels (convex/lib/emailContent.ts). Le REÇU,
// lui, est en français : c'est un document comptable (cf. receiptPdf.ts).

/** Montant formaté dans la langue du destinataire. */
export function formatAmountFor(
  minor: number,
  currency: Currency,
  loc: SiteLocale,
): string {
  return new Intl.NumberFormat(intlTag(loc), {
    style: 'currency',
    currency,
    currencyDisplay: 'code',
  }).format(fromMinor(minor, currency));
}

const BUTTON =
  'display:inline-block;background:#1f3d6e;color:#fff;padding:12px 20px;border-radius:4px;text-decoration:none;font-weight:600';

// --- Confirmation de paiement -------------------------------------------------

const CONFIRM_SUBJECT: Record<'donation' | 'dues', Phrase> = {
  donation: {
    fr: 'Merci pour votre don',
    en: 'Thank you for your donation',
    es: 'Gracias por su donación',
    pt: 'Obrigado pelo seu donativo',
    ar: 'شكراً على تبرّعكم',
  },
  dues: {
    fr: 'Votre cotisation est enregistrée',
    en: 'Your membership fee has been received',
    es: 'Su cuota de socio ha sido registrada',
    pt: 'A sua quota foi registada',
    ar: 'تم تسجيل اشتراككم',
  },
};

const CONFIRM_LEAD: Record<'donation' | 'dues', Phrase> = {
  donation: {
    fr: 'Nous avons bien reçu votre don de <strong>{amount}</strong>. Merci de soutenir le réseau Democracy Together.',
    en: 'We have received your donation of <strong>{amount}</strong>. Thank you for supporting the Democracy Together network.',
    es: 'Hemos recibido su donación de <strong>{amount}</strong>. Gracias por apoyar la red Democracy Together.',
    pt: 'Recebemos o seu donativo de <strong>{amount}</strong>. Obrigado por apoiar a rede Democracy Together.',
    ar: 'تلقّينا تبرّعكم بمبلغ <strong>{amount}</strong>. شكراً لدعمكم شبكة Democracy Together.',
  },
  dues: {
    fr: 'Nous avons bien reçu votre cotisation de <strong>{amount}</strong>.',
    en: 'We have received your membership fee of <strong>{amount}</strong>.',
    es: 'Hemos recibido su cuota de socio de <strong>{amount}</strong>.',
    pt: 'Recebemos a sua quota de <strong>{amount}</strong>.',
    ar: 'تلقّينا اشتراككم بمبلغ <strong>{amount}</strong>.',
  },
};

const CONFIRM_RECURRING: Phrase = {
  fr: 'Il s’agit d’un don mensuel : vous pouvez l’arrêter à tout moment depuis votre espace membre, ou en répondant à ce message.',
  en: 'This is a monthly donation: you can stop it at any time from your member area, or by replying to this message.',
  es: 'Se trata de una donación mensual: puede detenerla en cualquier momento desde su espacio de socio o respondiendo a este mensaje.',
  pt: 'Trata-se de um donativo mensal: pode interrompê-lo a qualquer momento a partir da sua área de membro, ou respondendo a esta mensagem.',
  ar: 'هذا تبرّع شهري: يمكنكم إيقافه في أي وقت من فضاء العضو أو بالرد على هذه الرسالة.',
};

const CONFIRM_RECEIPT: Phrase = {
  fr: 'Votre reçu n° {number} est disponible :',
  en: 'Your receipt no. {number} is available:',
  es: 'Su recibo n.º {number} está disponible:',
  pt: 'O seu recibo n.º {number} está disponível:',
  ar: 'إيصالكم رقم {number} متاح:',
};

const CONFIRM_CTA: Phrase = {
  fr: 'Télécharger le reçu',
  en: 'Download the receipt',
  es: 'Descargar el recibo',
  pt: 'Descarregar o recibo',
  ar: 'تنزيل الإيصال',
};

const CONFIRM_NOTE: Phrase = {
  fr: 'Ce lien est personnel : ne le transférez pas. Le reçu est établi en français, langue de la comptabilité de l’association.',
  en: 'This link is personal: please do not forward it. The receipt is issued in French, the language of the association’s accounts.',
  es: 'Este enlace es personal: no lo reenvíe. El recibo se emite en francés, idioma de la contabilidad de la asociación.',
  pt: 'Esta ligação é pessoal: não a reencaminhe. O recibo é emitido em francês, a língua da contabilidade da associação.',
  ar: 'هذا الرابط شخصي: يُرجى عدم إعادة توجيهه. يُصدَر الإيصال باللغة الفرنسية، لغة محاسبة الجمعية.',
};

export function paymentConfirmationEmail(args: {
  kind: 'donation' | 'dues';
  recurring: boolean;
  amountMinor: number;
  currency: Currency;
  receiptNumber: string;
  receiptUrl: string;
  locale: SiteLocale;
}): { subject: string; html: string } {
  const loc = args.locale;
  const amount = escapeHtml(
    formatAmountFor(args.amountMinor, args.currency, loc),
  );
  const body = `<p>${CONFIRM_LEAD[args.kind][loc].replace('{amount}', amount)}</p>
    ${args.recurring ? `<p>${CONFIRM_RECURRING[loc]}</p>` : ''}
    <p>${CONFIRM_RECEIPT[loc].replace('{number}', escapeHtml(args.receiptNumber))}</p>
    <p><a href="${escapeHtml(args.receiptUrl)}" style="${BUTTON}">${CONFIRM_CTA[loc]}</a></p>
    <p style="color:#646771;font-size:13px">${CONFIRM_NOTE[loc]}</p>`;
  return {
    subject: subject(CONFIRM_SUBJECT[args.kind], loc),
    html: shell(loc, body),
  };
}

// --- Relance d'échéance (don mensuel sans prélèvement automatique) ------------

const REMINDER_SUBJECT: Phrase = {
  fr: 'Votre don mensuel : échéance à régler',
  en: 'Your monthly donation is due',
  es: 'Su donación mensual: vencimiento pendiente',
  pt: 'O seu donativo mensal: prestação a pagar',
  ar: 'تبرّعكم الشهري: موعد الدفع',
};

const REMINDER_LEAD: Phrase = {
  fr: 'L’échéance de votre don mensuel de <strong>{amount}</strong> est arrivée. Votre moyen de paiement ne permet pas le prélèvement automatique : il suffit de suivre ce lien pour la régler.',
  en: 'Your monthly donation of <strong>{amount}</strong> is due. Your payment method does not support automatic debits: just follow this link to pay it.',
  es: 'Ha llegado el vencimiento de su donación mensual de <strong>{amount}</strong>. Su medio de pago no admite cargos automáticos: basta con seguir este enlace para abonarla.',
  pt: 'Chegou a data do seu donativo mensal de <strong>{amount}</strong>. O seu meio de pagamento não permite débito automático: basta seguir esta ligação para o pagar.',
  ar: 'حلّ موعد تبرّعكم الشهري بمبلغ <strong>{amount}</strong>. وسيلة الدفع لديكم لا تتيح الاقتطاع التلقائي: يكفي اتباع هذا الرابط للدفع.',
};

const REMINDER_CTA: Phrase = {
  fr: 'Régler l’échéance',
  en: 'Pay this instalment',
  es: 'Abonar el vencimiento',
  pt: 'Pagar a prestação',
  ar: 'دفع القسط',
};

const REMINDER_STOP: Phrase = {
  fr: 'Vous ne souhaitez plus donner chaque mois ? Arrêtez votre don depuis votre espace membre, ou répondez simplement à ce message.',
  en: 'No longer wish to give every month? Stop your donation from your member area, or simply reply to this message.',
  es: '¿Ya no desea donar cada mes? Detenga su donación desde su espacio de socio o responda simplemente a este mensaje.',
  pt: 'Já não deseja doar todos os meses? Interrompa o seu donativo a partir da sua área de membro ou responda simplesmente a esta mensagem.',
  ar: 'لم تعودوا ترغبون في التبرّع كل شهر؟ أوقفوا تبرّعكم من فضاء العضو أو ردّوا ببساطة على هذه الرسالة.',
};

export function recurringReminderEmail(args: {
  amountMinor: number;
  currency: Currency;
  payUrl: string;
  locale: SiteLocale;
}): { subject: string; html: string } {
  const loc = args.locale;
  const amount = escapeHtml(
    formatAmountFor(args.amountMinor, args.currency, loc),
  );
  const body = `<p>${REMINDER_LEAD[loc].replace('{amount}', amount)}</p>
    <p><a href="${escapeHtml(args.payUrl)}" style="${BUTTON}">${REMINDER_CTA[loc]}</a></p>
    <p style="color:#646771;font-size:13px">${REMINDER_STOP[loc]}</p>`;
  return { subject: subject(REMINDER_SUBJECT, loc), html: shell(loc, body) };
}

// --- Arrêt d'un don mensuel ---------------------------------------------------

const CANCEL_SUBJECT: Phrase = {
  fr: 'Votre don mensuel est arrêté',
  en: 'Your monthly donation has been stopped',
  es: 'Su donación mensual se ha detenido',
  pt: 'O seu donativo mensal foi interrompido',
  ar: 'تم إيقاف تبرّعكم الشهري',
};

const CANCEL_LEAD: Phrase = {
  fr: 'Votre don mensuel de <strong>{amount}</strong> est arrêté : aucune nouvelle échéance ne vous sera demandée. Merci pour votre soutien.',
  en: 'Your monthly donation of <strong>{amount}</strong> has been stopped: no further instalment will be requested. Thank you for your support.',
  es: 'Su donación mensual de <strong>{amount}</strong> se ha detenido: no se le solicitará ningún nuevo pago. Gracias por su apoyo.',
  pt: 'O seu donativo mensal de <strong>{amount}</strong> foi interrompido: não lhe será pedida nenhuma nova prestação. Obrigado pelo seu apoio.',
  ar: 'تم إيقاف تبرّعكم الشهري بمبلغ <strong>{amount}</strong>: لن يُطلب منكم أي قسط جديد. شكراً لدعمكم.',
};

export function recurringCancelledEmail(args: {
  amountMinor: number;
  currency: Currency;
  locale: SiteLocale;
}): { subject: string; html: string } {
  const loc = args.locale;
  const amount = escapeHtml(
    formatAmountFor(args.amountMinor, args.currency, loc),
  );
  return {
    subject: subject(CANCEL_SUBJECT, loc),
    html: shell(loc, `<p>${CANCEL_LEAD[loc].replace('{amount}', amount)}</p>`),
  };
}
