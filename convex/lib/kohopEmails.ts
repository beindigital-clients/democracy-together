import type { SiteLocale } from './locales';
import { escapeHtml, type Phrase } from './emailContent';
import { emailDocument, emailKit } from './emailLayout';

// KOHOP — e-mails, in the five site languages. Each sentence is a
// `Record<SiteLocale, string>`: a language added without its labels no longer
// compiles (same discipline as `membershipEmails.ts`). Free text typed by
// someone (a title, a name) goes through `escapeHtml`, and the subject keeps it
// to one bounded line.

function base(siteUrl: string, loc: SiteLocale): string {
  return `${siteUrl.replace(/\/+$/, '')}/${loc}`;
}

const SUBJECT_TITLE_MAX = 70;
function subjectText(value: string): string {
  const line = value.replace(/[\r\n\t]+/g, ' ').trim();
  return line.length > SUBJECT_TITLE_MAX
    ? `${line.slice(0, SUBJECT_TITLE_MAX - 1).trimEnd()}…`
    : line;
}

const REASON_CHIEF: Phrase = {
  fr: 'Vous recevez cet e-mail car vous êtes chef de revue ou administrateur de Democracy Together.',
  en: 'You are receiving this e-mail because you are a review chief or an administrator of Democracy Together.',
  es: 'Recibe este correo porque es jefe de revisión o administrador de Democracy Together.',
  pt: 'Recebe este e-mail porque é chefe de revisão ou administrador da Democracy Together.',
  ar: 'يصلكم هذا البريد لأنكم رئيس مراجعة أو مدير في Democracy Together.',
};

// --- To the review chiefs: a new contribution ----------------------------------

const NEW_SUBJECT: Phrase = {
  fr: 'KOHOP : nouvelle contribution à examiner',
  en: 'KOHOP: a new contribution to examine',
  es: 'KOHOP: nueva contribución por examinar',
  pt: 'KOHOP: nova contribuição para examinar',
  ar: 'KOHOP: مساهمة جديدة للفحص',
};
const NEW_TITLE: Phrase = {
  fr: 'Une contribution vient d’être déposée',
  en: 'A contribution has just been submitted',
  es: 'Se acaba de presentar una contribución',
  pt: 'Acaba de ser submetida uma contribuição',
  ar: 'تم للتو إيداع مساهمة',
};
const NEW_LEAD: Phrase = {
  fr: 'Une contribution attend votre examen : recevabilité, vérification des relecteurs désignés, puis lancement de la relecture.',
  en: 'A contribution is waiting for your examination: admissibility, approval of the designated reviewers, then the start of the review.',
  es: 'Una contribución espera su examen: admisibilidad, validación de los revisores designados y, después, inicio de la revisión.',
  pt: 'Uma contribuição aguarda o seu exame: admissibilidade, validação dos revisores designados e, depois, início da revisão.',
  ar: 'مساهمة بانتظار فحصكم: القبول الشكلي، ثم التحقق من المراجعين المعيّنين، ثم بدء المراجعة.',
};
const LABEL_TITLE: Phrase = {
  fr: 'Titre',
  en: 'Title',
  es: 'Título',
  pt: 'Título',
  ar: 'العنوان',
};
const LABEL_AUTHOR: Phrase = {
  fr: 'Auteur·rice',
  en: 'Author',
  es: 'Autor/a',
  pt: 'Autor/a',
  ar: 'المؤلف',
};
const LABEL_WORDS: Phrase = {
  fr: 'Longueur',
  en: 'Length',
  es: 'Extensión',
  pt: 'Extensão',
  ar: 'الطول',
};
const WORDS: Phrase = {
  fr: 'mots',
  en: 'words',
  es: 'palabras',
  pt: 'palavras',
  ar: 'كلمة',
};
const CTA_OPEN: Phrase = {
  fr: 'Ouvrir le dossier',
  en: 'Open the file',
  es: 'Abrir el expediente',
  pt: 'Abrir o dossiê',
  ar: 'فتح الملف',
};

export function chiefNewSubmissionEmail(args: {
  siteUrl: string;
  locale: SiteLocale;
  contributionId: string;
  title: string;
  authorName: string;
  words: number;
}): { subject: string; html: string } {
  const loc = args.locale;
  const url = `${base(args.siteUrl, loc)}/admin/kohop/${encodeURIComponent(args.contributionId)}`;
  const kit = emailKit(loc);
  const body =
    kit.paragraph(NEW_LEAD[loc]) +
    kit.details([
      { label: LABEL_TITLE[loc], value: escapeHtml(args.title) },
      { label: LABEL_AUTHOR[loc], value: escapeHtml(args.authorName) },
      {
        label: LABEL_WORDS[loc],
        value: `<span dir="ltr">${String(args.words)}</span> ${WORDS[loc]}`,
      },
    ]) +
    kit.button(url, CTA_OPEN[loc]) +
    kit.fallback(url);
  return {
    subject: `${NEW_SUBJECT[loc]} · ${subjectText(args.title)}`,
    html: emailDocument({
      loc,
      title: NEW_TITLE[loc],
      preheader: NEW_LEAD[loc],
      body,
      reason: REASON_CHIEF[loc],
    }),
  };
}
