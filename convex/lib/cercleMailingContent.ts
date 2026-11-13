import { escapeHtml } from './emailContent';
import { emailDocument, emailKit, siteOrigin } from './emailLayout';
import type { SiteLocale } from './locales';
import type { SenderIdentity } from './cercleMailing';

// E-MAILS OF THE CERCLE'S MAILING LIST, in the five languages — same discipline
// as lib/newsletterContent.ts (a `Record<SiteLocale, string>` per sentence).
// Every message ends with who writes (name and postal address of the
// association) and an unsubscribe link; a campaign also carries the
// `List-Unsubscribe` headers mail providers require of bulk senders.

type Phrase = Record<SiteLocale, string>;

const BRAND = 'Democracy Together';

export function cercleConfirmationUrl(token: string, loc: SiteLocale): string {
  return `${siteOrigin()}/${loc}/cercle/confirmation?token=${token}`;
}

export function cercleUnsubscribePageUrl(
  token: string,
  loc: SiteLocale,
): string {
  return `${siteOrigin()}/${loc}/cercle/desinscription?token=${token}`;
}

const SENDER_LINE: Phrase = {
  fr: 'Message envoyé par',
  en: 'Message sent by',
  es: 'Mensaje enviado por',
  pt: 'Mensagem enviada por',
  ar: 'أُرسلت هذه الرسالة من قِبل',
};

/** The sender's identity, escaped, as the footer line of every message. */
function senderFooter(loc: SiteLocale, sender: SenderIdentity): string {
  return `${SENDER_LINE[loc]} ${escapeHtml(sender.name)}, ${escapeHtml(sender.address)}.`;
}

// --- The one message sent to an imported contact -----------------------------------

const CONFIRM_SUBJECT: Phrase = {
  fr: 'Souhaitez-vous recevoir les nouvelles du Cercle des Amis ?',
  en: 'Would you like to receive the news of the Circle of Friends?',
  es: '¿Desea recibir las novedades del Círculo de Amigos?',
  pt: 'Deseja receber as novidades do Círculo de Amigos?',
  ar: 'هل تودّون تلقّي أخبار حلقة الأصدقاء؟',
};

const CONFIRM_INTRO: Phrase = {
  fr: 'Democracy Together réunit un Cercle des Amis : des personnes qui soutiennent le réseau et reçoivent ses nouvelles de temps en temps. Votre adresse figure dans nos contacts. Nous ne vous écrirons rien de plus tant que vous n’avez pas répondu à ce message.',
  en: 'Democracy Together is bringing together a Circle of Friends: people who support the network and receive its news from time to time. Your address is in our contacts. We will write nothing more to you until you have answered this message.',
  es: 'Democracy Together reúne un Círculo de Amigos: personas que apoyan la red y reciben sus novedades de vez en cuando. Su dirección figura en nuestros contactos. No le escribiremos nada más hasta que haya respondido a este mensaje.',
  pt: 'A Democracy Together reúne um Círculo de Amigos: pessoas que apoiam a rede e recebem as suas novidades de vez em quando. O seu endereço consta dos nossos contactos. Não lhe escreveremos mais nada enquanto não responder a esta mensagem.',
  ar: 'تجمع Democracy Together حلقة من الأصدقاء: أشخاص يدعمون الشبكة ويتلقّون أخبارها من حين لآخر. عنوانكم موجود في جهات الاتصال لدينا. لن نكتب إليكم شيئًا آخر إلى أن تردّوا على هذه الرسالة.',
};

const CONFIRM_ASK: Phrase = {
  fr: 'Si vous souhaitez recevoir ces nouvelles, confirmez en cliquant sur le bouton ci-dessous.',
  en: 'If you would like to receive this news, confirm by clicking the button below.',
  es: 'Si desea recibir estas novedades, confírmelo haciendo clic en el botón siguiente.',
  pt: 'Se deseja receber estas novidades, confirme clicando no botão abaixo.',
  ar: 'إذا كنتم تودّون تلقّي هذه الأخبار، فأكّدوا ذلك بالنقر على الزر أدناه.',
};

const CONFIRM_CTA: Phrase = {
  fr: 'Oui, je veux recevoir les nouvelles',
  en: 'Yes, I want to receive the news',
  es: 'Sí, quiero recibir las novedades',
  pt: 'Sim, quero receber as novidades',
  ar: 'نعم، أودّ تلقّي الأخبار',
};

const CONFIRM_NOTE: Phrase = {
  fr: 'Si vous ne faites rien, vous ne recevrez rien de plus et votre adresse sera supprimée de nos listes dans 30 jours.',
  en: 'If you do nothing, you will receive nothing more and your address will be removed from our lists within 30 days.',
  es: 'Si no hace nada, no recibirá nada más y su dirección se eliminará de nuestras listas en 30 días.',
  pt: 'Se não fizer nada, não receberá mais nada e o seu endereço será removido das nossas listas dentro de 30 dias.',
  ar: 'إذا لم تفعلوا شيئًا، فلن تتلقّوا أي شيء آخر وسيُحذف عنوانكم من قوائمنا خلال 30 يومًا.',
};

const REFUSE_LINE: Phrase = {
  fr: 'Vous ne souhaitez pas les recevoir ? Cliquez ici pour ne plus jamais être contacté :',
  en: 'Do not want them? Click here to never be contacted again:',
  es: '¿No desea recibirlas? Haga clic aquí para no volver a ser contactado:',
  pt: 'Não deseja recebê-las? Clique aqui para nunca mais ser contactado:',
  ar: 'لا ترغبون في تلقّيها؟ انقروا هنا كي لا يُتواصل معكم مجددًا:',
};

const UNSUBSCRIBE: Phrase = {
  fr: 'Se désinscrire',
  en: 'Unsubscribe',
  es: 'Darse de baja',
  pt: 'Cancelar a subscrição',
  ar: 'إلغاء الاشتراك',
};

export function cercleConfirmationEmail(args: {
  token: string;
  unsubToken: string;
  locale: SiteLocale;
  sender: SenderIdentity;
}): { subject: string; html: string; url: string } {
  const { locale: loc } = args;
  const url = cercleConfirmationUrl(args.token, loc);
  const unsub = cercleUnsubscribePageUrl(args.unsubToken, loc);
  const kit = emailKit(loc);
  const body =
    kit.paragraph(CONFIRM_INTRO[loc]) +
    kit.paragraph(CONFIRM_ASK[loc]) +
    kit.button(url, CONFIRM_CTA[loc]) +
    kit.fallback(url) +
    kit.note(CONFIRM_NOTE[loc]) +
    kit.note(`${REFUSE_LINE[loc]} ${kit.link(unsub, UNSUBSCRIBE[loc])}`);
  return {
    subject: `${CONFIRM_SUBJECT[loc]} · ${BRAND}`,
    html: emailDocument({
      loc,
      title: CONFIRM_SUBJECT[loc],
      preheader: CONFIRM_INTRO[loc],
      body,
      reason: senderFooter(loc, args.sender),
    }),
    url,
  };
}

// --- A campaign ---------------------------------------------------------------------------

const FOOTER: Phrase = {
  fr: 'Vous recevez cet e-mail car vous faites partie du Cercle des Amis de Democracy Together.',
  en: 'You are receiving this email because you are part of the Democracy Together Circle of Friends.',
  es: 'Recibe este correo porque forma parte del Círculo de Amigos de Democracy Together.',
  pt: 'Recebe este e-mail porque faz parte do Círculo de Amigos da Democracy Together.',
  ar: 'تتلقّون هذه الرسالة لأنكم من حلقة أصدقاء Democracy Together.',
};

/**
 * RFC 2369 / RFC 8058 headers: the "Unsubscribe" button of Gmail, Yahoo and
 * Apple Mail, which unsubscribes with no further step. The address is the
 * Convex HTTP entry point (`/cercle/unsubscribe`); without `CONVEX_SITE_URL`
 * (tests), the page link is announced without `List-Unsubscribe-Post`, as the
 * newsletter does.
 */
export function cercleListUnsubscribeHeaders(
  token: string,
  loc: SiteLocale,
): Record<string, string> {
  const convexSite = process.env.CONVEX_SITE_URL;
  const mailto = process.env.NEWSLETTER_UNSUBSCRIBE_MAILTO;
  const links: string[] = [];
  let oneClick = false;
  if (convexSite) {
    links.push(`<${convexSite}/cercle/unsubscribe?token=${token}&l=${loc}>`);
    oneClick = true;
  } else {
    links.push(`<${cercleUnsubscribePageUrl(token, loc)}>`);
  }
  if (mailto) links.push(`<mailto:${mailto}?subject=unsubscribe>`);
  const headers: Record<string, string> = {
    'List-Unsubscribe': links.join(', '),
  };
  if (oneClick) headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
  return headers;
}

/**
 * HTML of a Cercle message for one recipient. The footer says why they receive
 * it, gives the unsubscribe link, and names the sender with their postal
 * address.
 */
export function cercleCampaignHtml(args: {
  body: string;
  token: string;
  locale: SiteLocale;
  title: string;
  sender: SenderIdentity;
}): string {
  const { locale: loc } = args;
  const kit = emailKit(loc);
  const blocks = args.body.split(/\n{2,}/);
  const paragraphs = blocks
    .map((p) => kit.paragraph(escapeHtml(p).replace(/\n/g, '<br/>')))
    .join('');
  const unsub = cercleUnsubscribePageUrl(args.token, loc);
  return emailDocument({
    loc,
    title: args.title,
    preheader: blocks[0]?.replace(/\s+/g, ' ').trim() ?? '',
    body: paragraphs,
    reason: `${FOOTER[loc]} ${kit.link(unsub, UNSUBSCRIBE[loc])}.<br/>${senderFooter(loc, args.sender)}`,
  });
}
