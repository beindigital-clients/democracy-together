// Le runtime Convex expose `process.env` (variables d'environnement du
// déploiement), mais ce n'est pas Node : on déclare donc uniquement
// `process.env` pour le typecheck, sans inclure tout @types/node (qui
// laisserait passer des API Node indisponibles dans l'isolate).
declare const process: {
  readonly env: Record<string, string | undefined>;
};
