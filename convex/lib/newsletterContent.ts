import { escapeHtml } from './emailContent';
import { emailDocument, emailKit, siteOrigin } from './emailLayout';
import type { SiteLocale } from './locales';

// NEWSLETTER E-MAILS, IN THE FIVE LANGUAGES (F-18 / F-65).
//
// Same discipline as `emailContent.ts`: each sentence is a
// `Record<SiteLocale, string>`, a language added without its labels does not
// compile. The text lives on the Convex side because an e-mail is composed at
// send time, on the server, and goes out frozen.

type Phrase = Record<SiteLocale, string>;

const BRAND = 'Democracy Together';

export function siteUrl(): string {
  return siteOrigin();
}

// --- Sign-up confirmation (double opt-in) ------------------------------------

const CONFIRM_SUBJECT: Phrase = {
  fr: 'Confirmez votre inscription à la lettre',
  en: 'Confirm your newsletter subscription',
  es: 'Confirme su suscripción al boletín',
  pt: 'Confirme a sua subscrição da newsletter',
  ar: 'أكّدوا اشتراككم في النشرة الإخبارية',
};

const CONFIRM_INTRO: Phrase = {
  fr: 'Vous avez demandé à recevoir la lettre de Democracy Together. Pour valider votre inscription, cliquez sur le bouton ci-dessous.',
  en: 'You asked to receive the Democracy Together newsletter. To confirm your subscription, click the button below.',
  es: 'Ha solicitado recibir el boletín de Democracy Together. Para validar su suscripción, haga clic en el botón siguiente.',
  pt: 'Pediu para receber a newsletter da Democracy Together. Para validar a sua subscrição, clique no botão abaixo.',
  ar: 'طلبتم تلقّي النشرة الإخبارية لـ Democracy Together. لتأكيد اشتراككم، انقروا على الزر أدناه.',
};

const CONFIRM_CTA: Phrase = {
  fr: 'Confirmer mon inscription',
  en: 'Confirm my subscription',
  es: 'Confirmar mi suscripción',
  pt: 'Confirmar a minha subscrição',
  ar: 'تأكيد اشتراكي',
};

const CONFIRM_EXPIRY: Phrase = {
  fr: "Ce lien expire dans 48 heures. Si vous n'êtes pas à l'origine de cette demande, ignorez ce message : sans confirmation, votre adresse sera supprimée et vous ne recevrez rien.",
  en: 'This link expires in 48 hours. If you did not make this request, ignore this message: without confirmation, your address will be deleted and you will receive nothing.',
  es: 'Este enlace caduca en 48 horas. Si no ha hecho esta solicitud, ignore este mensaje: sin confirmación, su dirección se eliminará y no recibirá nada.',
  pt: 'Esta ligação expira dentro de 48 horas. Se não fez este pedido, ignore esta mensagem: sem confirmação, o seu endereço será eliminado e não receberá nada.',
  ar: 'تنتهي صلاحية هذا الرابط خلال 48 ساعة. إذا لم تطلبوا ذلك، فتجاهلوا هذه الرسالة: من دون تأكيد، سيُحذف عنوانكم ولن تتلقّوا أي شيء.',
};

// Legacy subscribers (migration): the message says WHY we are writing to them.
const CONFIRM_LEGACY_INTRO: Phrase = {
  fr: 'Vous êtes inscrit à la lettre de Democracy Together. Nous renforçons la protection de vos données : pour continuer à la recevoir, confirmez votre inscription.',
  en: 'You are subscribed to the Democracy Together newsletter. We are strengthening the protection of your data: to keep receiving it, please confirm your subscription.',
  es: 'Está suscrito al boletín de Democracy Together. Reforzamos la protección de sus datos: para seguir recibiéndolo, confirme su suscripción.',
  pt: 'Está inscrito na newsletter da Democracy Together. Estamos a reforçar a proteção dos seus dados: para continuar a recebê-la, confirme a sua subscrição.',
  ar: 'أنتم مشتركون في النشرة الإخبارية لـ Democracy Together. نعزّز حماية بياناتكم: لمواصلة تلقّيها، يُرجى تأكيد اشتراككم.',
};

const CONFIRM_LEGACY_EXPIRY: Phrase = {
  fr: 'Sans confirmation sous 30 jours, votre adresse sera supprimée de nos listes.',
  en: 'Without confirmation within 30 days, your address will be removed from our lists.',
  es: 'Sin confirmación en un plazo de 30 días, su dirección se eliminará de nuestras listas.',
  pt: 'Sem confirmação no prazo de 30 dias, o seu endereço será removido das nossas listas.',
  ar: 'من دون تأكيد خلال 30 يوماً، سيُحذف عنوانكم من قوائمنا.',
};

export function confirmationUrl(token: string, loc: SiteLocale): string {
  return `${siteUrl()}/${loc}/newsletter/confirmation?token=${token}`;
}

export function confirmationEmail(
  token: string,
  loc: SiteLocale,
  legacy = false,
): { subject: string; html: string; url: string } {
  const url = confirmationUrl(token, loc);
  const intro = (legacy ? CONFIRM_LEGACY_INTRO : CONFIRM_INTRO)[loc];
  const kit = emailKit(loc);
  const body =
    kit.paragraph(intro) +
    kit.button(url, CONFIRM_CTA[loc]) +
    kit.fallback(url) +
    kit.note((legacy ? CONFIRM_LEGACY_EXPIRY : CONFIRM_EXPIRY)[loc]);
  return {
    subject: `${CONFIRM_SUBJECT[loc]} · ${BRAND}`,
    html: emailDocument({
      loc,
      title: CONFIRM_SUBJECT[loc],
      preheader: intro,
      body,
    }),
    url,
  };
}

// --- Campaign ----------------------------------------------------------------

const FOOTER: Phrase = {
  fr: 'Vous recevez cet e-mail car vous êtes inscrit à la lettre de Democracy Together.',
  en: 'You are receiving this email because you subscribed to the Democracy Together newsletter.',
  es: 'Recibe este correo porque está suscrito al boletín de Democracy Together.',
  pt: 'Recebe este e-mail porque subscreveu a newsletter da Democracy Together.',
  ar: 'تتلقّون هذه الرسالة لأنكم مشتركون في النشرة الإخبارية لـ Democracy Together.',
};

const UNSUBSCRIBE: Phrase = {
  fr: 'Se désinscrire',
  en: 'Unsubscribe',
  es: 'Darse de baja',
  pt: 'Cancelar a subscrição',
  ar: 'إلغاء الاشتراك',
};

const TEST_PREFIX: Phrase = {
  fr: '[TEST]',
  en: '[TEST]',
  es: '[PRUEBA]',
  pt: '[TESTE]',
  ar: '[اختبار]',
};

/** Unsubscribe link of the PAGE (e-mail footer). */
export function unsubscribePageUrl(token: string, loc: SiteLocale): string {
  return `${siteUrl()}/${loc}/newsletter/desinscription?token=${token}`;
}

/**
 * RFC 2369 / RFC 8058 headers for each campaign send.
 *
 * `List-Unsubscribe` points to the Convex HTTP entry point
 * (`/newsletter/unsubscribe`), which handles BOTH uses: a GET
 * (click in the e-mail client) redirects to the unsubscribe page
 * in the subscriber's language, a POST `List-Unsubscribe=One-Click` (Gmail's,
 * Yahoo's… "Se désabonner" button) unsubscribes with no further step — this is
 * what the major providers have required of bulk senders since 2024.
 *
 * Without `CONVEX_SITE_URL` (tests), the page link is still announced, but without
 * `List-Unsubscribe-Post`: a Next page cannot receive the POST, and
 * promising "one click" without delivering it would be worse than saying nothing.
 */
export function listUnsubscribeHeaders(
  token: string,
  loc: SiteLocale,
): Record<string, string> {
  const convexSite = process.env.CONVEX_SITE_URL;
  const mailto = process.env.NEWSLETTER_UNSUBSCRIBE_MAILTO;
  const links: string[] = [];
  let oneClick = false;
  if (convexSite) {
    links.push(
      `<${convexSite}/newsletter/unsubscribe?token=${token}&l=${loc}>`,
    );
    oneClick = true;
  } else {
    links.push(`<${unsubscribePageUrl(token, loc)}>`);
  }
  if (mailto) links.push(`<mailto:${mailto}?subject=unsubscribe>`);
  const headers: Record<string, string> = {
    'List-Unsubscribe': links.join(', '),
  };
  if (oneClick) headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  return headers;
}

/**
 * HTML of a campaign for one recipient. The campaign's subject is its
 * heading; the first paragraph, its preheader.
 */
export function campaignHtml(
  body: string,
  token: string,
  loc: SiteLocale,
  title: string,
): string {
  const kit = emailKit(loc);
  const blocks = body.split(/\n{2,}/);
  const paragraphs = blocks
    .map((p) => kit.paragraph(escapeHtml(p).replace(/\n/g, '<br/>')))
    .join('');
  const unsub = unsubscribePageUrl(token, loc);
  return emailDocument({
    loc,
    title,
    preheader: blocks[0]?.replace(/\s+/g, ' ').trim() ?? '',
    body: paragraphs,
    reason: `${FOOTER[loc]} ${kit.link(unsub, UNSUBSCRIBE[loc])}.`,
  });
}

export function testSubject(subject: string, loc: SiteLocale): string {
  return `${TEST_PREFIX[loc]} ${subject}`;
}

// --- Per-language version, with fallback ------------------------------------

export type CampaignContent = {
  subject: string;
  body: string;
  locale?: SiteLocale;
  variants?: { locale: SiteLocale; subject: string; body: string }[];
};

/**
 * Version of a campaign for a subscriber's language: the translation if it
 * exists, otherwise the reference version. The e-mail footer follows the language of
 * the SERVED version — French text under an Arabic footer would read badly.
 */
export function pickVariant(
  c: CampaignContent,
  want: SiteLocale | undefined,
): { subject: string; body: string; locale: SiteLocale } {
  const base = c.locale ?? 'fr';
  if (want && want !== base) {
    const v = c.variants?.find((x) => x.locale === want);
    if (v) return { subject: v.subject, body: v.body, locale: v.locale };
  }
  return { subject: c.subject, body: c.body, locale: base };
}
