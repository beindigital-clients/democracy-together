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

export default crons;
