// EXPORT CSV DU BACK-OFFICE — échappement RFC 4180 ET neutralisation des
// formules.
//
// Les inscrits à un événement saisissent eux-mêmes leur nom et leur
// organisation, sans compte. Un tableur qui ouvre le fichier EXÉCUTE une
// cellule commençant par `=`, `+`, `-` ou `@` (injection de formule, CWE-1236) :
// `=HYPERLINK("https://…";"cliquez")` dans un nom deviendrait un lien actif
// dans le fichier d'un modérateur. Une apostrophe en tête fait lire la cellule
// comme du texte — c'est la parade recommandée par l'OWASP, et elle ne
// modifie rien de visible pour une valeur légitime.

const FORMULA_START = /^[=+\-@\t\r]/;

export function csvCell(value: string): string {
  const safe = FORMULA_START.test(value) ? `'${value}` : value;
  return /[",\r\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(headers: string[], rows: string[][]): string {
  return [headers, ...rows]
    .map((cols) => cols.map(csvCell).join(','))
    .join('\r\n');
}

/** Téléchargement côté navigateur, BOM UTF-8 compris (accents dans Excel). */
export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
