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

// --- To a reviewer: invitation and reminder -------------------------------------

const REASON_REVIEWER: Phrase = {
  fr: 'Vous recevez cet e-mail car un·e auteur·rice vous a proposé·e comme relecteur·rice sur Democracy Together, et le chef de revue a validé cette proposition.',
  en: 'You are receiving this e-mail because an author proposed you as a reviewer on Democracy Together, and the review chief approved the proposal.',
  es: 'Recibe este correo porque un/a autor/a le propuso como revisor/a en Democracy Together y el jefe de revisión validó la propuesta.',
  pt: 'Recebe este e-mail porque um/a autor/a o/a propôs como revisor/a na Democracy Together e o chefe de revisão validou a proposta.',
  ar: 'يصلكم هذا البريد لأن مؤلفاً اقترحكم مراجعاً في Democracy Together ووافق رئيس المراجعة على الاقتراح.',
};
const INVITE_SUBJECT: Phrase = {
  fr: 'KOHOP : vous êtes invité·e à relire une contribution',
  en: 'KOHOP: you are invited to review a contribution',
  es: 'KOHOP: se le invita a revisar una contribución',
  pt: 'KOHOP: é convidado/a a rever uma contribuição',
  ar: 'KOHOP: دعوة لمراجعة مساهمة',
};
const INVITE_TITLE: Phrase = {
  fr: 'Une contribution attend votre relecture',
  en: 'A contribution is waiting for your review',
  es: 'Una contribución espera su revisión',
  pt: 'Uma contribuição aguarda a sua revisão',
  ar: 'مساهمة بانتظار مراجعتكم',
};
const INVITE_LEAD: Phrase = {
  fr: 'Vous pouvez accepter ou décliner depuis votre espace. Si vous acceptez, vous aurez 14 jours pour rédiger une analyse publique signée de votre nom.',
  en: 'You can accept or decline from your member area. If you accept, you will have 14 days to write a public analysis signed with your name.',
  es: 'Puede aceptar o rechazar desde su espacio. Si acepta, tendrá 14 días para redactar un análisis público firmado con su nombre.',
  pt: 'Pode aceitar ou recusar a partir do seu espaço. Se aceitar, terá 14 dias para redigir uma análise pública assinada com o seu nome.',
  ar: 'يمكنكم القبول أو الاعتذار من فضائكم. عند القبول تملكون 14 يوماً لكتابة تحليل علني يحمل اسمكم.',
};
const REMIND_SUBJECT: Phrase = {
  fr: 'KOHOP : rappel — une relecture vous attend',
  en: 'KOHOP: reminder — a review is waiting for you',
  es: 'KOHOP: recordatorio — una revisión le espera',
  pt: 'KOHOP: lembrete — uma revisão aguarda por si',
  ar: 'KOHOP: تذكير — مراجعة بانتظاركم',
};
const REMIND_TITLE: Phrase = {
  fr: 'Une échéance approche',
  en: 'A deadline is approaching',
  es: 'Se acerca un plazo',
  pt: 'Aproxima-se um prazo',
  ar: 'يقترب موعد نهائي',
};
const REMIND_LEAD: Phrase = {
  fr: 'Sans réponse ou sans analyse à cette date, un·e remplaçant·e sera sollicité·e : votre refus tardif ne pénalise personne, mais mieux vaut nous prévenir.',
  en: 'Without a reply or an analysis by this date, a substitute will be asked: declining late penalizes nobody, but please let us know.',
  es: 'Sin respuesta ni análisis en esa fecha se solicitará a un suplente: rechazar tarde no penaliza a nadie, pero avísenos.',
  pt: 'Sem resposta ou análise nessa data será solicitado um suplente: recusar tarde não penaliza ninguém, mas avise-nos.',
  ar: 'من دون رد أو تحليل في هذا التاريخ سيُطلب من بديل: الاعتذار المتأخر لا يعاقب أحداً، لكن يُرجى إبلاغنا.',
};
const LABEL_DEADLINE: Phrase = {
  fr: 'Échéance',
  en: 'Deadline',
  es: 'Plazo',
  pt: 'Prazo',
  ar: 'الموعد النهائي',
};
const CTA_REVIEW: Phrase = {
  fr: 'Ouvrir mon invitation',
  en: 'Open my invitation',
  es: 'Abrir mi invitación',
  pt: 'Abrir o meu convite',
  ar: 'فتح الدعوة',
};

export function reviewerEmail(args: {
  siteUrl: string;
  locale: SiteLocale;
  reviewerId: string;
  title: string;
  dueLabel: string;
  kind: 'invitation' | 'reminder';
}): { subject: string; html: string } {
  const loc = args.locale;
  const invitation = args.kind === 'invitation';
  const url = `${base(args.siteUrl, loc)}/espace-membre/relectures/${encodeURIComponent(args.reviewerId)}`;
  const kit = emailKit(loc);
  const lead = invitation ? INVITE_LEAD[loc] : REMIND_LEAD[loc];
  const body =
    kit.paragraph(lead) +
    kit.details([
      { label: LABEL_TITLE[loc], value: escapeHtml(args.title) },
      { label: LABEL_DEADLINE[loc], value: escapeHtml(args.dueLabel) },
    ]) +
    kit.button(url, CTA_REVIEW[loc]) +
    kit.fallback(url);
  return {
    subject: `${(invitation ? INVITE_SUBJECT : REMIND_SUBJECT)[loc]} · ${subjectText(args.title)}`,
    html: emailDocument({
      loc,
      title: (invitation ? INVITE_TITLE : REMIND_TITLE)[loc],
      preheader: lead,
      body,
      reason: REASON_REVIEWER[loc],
    }),
  };
}
