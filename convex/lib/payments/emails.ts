import { escapeHtml, plain, subject, type Phrase } from '../emailContent';
import { emailDocument, emailKit } from '../emailLayout';
import { intlTag, type SiteLocale } from '../locales';
import { fromMinor, type Currency } from './amounts';

// PAYMENT E-MAILS (F-28/F-29) — in the payer's language, on the shared shell
// of transactional e-mails (convex/lib/emailContent.ts). The RECEIPT, however,
// is in French: it is an accounting document (see receiptPdf.ts).

/** Amount formatted in the recipient's language. */
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

// --- Payment confirmation -----------------------------------------------------

const AMOUNT_LABEL: Phrase = {
  fr: 'Montant',
  en: 'Amount',
  es: 'Importe',
  pt: 'Montante',
  ar: 'المبلغ',
};

const RECEIPT_LABEL: Phrase = {
  fr: 'Reçu n°',
  en: 'Receipt no.',
  es: 'Recibo n.º',
  pt: 'Recibo n.º',
  ar: 'رقم الإيصال',
};

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
  const lead = CONFIRM_LEAD[args.kind][loc].replace('{amount}', amount);
  const number = escapeHtml(args.receiptNumber);
  const kit = emailKit(loc);
  const body =
    kit.paragraph(lead) +
    kit.details([
      { label: AMOUNT_LABEL[loc], value: amount },
      { label: RECEIPT_LABEL[loc], value: number },
    ]) +
    (args.recurring ? kit.paragraph(CONFIRM_RECURRING[loc]) : '') +
    kit.button(args.receiptUrl, CONFIRM_CTA[loc]) +
    kit.note(CONFIRM_NOTE[loc]);
  return {
    subject: subject(CONFIRM_SUBJECT[args.kind], loc),
    html: emailDocument({
      loc,
      title: CONFIRM_SUBJECT[args.kind][loc],
      preheader: plain(lead),
      body,
    }),
  };
}

// --- Instalment reminder (monthly donation without automatic debit) ---------

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
  const lead = REMINDER_LEAD[loc].replace('{amount}', amount);
  const kit = emailKit(loc);
  const body =
    kit.paragraph(lead) +
    kit.button(args.payUrl, REMINDER_CTA[loc]) +
    kit.fallback(args.payUrl) +
    kit.note(REMINDER_STOP[loc]);
  return {
    subject: subject(REMINDER_SUBJECT, loc),
    html: emailDocument({
      loc,
      title: REMINDER_SUBJECT[loc],
      preheader: plain(lead),
      body,
    }),
  };
}

// --- Stopping a monthly donation ----------------------------------------------

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
  const lead = CANCEL_LEAD[loc].replace('{amount}', amount);
  return {
    subject: subject(CANCEL_SUBJECT, loc),
    html: emailDocument({
      loc,
      title: CANCEL_SUBJECT[loc],
      preheader: plain(lead),
      body: emailKit(loc).paragraph(lead),
    }),
  };
}
