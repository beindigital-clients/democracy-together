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

// --- To the author: the milestones of the file ---------------------------------

export const KOHOP_AUTHOR_EMAIL_KINDS = [
  'reviewsReady',
  'revisionReminder',
  'revisionExpired',
  'accepted',
  'refused',
] as const;
export type KohopAuthorEmailKind = (typeof KOHOP_AUTHOR_EMAIL_KINDS)[number];

const REASON_AUTHOR: Phrase = {
  fr: 'Vous recevez cet e-mail car vous avez déposé une contribution sur KOHOP, Democracy Together.',
  en: 'You are receiving this e-mail because you submitted a contribution to KOHOP, Democracy Together.',
  es: 'Recibe este correo porque presentó una contribución en KOHOP, Democracy Together.',
  pt: 'Recebe este e-mail porque submeteu uma contribuição no KOHOP, Democracy Together.',
  ar: 'يصلكم هذا البريد لأنكم أودعتم مساهمة في KOHOP، Democracy Together.',
};
const CTA_FILE: Phrase = {
  fr: 'Ouvrir ma contribution',
  en: 'Open my contribution',
  es: 'Abrir mi contribución',
  pt: 'Abrir a minha contribuição',
  ar: 'فتح مساهمتي',
};

const AUTHOR_COPY: Record<
  KohopAuthorEmailKind,
  { subject: Phrase; title: Phrase; lead: Phrase }
> = {
  reviewsReady: {
    subject: {
      fr: 'KOHOP : les analyses de vos relecteurs sont arrivées',
      en: 'KOHOP: your reviewers’ analyses have arrived',
      es: 'KOHOP: han llegado los análisis de sus revisores',
      pt: 'KOHOP: chegaram as análises dos seus revisores',
      ar: 'KOHOP: وصلت تحليلات مراجعيكم',
    },
    title: {
      fr: 'Les deux analyses sont rendues',
      en: 'Both analyses are in',
      es: 'Los dos análisis están entregados',
      pt: 'As duas análises foram entregues',
      ar: 'اكتمل التحليلان',
    },
    lead: {
      fr: 'Lisez-les, révisez votre texte si vous le souhaitez et répondez aux relecteurs. Vous avez 14 jours ; une prolongation de 7 jours peut être demandée une fois.',
      en: 'Read them, revise your text if you wish and reply to the reviewers. You have 14 days; one 7-day extension can be requested.',
      es: 'Léalos, revise su texto si lo desea y responda a los revisores. Tiene 14 días; puede pedir una prórroga de 7 días una vez.',
      pt: 'Leia-as, reveja o texto se quiser e responda aos revisores. Tem 14 dias; pode pedir uma prorrogação de 7 dias uma vez.',
      ar: 'اقرأوهما ونقّحوا نصكم إن رغبتم وردّوا على المراجعين. لديكم 14 يوماً ويمكن طلب تمديد 7 أيام مرة واحدة.',
    },
  },
  revisionReminder: {
    subject: {
      fr: 'KOHOP : rappel — votre révision est attendue',
      en: 'KOHOP: reminder — your revision is due',
      es: 'KOHOP: recordatorio — se espera su revisión',
      pt: 'KOHOP: lembrete — a sua revisão é aguardada',
      ar: 'KOHOP: تذكير — ننتظر تنقيحكم',
    },
    title: {
      fr: 'L’échéance de révision approche',
      en: 'The revision deadline is approaching',
      es: 'Se acerca el plazo de revisión',
      pt: 'Aproxima-se o prazo de revisão',
      ar: 'يقترب موعد التنقيح',
    },
    lead: {
      fr: 'Sans réponse à cette date, le chef de revue décidera à partir de la version relue et des analyses.',
      en: 'Without an answer by this date, the review chief will decide from the reviewed version and the analyses.',
      es: 'Sin respuesta en esa fecha, el jefe de revisión decidirá a partir de la versión revisada y los análisis.',
      pt: 'Sem resposta nessa data, o chefe de revisão decidirá a partir da versão revista e das análises.',
      ar: 'من دون رد في هذا التاريخ سيقرر رئيس المراجعة بناءً على النسخة المراجعة والتحليلات.',
    },
  },
  revisionExpired: {
    subject: {
      fr: 'KOHOP : le délai de révision est écoulé',
      en: 'KOHOP: the revision deadline has passed',
      es: 'KOHOP: ha vencido el plazo de revisión',
      pt: 'KOHOP: o prazo de revisão terminou',
      ar: 'KOHOP: انتهت مهلة التنقيح',
    },
    title: {
      fr: 'Votre dossier passe à la décision',
      en: 'Your file moves to the decision',
      es: 'Su expediente pasa a decisión',
      pt: 'O seu dossiê passa à decisão',
      ar: 'ملفكم ينتقل إلى القرار',
    },
    lead: {
      fr: 'Le délai est écoulé : le chef de revue décide à partir de la version relue et des analyses.',
      en: 'The deadline has passed: the review chief decides from the reviewed version and the analyses.',
      es: 'Venció el plazo: el jefe de revisión decide a partir de la versión revisada y los análisis.',
      pt: 'O prazo terminou: o chefe de revisão decide a partir da versão revista e das análises.',
      ar: 'انتهت المهلة: يقرر رئيس المراجعة بناءً على النسخة المراجعة والتحليلات.',
    },
  },
  accepted: {
    subject: {
      fr: 'KOHOP : votre contribution est acceptée',
      en: 'KOHOP: your contribution is accepted',
      es: 'KOHOP: su contribución ha sido aceptada',
      pt: 'KOHOP: a sua contribuição foi aceite',
      ar: 'KOHOP: قُبلت مساهمتكم',
    },
    title: {
      fr: 'Votre contribution est acceptée',
      en: 'Your contribution is accepted',
      es: 'Su contribución está aceptada',
      pt: 'A sua contribuição foi aceite',
      ar: 'قُبلت مساهمتكم',
    },
    lead: {
      fr: 'Elle passe en préparation. La publication reste une décision du chef de revue : nous vous préviendrons de chaque étape.',
      en: 'It moves to production. Publication remains a decision of the review chief: we will tell you of each step.',
      es: 'Pasa a preparación. La publicación sigue siendo decisión del jefe de revisión: le avisaremos de cada paso.',
      pt: 'Passa à preparação. A publicação continua a ser decisão do chefe de revisão: avisaremos de cada passo.',
      ar: 'تنتقل إلى الإعداد. يبقى النشر قراراً لرئيس المراجعة وسنُعلمكم بكل خطوة.',
    },
  },
  refused: {
    subject: {
      fr: 'KOHOP : décision sur votre contribution',
      en: 'KOHOP: decision on your contribution',
      es: 'KOHOP: decisión sobre su contribución',
      pt: 'KOHOP: decisão sobre a sua contribuição',
      ar: 'KOHOP: قرار بشأن مساهمتكم',
    },
    title: {
      fr: 'Votre contribution n’est pas retenue',
      en: 'Your contribution is not retained',
      es: 'Su contribución no ha sido aceptada',
      pt: 'A sua contribuição não foi retida',
      ar: 'لم تُقبل مساهمتكم',
    },
    lead: {
      fr: 'Le chef de revue a rendu sa décision ; le motif est visible dans votre espace.',
      en: 'The review chief has made a decision; the reason is visible in your member area.',
      es: 'El jefe de revisión ha tomado su decisión; el motivo es visible en su espacio.',
      pt: 'O chefe de revisão tomou a sua decisão; o motivo é visível no seu espaço.',
      ar: 'اتخذ رئيس المراجعة قراره، والسبب ظاهر في فضائكم.',
    },
  },
};

export function authorEmail(args: {
  siteUrl: string;
  locale: SiteLocale;
  contributionId: string;
  title: string;
  dueLabel?: string;
  kind: KohopAuthorEmailKind;
}): { subject: string; html: string } {
  const loc = args.locale;
  const copy = AUTHOR_COPY[args.kind];
  const url = `${base(args.siteUrl, loc)}/espace-membre/kohop/${encodeURIComponent(args.contributionId)}`;
  const kit = emailKit(loc);
  const rows = [{ label: LABEL_TITLE[loc], value: escapeHtml(args.title) }];
  if (args.dueLabel) {
    rows.push({ label: LABEL_DEADLINE[loc], value: escapeHtml(args.dueLabel) });
  }
  const body =
    kit.paragraph(copy.lead[loc]) +
    kit.details(rows) +
    kit.button(url, CTA_FILE[loc]) +
    kit.fallback(url);
  return {
    subject: `${copy.subject[loc]} · ${subjectText(args.title)}`,
    html: emailDocument({
      loc,
      title: copy.title[loc],
      preheader: copy.lead[loc],
      body,
      reason: REASON_AUTHOR[loc],
    }),
  };
}

// --- Production and publication ---------------------------------------------------

export const KOHOP_PRODUCTION_EMAIL_KINDS = [
  'proofToApprove',
  'published',
  'publishedReviewer',
  'retracted',
] as const;
export type KohopProductionEmailKind =
  (typeof KOHOP_PRODUCTION_EMAIL_KINDS)[number];

const REASON_REVIEWER_PUBLISHED: Phrase = {
  fr: 'Vous recevez cet e-mail car vous avez signé une analyse publiée sur KOHOP, Democracy Together.',
  en: 'You are receiving this e-mail because you signed an analysis published on KOHOP, Democracy Together.',
  es: 'Recibe este correo porque firmó un análisis publicado en KOHOP, Democracy Together.',
  pt: 'Recebe este e-mail porque assinou uma análise publicada no KOHOP, Democracy Together.',
  ar: 'يصلكم هذا البريد لأنكم وقّعتم تحليلاً منشوراً في KOHOP، Democracy Together.',
};
const CTA_PAGE: Phrase = {
  fr: 'Voir la page publiée',
  en: 'See the published page',
  es: 'Ver la página publicada',
  pt: 'Ver a página publicada',
  ar: 'عرض الصفحة المنشورة',
};
const CTA_PROOF: Phrase = {
  fr: 'Relire l’épreuve',
  en: 'Read the proof',
  es: 'Leer la prueba',
  pt: 'Ler a prova',
  ar: 'قراءة البروفة',
};

const PRODUCTION_COPY: Record<
  KohopProductionEmailKind,
  { subject: Phrase; title: Phrase; lead: Phrase }
> = {
  proofToApprove: {
    subject: {
      fr: 'KOHOP : l’épreuve de votre contribution vous attend',
      en: 'KOHOP: the proof of your contribution is waiting',
      es: 'KOHOP: la prueba de su contribución le espera',
      pt: 'KOHOP: a prova da sua contribuição aguarda por si',
      ar: 'KOHOP: بروفة مساهمتكم بانتظاركم',
    },
    title: {
      fr: 'Votre épreuve est prête',
      en: 'Your proof is ready',
      es: 'Su prueba está lista',
      pt: 'A sua prova está pronta',
      ar: 'بروفتكم جاهزة',
    },
    lead: {
      fr: 'Le texte a été préparé pour la parution. Relisez-le : validez-le (bon à tirer) ou demandez des corrections, dans les 5 jours.',
      en: 'The text has been prepared for publication. Read it: approve it or ask for corrections, within 5 days.',
      es: 'El texto se ha preparado para su publicación. Léalo: apruébelo o solicite correcciones en un plazo de 5 días.',
      pt: 'O texto foi preparado para publicação. Leia-o: aprove-o ou peça correções, no prazo de 5 dias.',
      ar: 'جُهّز النص للنشر. اقرأوه ووافقوا عليه أو اطلبوا تصويبات خلال 5 أيام.',
    },
  },
  published: {
    subject: {
      fr: 'KOHOP : votre contribution est publiée',
      en: 'KOHOP: your contribution is published',
      es: 'KOHOP: su contribución está publicada',
      pt: 'KOHOP: a sua contribuição foi publicada',
      ar: 'KOHOP: نُشرت مساهمتكم',
    },
    title: {
      fr: 'Votre contribution est en ligne',
      en: 'Your contribution is online',
      es: 'Su contribución está en línea',
      pt: 'A sua contribuição está online',
      ar: 'مساهمتكم منشورة',
    },
    lead: {
      fr: 'Elle est publiée avec les analyses signées de vos relecteurs et votre réponse. Partagez le lien permanent.',
      en: 'It is published with your reviewers’ signed analyses and your reply. Share the permanent link.',
      es: 'Se ha publicado con los análisis firmados de sus revisores y su respuesta. Comparta el enlace permanente.',
      pt: 'Foi publicada com as análises assinadas dos seus revisores e a sua resposta. Partilhe a ligação permanente.',
      ar: 'نُشرت مع تحليلات مراجعيكم الموقّعة وردّكم. شاركوا الرابط الدائم.',
    },
  },
  publishedReviewer: {
    subject: {
      fr: 'KOHOP : la contribution que vous avez relue est publiée',
      en: 'KOHOP: the contribution you reviewed is published',
      es: 'KOHOP: la contribución que revisó está publicada',
      pt: 'KOHOP: a contribuição que reviu foi publicada',
      ar: 'KOHOP: نُشرت المساهمة التي راجعتموها',
    },
    title: {
      fr: 'Votre analyse est publiée',
      en: 'Your analysis is published',
      es: 'Su análisis está publicado',
      pt: 'A sua análise foi publicada',
      ar: 'نُشر تحليلكم',
    },
    lead: {
      fr: 'Merci pour votre relecture : votre analyse paraît sous votre nom, avec la contribution.',
      en: 'Thank you for your review: your analysis appears under your name, with the contribution.',
      es: 'Gracias por su revisión: su análisis aparece con su nombre, junto con la contribución.',
      pt: 'Obrigado pela sua revisão: a sua análise aparece com o seu nome, juntamente com a contribuição.',
      ar: 'شكراً على مراجعتكم: يظهر تحليلكم باسمكم مع المساهمة.',
    },
  },
  retracted: {
    subject: {
      fr: 'KOHOP : votre contribution a été retirée',
      en: 'KOHOP: your contribution has been retracted',
      es: 'KOHOP: su contribución ha sido retirada',
      pt: 'KOHOP: a sua contribuição foi retirada',
      ar: 'KOHOP: سُحبت مساهمتكم',
    },
    title: {
      fr: 'Votre contribution est retirée',
      en: 'Your contribution is retracted',
      es: 'Su contribución está retirada',
      pt: 'A sua contribuição foi retirada',
      ar: 'سُحبت مساهمتكم',
    },
    lead: {
      fr: 'La page reste en ligne avec une notice de retrait. Le motif est visible dans votre espace.',
      en: 'The page stays online with a retraction notice. The reason is visible in your member area.',
      es: 'La página permanece en línea con un aviso de retirada. El motivo es visible en su espacio.',
      pt: 'A página permanece online com um aviso de retirada. O motivo é visível no seu espaço.',
      ar: 'تبقى الصفحة منشورة مع إشعار سحب. السبب ظاهر في فضائكم.',
    },
  },
};

const JOIN_LEAD: Phrase = {
  fr: 'Vous avez relu cette contribution sans être membre du réseau : si le travail de Democracy Together vous parle, vous pouvez le rejoindre.',
  en: 'You reviewed this contribution without being a member of the network: if the work of Democracy Together speaks to you, you can join it.',
  es: 'Revisó esta contribución sin ser miembro de la red: si el trabajo de Democracy Together le interesa, puede unirse.',
  pt: 'Reviu esta contribuição sem ser membro da rede: se o trabalho da Democracy Together lhe interessa, pode juntar-se.',
  ar: 'راجعتم هذه المساهمة دون أن تكونوا عضواً في الشبكة: إن أعجبكم عمل Democracy Together يمكنكم الانضمام إليه.',
};
const CTA_JOIN: Phrase = {
  fr: 'Rejoindre le réseau',
  en: 'Join the network',
  es: 'Unirse a la red',
  pt: 'Juntar-se à rede',
  ar: 'الانضمام إلى الشبكة',
};

export function productionEmail(args: {
  siteUrl: string;
  locale: SiteLocale;
  contributionId: string;
  slug?: string;
  title: string;
  dueLabel?: string;
  // An external reviewer (no membership yet): the e-mail also invites them to join.
  inviteToJoin?: boolean;
  kind: KohopProductionEmailKind;
}): { subject: string; html: string } {
  const loc = args.locale;
  const copy = PRODUCTION_COPY[args.kind];
  const publicPage =
    args.kind === 'published' || args.kind === 'publishedReviewer';
  const url =
    publicPage && args.slug
      ? `${base(args.siteUrl, loc)}/kohop/${encodeURIComponent(args.slug)}`
      : `${base(args.siteUrl, loc)}/espace-membre/kohop/${encodeURIComponent(args.contributionId)}`;
  const kit = emailKit(loc);
  const rows = [{ label: LABEL_TITLE[loc], value: escapeHtml(args.title) }];
  if (args.dueLabel) {
    rows.push({ label: LABEL_DEADLINE[loc], value: escapeHtml(args.dueLabel) });
  }
  const body =
    kit.paragraph(copy.lead[loc]) +
    kit.details(rows) +
    kit.button(
      url,
      publicPage
        ? CTA_PAGE[loc]
        : args.kind === 'proofToApprove'
          ? CTA_PROOF[loc]
          : CTA_FILE[loc],
    ) +
    kit.fallback(url);
  const joinUrl = `${base(args.siteUrl, loc)}/adhesion`;
  const withJoin = args.inviteToJoin
    ? body + kit.paragraph(JOIN_LEAD[loc]) + kit.button(joinUrl, CTA_JOIN[loc])
    : body;
  return {
    subject: `${copy.subject[loc]} · ${subjectText(args.title)}`,
    html: emailDocument({
      loc,
      title: copy.title[loc],
      preheader: copy.lead[loc],
      body: withJoin,
      reason:
        args.kind === 'publishedReviewer'
          ? REASON_REVIEWER_PUBLISHED[loc]
          : REASON_AUTHOR[loc],
    }),
  };
}

// --- To an EXTERNAL reviewer: invitation with a one-time link ----------------------

const EXT_REASON: Phrase = {
  fr: 'Vous recevez cet e-mail car un·e auteur·rice vous a proposé·e comme relecteur·rice sur KOHOP (Democracy Together) et le chef de revue a validé la proposition. Vous n’avez pas de compte : répondre n’engage à rien tant que vous n’avez pas accepté.',
  en: 'You are receiving this e-mail because an author proposed you as a reviewer on KOHOP (Democracy Together) and the review chief approved the proposal. You have no account: replying commits you to nothing until you accept.',
  es: 'Recibe este correo porque un/a autor/a le propuso como revisor/a en KOHOP (Democracy Together) y el jefe de revisión validó la propuesta. No tiene cuenta: responder no le compromete a nada hasta que acepte.',
  pt: 'Recebe este e-mail porque um/a autor/a o/a propôs como revisor/a no KOHOP (Democracy Together) e o chefe de revisão validou a proposta. Não tem conta: responder não o/a compromete a nada até aceitar.',
  ar: 'يصلكم هذا البريد لأن مؤلفاً اقترحكم مراجعاً في KOHOP (Democracy Together) ووافق رئيس المراجعة على الاقتراح. ليس لديكم حساب: الرد لا يلزمكم بشيء قبل القبول.',
};
const EXT_SUBJECT: Phrase = {
  fr: 'KOHOP : invitation à relire une contribution',
  en: 'KOHOP: invitation to review a contribution',
  es: 'KOHOP: invitación a revisar una contribución',
  pt: 'KOHOP: convite para rever uma contribuição',
  ar: 'KOHOP: دعوة لمراجعة مساهمة',
};
const EXT_REMINDER_SUBJECT: Phrase = {
  fr: 'KOHOP : rappel — invitation à relire une contribution',
  en: 'KOHOP: reminder — invitation to review a contribution',
  es: 'KOHOP: recordatorio — invitación a revisar una contribución',
  pt: 'KOHOP: lembrete — convite para rever uma contribuição',
  ar: 'KOHOP: تذكير — دعوة لمراجعة مساهمة',
};
const EXT_TITLE: Phrase = {
  fr: 'On vous propose de relire une contribution',
  en: 'You are asked to review a contribution',
  es: 'Se le propone revisar una contribución',
  pt: 'É convidado/a a rever uma contribuição',
  ar: 'يُقترح عليكم مراجعة مساهمة',
};
const EXT_LEAD: Phrase = {
  fr: 'KOHOP publie de courtes contributions relues par des pairs. Votre analyse, signée de votre nom, paraîtrait avec le texte. Le lien ci-dessous est personnel : il ne sert qu’une fois et expire à l’échéance indiquée. Votre profil professionnel public a servi à vérifier l’absence de lien avec l’auteur·rice.',
  en: 'KOHOP publishes short peer-reviewed contributions. Your analysis, signed with your name, would be published with the text. The link below is personal: it works once and expires at the deadline shown. Your public professional profile was used to check for ties with the author.',
  es: 'KOHOP publica contribuciones breves revisadas por pares. Su análisis, firmado con su nombre, se publicaría con el texto. El enlace es personal: solo sirve una vez y caduca en el plazo indicado. Su perfil profesional público se usó para comprobar que no hay vínculos con el autor.',
  pt: 'O KOHOP publica contribuições curtas revistas por pares. A sua análise, assinada com o seu nome, seria publicada com o texto. A ligação abaixo é pessoal: só serve uma vez e expira no prazo indicado. O seu perfil profissional público serviu para verificar a ausência de laços com o autor.',
  ar: 'ينشر KOHOP مساهمات قصيرة يراجعها النظراء. سيُنشر تحليلكم الموقّع باسمكم مع النص. الرابط شخصي: يُستعمل مرة واحدة وينتهي في الموعد المذكور. استُخدم ملفكم المهني العلني للتحقق من عدم وجود صلة بالمؤلف.',
};
const EXT_CTA: Phrase = {
  fr: 'Répondre à l’invitation',
  en: 'Answer the invitation',
  es: 'Responder a la invitación',
  pt: 'Responder ao convite',
  ar: 'الرد على الدعوة',
};

export function externalInvitationEmail(args: {
  siteUrl: string;
  locale: SiteLocale;
  token: string;
  title: string;
  dueLabel: string;
  reminder: boolean;
}): { subject: string; html: string; url: string } {
  const loc = args.locale;
  const url = `${base(args.siteUrl, loc)}/kohop/invitation/${args.token}`;
  const kit = emailKit(loc);
  const body =
    kit.paragraph(EXT_LEAD[loc]) +
    kit.details([
      { label: LABEL_TITLE[loc], value: escapeHtml(args.title) },
      { label: LABEL_DEADLINE[loc], value: escapeHtml(args.dueLabel) },
    ]) +
    kit.button(url, EXT_CTA[loc]) +
    kit.fallback(url);
  return {
    url,
    subject: `${(args.reminder ? EXT_REMINDER_SUBJECT : EXT_SUBJECT)[loc]} · ${subjectText(args.title)}`,
    html: emailDocument({
      loc,
      title: EXT_TITLE[loc],
      preheader: EXT_LEAD[loc],
      body,
      reason: EXT_REASON[loc],
    }),
  };
}
