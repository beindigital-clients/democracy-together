'use client';

import { useMemo } from 'react';
import { encode } from 'uqr';

// QR CODE GÉNÉRÉ DANS LE NAVIGATEUR (chantier comptes, inscription 2FA).
//
// Le secret TOTP ne doit transiter par aucun service tiers de génération
// d'images : il est encodé ici, par `uqr` (sans dépendance, ~10 Ko), et rendu
// en SVG — un seul chemin, net à toutes les tailles, sans `innerHTML`.
//
// Noir sur blanc dans les deux thèmes (jetons `qr-ink` / `qr-paper`) : une
// partie des applications d'authentification ne lit pas un code inversé.
export function QrCode({ value, label }: { value: string; label: string }) {
  const { size, path } = useMemo(() => {
    const qr = encode(value, { ecc: 'M', border: 2 });
    let d = '';
    qr.data.forEach((row, y) => {
      row.forEach((dark, x) => {
        if (dark) d += `M${x} ${y}h1v1h-1z`;
      });
    });
    return { size: qr.size, path: d };
  }, [value]);

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${size} ${size}`}
      shapeRendering="crispEdges"
      className="h-52 w-52 rounded-sm bg-qr-paper"
    >
      <path d={path} className="fill-qr-ink" />
    </svg>
  );
}
