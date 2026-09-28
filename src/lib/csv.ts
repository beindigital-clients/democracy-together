// BACK-OFFICE CSV EXPORT — RFC 4180 escaping AND formula
// neutralization.
//
// Event registrants enter their own name and
// organization, without an account. A spreadsheet opening the file EXECUTES a
// cell starting with `=`, `+`, `-` or `@` (formula injection, CWE-1236):
// `=HYPERLINK("https://…";"cliquez")` in a name would become an active link
// in a moderator's file. A leading apostrophe makes the cell read
// as text — it is the countermeasure recommended by OWASP, and it
// changes nothing visible for a legitimate value.

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

/** Browser-side download, UTF-8 BOM included (accents in Excel). */
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
