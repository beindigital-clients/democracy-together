import { cronJobs } from 'convex/server';
import { internal } from './_generated/api';

// Tâches planifiées du backend. NB : on utilise `crons.cron` (et non l'aide
// `crons.daily`) conformément aux guidelines Convex du projet — l'expression
// ci-dessous équivaut à « tous les jours à 07:00 UTC ».
const crons = cronJobs();

// F-55 — Rappels d'événements : chaque jour à 07:00 UTC, envoie les rappels
// dont la date approche (≤ 2 jours). sendEmail est NO-OP sans clé fournisseur.
crons.cron(
  'event-reminders',
  '0 7 * * *',
  internal.eventReminders.sendDueReminders,
  {},
);

// F-43 — Relances des relecteurs : chaque jour à 06:13 UTC (minute décalée de
// l'heure pleine, où se concentrent les tâches), les relectures dont
// l'échéance est passée reçoivent une relance — au plus trois, espacées de
// trois jours — puis l'éditeur qui a désigné le relecteur est prévenu.
crons.cron(
  'peer-review-reminders',
  '13 6 * * *',
  internal.peerReview.sendDueReminders,
  {},
);

export default crons;
