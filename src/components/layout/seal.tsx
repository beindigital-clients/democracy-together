// Sceau abstrait Democracy Together : un nœud de réseau (aucune lettre,
// donc indépendant de la marque verbale). currentColor -> hérite de text-accent.
export function Seal({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      aria-hidden="true"
      className={className}
    >
      <circle cx="16" cy="6" r="2.4" fill="currentColor" stroke="none" />
      <circle cx="6" cy="22" r="2.4" fill="currentColor" stroke="none" />
      <circle cx="26" cy="22" r="2.4" fill="currentColor" stroke="none" />
      <circle cx="16" cy="16" r="2" fill="currentColor" stroke="none" opacity="0.55" />
      <path d="M16 6 6 22M16 6l10 16M6 22h20M16 6v10M6 22l10-6M26 22l-10-6" opacity="0.75" />
    </svg>
  );
}
