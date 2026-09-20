// Machines à états des revues (audit M6 · issue #9) — généralisation de la
// garde posée sur `organizations.reviewApplication` par la PR #4.
//
// Le défaut corrigé : une mutation de revue qui ne lit pas le statut courant
// tranche deux fois. Un double clic REJOUE la décision ; un clic sur l'autre
// bouton l'INVERSE. Et comme ces mutations sont AUDITÉES, chaque passage écrit
// une entrée de plus : l'historique finit par montrer trois décisions
// contradictoires sur le même dossier sans qu'on puisse dire laquelle fait foi
// — pire qu'une absence d'historique pour une association qui devra rendre
// compte de ses décisions.
//
// La règle : chaque mutation de revue déclare la table de transitions de son
// domaine AU-DESSUS du handler (elle documente la machine) et appelle
// `assertTransition` en tête de handler. Le `throw` annule la transaction :
// une décision refusée n'écrit donc NI le document NI la ligne d'audit.
//
// Deux erreurs, et deux seulement :
//   - ALREADY_REVIEWED   : l'état de départ est DÉJÀ TRANCHÉ — rejeu ou
//     inversion d'une décision prise ;
//   - INVALID_TRANSITION : l'état de départ n'attend aucune décision —
//     publication jamais soumise, revue sans relecteur assigné, dossier déjà
//     de retour dans la file.
//
// Un retour en arrière reste possible — on rouvre un dossier tranché par
// erreur — mais c'est une transition NOMMÉE : une mutation `reopen*` dédiée,
// tracée dans `auditLog` sous sa propre action, jamais l'effet de bord d'un
// second clic.

export type ReviewMachine<S extends string> = {
  // État de départ -> états d'arrivée légitimes. Clé absente = cul-de-sac.
  readonly transitions: Readonly<Partial<Record<S, readonly S[]>>>;
  // États « tranchés » : en repartir est un rejeu ou une inversion.
  readonly decided: readonly S[];
};

// L'erreur qui correspond à l'état de DÉPART — utile telle quelle pour les
// gardes qui ne sont pas un changement d'état (déposer un avis de relecture).
export function reviewStateError<S extends string>(
  from: S,
  machine: ReviewMachine<S>,
): Error {
  return new Error(
    machine.decided.includes(from) ? 'ALREADY_REVIEWED' : 'INVALID_TRANSITION',
  );
}

export function assertTransition<S extends string>(
  from: S,
  to: S,
  machine: ReviewMachine<S>,
): void {
  if ((machine.transitions[from] ?? []).includes(to)) return;
  throw reviewStateError(from, machine);
}
