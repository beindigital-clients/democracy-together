import { type SiteLocale, isRtlLocale } from './locales';

// THE LOOK OF EVERY E-MAIL THE PLATFORM SENDS: one layout, one set of parts.
//
// E-mail HTML is not web HTML. What renders alike in Gmail, Apple Mail and
// Outlook for Windows (Word's engine) is an old subset: nested tables for the
// layout, every style inline, widths as attributes, no flex, no grid, no web
// font to count on. The <style> block only ADDS — dark mode, narrow screens —
// where the client supports it; the e-mail must read well without it.
//
// The brand is the site's (src/app/globals.css): paper, navy, orange, and its
// type as far as mail allows — Newsreader and IBM Plex are named first for the
// few clients that have them, Georgia and the system sans do the work
// everywhere else. The masthead is navy in BOTH themes: the logo (the version
// drawn for dark backgrounds) never needs swapping, and the clients that
// darken e-mails on their own (Gmail's apps) leave a dark band alone.

export type Phrase = Record<SiteLocale, string>;

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Public origin of the site, for the logo and the footer links. */
export function siteOrigin(): string {
  return (
    process.env.SITE_URL ?? 'https://democracy-together.vercel.app'
  ).replace(/\/+$/, '');
}

const COLOR = {
  paper: '#f4f2ec',
  card: '#ffffff',
  panel: '#f8f6f0',
  line: '#e4e0d5',
  ink: '#16191f',
  inkSoft: '#454953',
  muted: '#646771',
  navy: '#1f3d6e',
  navyDeep: '#16305a',
  orange: '#f58b1a',
  cream: '#f4f2ec',
} as const;

const LATIN = {
  display: "Newsreader, Georgia, 'Times New Roman', serif",
  body: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};
const ARABIC = {
  display: "'Noto Naskh Arabic', 'Times New Roman', serif",
  body: "'IBM Plex Sans Arabic', 'Noto Sans Arabic', Tahoma, Arial, sans-serif",
};
const MONO =
  "'IBM Plex Mono', ui-monospace, 'SF Mono', Menlo, Consolas, 'Liberation Mono', monospace";

// 2x image for sharp screens, drawn at half size. Served by the site
// (public/brand/email/), hence the absolute URL.
const LOGO = {
  path: '/brand/email/logo-on-navy@2x.png',
  width: 188,
  height: 52,
};

// Footer copy: the site's own (src/messages/*.json, `footer`), repeated here
// because Convex cannot import the site's catalog (see emailContent.ts).
const TAGLINE: Phrase = {
  fr: 'Réseau international de think tanks pour la démocratie · Afrique–Europe',
  en: 'International think-tank network for democracy · Africa–Europe',
  es: 'Red internacional de centros de estudios por la democracia · África–Europa',
  pt: 'Rede internacional de centros de estudos pela democracia · África–Europa',
  ar: 'شبكة دولية من مراكز الدراسات من أجل الديمقراطية · أفريقيا–أوروبا',
};

const CONTACT: Phrase = {
  fr: 'Contact',
  en: 'Contact',
  es: 'Contacto',
  pt: 'Contacto',
  ar: 'اتصلوا بنا',
};

const PRIVACY: Phrase = {
  fr: 'Confidentialité',
  en: 'Privacy',
  es: 'Privacidad',
  pt: 'Privacidade',
  ar: 'الخصوصية',
};

// Without the brand, which the footer writes itself, left to right: in an
// Arabic line, "© 2026 Democracy Together" would otherwise come out reordered.
const RIGHTS: Phrase = {
  fr: 'Tous droits réservés.',
  en: 'All rights reserved.',
  es: 'Todos los derechos reservados.',
  pt: 'Todos os direitos reservados.',
  ar: 'جميع الحقوق محفوظة.',
};

const SIGNOFF: Phrase = {
  fr: 'L’équipe Democracy Together',
  en: 'The Democracy Together team',
  es: 'El equipo de Democracy Together',
  pt: 'A equipa da Democracy Together',
  ar: 'فريق Democracy Together',
};

const LINK_FALLBACK: Phrase = {
  fr: 'Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :',
  en: 'If the button does not work, copy this link into your browser:',
  es: 'Si el botón no funciona, copie este enlace en su navegador:',
  pt: 'Se o botão não funcionar, copie esta ligação para o seu navegador:',
  ar: 'إذا لم يعمل الزر، انسخوا هذا الرابط في متصفحكم:',
};

// Dark mode and narrow screens, for the clients that read a <style> block.
// `[data-ogsc]`/`[data-ogsb]` are Outlook.com's own dark-mode hooks.
const CSS = `
:root{color-scheme:light dark;supported-color-schemes:light dark;}
body{margin:0;padding:0;width:100%!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
table,td{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;}
img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}
a[x-apple-data-detectors]{color:inherit!important;text-decoration:none!important;}
@media only screen and (max-width:620px){
.dt-container{width:100%!important;}
.dt-pad{padding-left:24px!important;padding-right:24px!important;}
.dt-card{padding-top:32px!important;padding-bottom:26px!important;}
.dt-h1{font-size:26px!important;line-height:32px!important;}
.dt-code{font-size:30px!important;letter-spacing:7px!important;padding-left:7px!important;}
}
@media (prefers-color-scheme:dark){
.dt-bg{background-color:#14171c!important;}
.dt-card{background-color:#1c2027!important;}
.dt-panel{background-color:#23272f!important;border-color:#2b313a!important;}
.dt-rule{border-color:#2b313a!important;}
.dt-h1,.dt-strong{color:#eceae3!important;}
.dt-text{color:#d2d0c9!important;}
.dt-muted{color:#8b8e96!important;}
.dt-link,.dt-code{color:#f5a54a!important;}
.dt-btn{background-color:#f58b1a!important;}
.dt-btn a{color:#16191f!important;}
}
[data-ogsc] .dt-h1,[data-ogsc] .dt-strong{color:#eceae3!important;}
[data-ogsc] .dt-text{color:#d2d0c9!important;}
[data-ogsc] .dt-muted{color:#8b8e96!important;}
[data-ogsc] .dt-link,[data-ogsc] .dt-code{color:#f5a54a!important;}
[data-ogsb] .dt-bg{background-color:#14171c!important;}
[data-ogsb] .dt-card{background-color:#1c2027!important;}
[data-ogsb] .dt-panel{background-color:#23272f!important;}
[data-ogsb] .dt-btn{background-color:#f58b1a!important;}
`;

/**
 * The parts an e-mail body is made of, in the recipient's script: fonts,
 * direction and alignment follow the locale. `html` arguments are trusted
 * markup (the templates' own phrases, values already escaped); URLs and codes
 * are escaped here.
 *
 * `text-align` is set on EVERY block, not only on the card: many clients
 * (Outlook first) do not align text from `dir` alone — an Arabic e-mail would
 * otherwise come out ragged-left, final punctuation on the wrong side.
 */
export function emailKit(loc: SiteLocale) {
  const rtl = isRtlLocale(loc);
  const font = rtl ? ARABIC : LATIN;
  const align = rtl ? 'right' : 'left';

  const paragraph = (html: string) =>
    `<p class="dt-text" style="margin:0 0 18px;font-family:${font.body};font-size:16px;line-height:26px;color:${COLOR.inkSoft};text-align:${align};">${html}</p>`;

  const note = (html: string) =>
    `<p class="dt-muted" style="margin:0 0 14px;font-family:${font.body};font-size:13px;line-height:20px;color:${COLOR.muted};text-align:${align};">${html}</p>`;

  const link = (href: string, label: string) =>
    `<a class="dt-link" href="${escapeHtml(href)}" target="_blank" style="color:${COLOR.navy};text-decoration:underline;">${label}</a>`;

  // A table cell carries the colour, so Outlook for Windows (which ignores
  // padding on links) still draws a full button.
  const button = (href: string, label: string) =>
    `<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:10px 0 26px;"><tr><td class="dt-btn" bgcolor="${COLOR.navy}" style="background-color:${COLOR.navy};border-radius:8px;"><a href="${escapeHtml(href)}" target="_blank" style="display:inline-block;padding:14px 28px;font-family:${font.body};font-size:16px;line-height:20px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px;">${label}</a></td></tr></table>`;

  // A one-time code: large, spaced, and read left to right even in Arabic —
  // spaced digits are fragile under the bidirectional algorithm if they
  // inherit the paragraph's direction. The left padding balances the
  // letter-spacing after the last digit; `separate` lets the corners round.
  const code = (value: string) =>
    `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin:6px 0 24px;border-collapse:separate;"><tr><td class="dt-panel" align="center" bgcolor="${COLOR.panel}" style="background-color:${COLOR.panel};border:1px solid ${COLOR.line};border-radius:10px;padding:22px 12px;"><span class="dt-code" dir="ltr" style="display:inline-block;font-family:${MONO};font-size:36px;line-height:44px;font-weight:600;letter-spacing:10px;padding-left:10px;color:${COLOR.navyDeep};">${escapeHtml(value)}</span></td></tr></table>`;

  // Label/value summary (amount, receipt, date). No capitals or letter
  // spacing in Arabic: spacing breaks the joined letters.
  const details = (rows: { label: string; value: string }[]) => {
    const labelCase = rtl
      ? ''
      : 'letter-spacing:0.06em;text-transform:uppercase;';
    const cells = rows
      .map(
        (row, i) =>
          `<tr><td class="dt-rule" style="padding:14px 20px;${i < rows.length - 1 ? `border-bottom:1px solid ${COLOR.line};` : ''}text-align:${align};"><p class="dt-muted" style="margin:0 0 3px;font-family:${font.body};font-size:12px;line-height:16px;${labelCase}color:${COLOR.muted};text-align:${align};">${row.label}</p><p class="dt-strong" style="margin:0;font-family:${font.body};font-size:17px;line-height:24px;font-weight:600;color:${COLOR.ink};text-align:${align};">${row.value}</p></td></tr>`,
      )
      .join('');
    return `<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" class="dt-panel" bgcolor="${COLOR.panel}" style="margin:6px 0 24px;background-color:${COLOR.panel};border:1px solid ${COLOR.line};border-radius:10px;border-collapse:separate;">${cells}</table>`;
  };

  // The button's address in full, for the clients and filters that break it.
  const fallback = (url: string) =>
    `<p class="dt-muted" style="margin:0 0 20px;font-family:${font.body};font-size:13px;line-height:20px;color:${COLOR.muted};text-align:${align};">${LINK_FALLBACK[loc]}<br/><a class="dt-link" href="${escapeHtml(url)}" target="_blank" dir="ltr" style="color:${COLOR.navy};text-decoration:underline;word-break:break-all;">${escapeHtml(url)}</a></p>`;

  // Sign-off of the e-mails written as a letter (they open on "Hello,").
  const signature = () =>
    `<p class="dt-strong" style="margin:4px 0 22px;font-family:${font.display};font-size:17px;line-height:24px;color:${COLOR.ink};text-align:${align};">${SIGNOFF[loc]}</p>`;

  return { paragraph, note, link, button, code, details, fallback, signature };
}

/**
 * A complete e-mail: masthead with the logo, the card, the footer.
 *
 * `title` and `preheader` are plain text (escaped here): the title is the
 * card's heading, the preheader the line inboxes show after the subject.
 * `reason` is trusted markup: why this person receives this e-mail.
 */
export function emailDocument(args: {
  loc: SiteLocale;
  title: string;
  preheader: string;
  body: string;
  reason?: string;
}): string {
  const { loc } = args;
  const rtl = isRtlLocale(loc);
  const dir = rtl ? 'rtl' : 'ltr';
  const align = rtl ? 'right' : 'left';
  const font = rtl ? ARABIC : LATIN;
  const origin = siteOrigin();
  const home = `${origin}/${loc}`;
  const host = origin.replace(/^https?:\/\//, '');
  const title = escapeHtml(args.title);
  const footerLink = (href: string, label: string) =>
    `<a class="dt-muted" href="${escapeHtml(href)}" target="_blank" style="color:${COLOR.muted};text-decoration:underline;">${label}</a>`;
  const reason = args.reason
    ? `<p class="dt-muted" style="margin:0 0 18px;font-family:${font.body};font-size:12px;line-height:18px;color:${COLOR.muted};text-align:center;">${args.reason}</p>`
    : '';

  return `<!DOCTYPE html>
<html lang="${loc}" dir="${dir}" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no, url=no">
<meta name="color-scheme" content="light dark">
<meta name="supported-color-schemes" content="light dark">
<title>${title}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<style>${CSS}</style>
</head>
<body class="dt-bg" style="margin:0;padding:0;background-color:${COLOR.paper};">
<div role="article" aria-roledescription="email" aria-label="${title}" lang="${loc}" dir="${dir}" class="dt-bg" style="background-color:${COLOR.paper};">
<div class="dt-preheader" style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">${escapeHtml(args.preheader)}</div>
<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" class="dt-bg" bgcolor="${COLOR.paper}" style="background-color:${COLOR.paper};">
<tr><td align="center" style="padding:36px 12px 32px;">
<!--[if mso]><table role="presentation" width="600" align="center" border="0" cellpadding="0" cellspacing="0"><tr><td><![endif]-->
<table role="presentation" class="dt-container" width="600" border="0" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;">
<tr><td class="dt-pad" align="center" bgcolor="${COLOR.navyDeep}" style="background-color:${COLOR.navyDeep};padding:30px 48px 28px;border-radius:14px 14px 0 0;">
<a href="${escapeHtml(home)}" target="_blank" style="text-decoration:none;"><img src="${escapeHtml(origin + LOGO.path)}" width="${LOGO.width}" height="${LOGO.height}" alt="Democracy Together" style="display:block;width:${LOGO.width}px;max-width:${LOGO.width}px;height:auto;border:0;outline:none;color:${COLOR.cream};font-family:${LATIN.display};font-size:22px;line-height:28px;"></a>
</td></tr>
<tr><td height="4" bgcolor="${COLOR.orange}" style="background-color:${COLOR.orange};height:4px;font-size:0;line-height:0;">&nbsp;</td></tr>
<tr><td class="dt-card dt-pad" dir="${dir}" bgcolor="${COLOR.card}" style="background-color:${COLOR.card};padding:44px 48px 34px;border-radius:0 0 14px 14px;text-align:${align};">
<h1 class="dt-h1" style="margin:0 0 22px;font-family:${font.display};font-size:30px;line-height:37px;font-weight:500;color:${COLOR.ink};text-align:${align};">${title}</h1>
${args.body}
</td></tr>
<tr><td class="dt-pad" dir="${dir}" align="center" style="padding:28px 48px 0;text-align:center;">
${reason}<p class="dt-text" style="margin:0 0 10px;font-family:${font.display};font-size:14px;line-height:20px;color:${COLOR.inkSoft};text-align:center;">${TAGLINE[loc]}</p>
<p class="dt-muted" style="margin:0 0 6px;font-family:${font.body};font-size:12px;line-height:18px;color:${COLOR.muted};text-align:center;">${footerLink(home, host)} &nbsp;·&nbsp; ${footerLink(`${home}/contact`, CONTACT[loc])} &nbsp;·&nbsp; ${footerLink(`${home}/confidentialite`, PRIVACY[loc])}</p>
<p class="dt-muted" style="margin:0;font-family:${font.body};font-size:12px;line-height:18px;color:${COLOR.muted};text-align:center;"><span dir="ltr">© ${new Date().getFullYear()} Democracy Together.</span> ${RIGHTS[loc]}</p>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</div>
</body>
</html>`;
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) => {
    if (name[0] === '#') {
      const cp =
        name[1] === 'x' || name[1] === 'X'
          ? parseInt(name.slice(2), 16)
          : parseInt(name.slice(1), 10);
      return Number.isFinite(cp) ? String.fromCodePoint(cp) : whole;
    }
    return ENTITIES[name.toLowerCase()] ?? whole;
  });
}

// Tag and comment removal repeat until nothing is left to remove: a single
// pass can leave behind what it removed (`<scr<b>ipt>` loses `<b>` and
// becomes `<script>`). This is the form CodeQL recommends for
// multi-character removals.

/** Text of a markup fragment, every tag removed. */
export function stripTags(html: string): string {
  let text = html;
  let previous: string;
  do {
    previous = text;
    text = text.replace(/<[^>]*>/g, '');
  } while (text !== previous);
  return text;
}

function stripComments(html: string): string {
  let text = html;
  let previous: string;
  do {
    previous = text;
    text = text.replace(/<!--[\s\S]*?-->/g, '');
  } while (text !== previous);
  return text;
}

/**
 * Plain-text version of an e-mail, sent next to the HTML: some readers and
 * filters only look at that part, and a message without it looks more like
 * spam. Links become "label (address)"; the logo link becomes its alt text.
 */
export function htmlToText(html: string): string {
  const linked = stripComments(html.replace(/<head[\s\S]*?<\/head>/gi, ''))
    .replace(/<div class="dt-preheader"[\s\S]*?<\/div>/gi, '')
    .replace(
      /<a\b[^>]*\bhref="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
      (_whole, href: string, inner: string) => {
        const alt = /<img\b[^>]*\balt="([^"]*)"/i.exec(inner);
        const label = (alt ? alt[1] : stripTags(inner)).trim();
        if (!label) return href;
        return decodeEntities(label) === decodeEntities(href)
          ? href
          : `${label} (${href})`;
      },
    )
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h1|h2|h3|li|tr|table)>/gi, '\n\n');
  return decodeEntities(stripTags(linked))
    .split('\n')
    .map((line) => line.replace(/[ \t\u00a0]+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
