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

// F-28 — Dons mensuels sans prélèvement automatique (PayDunya, XOF) : chaque
// jour à 08:10 UTC (09:10 à Paris l'hiver, 08:10 à Dakar), envoi du lien de
// paiement des échéances arrivées. Minute décalée : les tâches à l'heure pile
// se bousculent chez l'hébergeur.
crons.cron(
  'payments-recurring-reminders',
  '10 8 * * *',
  internal.payments.recurring.sendDueReminders,
  {},
);

export default crons;
