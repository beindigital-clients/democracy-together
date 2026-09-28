'use client';

import { useMemo } from 'react';
import { encode } from 'uqr';

// QR CODE GENERATED IN THE BROWSER (accounts workstream, 2FA enrolment).
//
// The TOTP secret must not pass through any third-party image generation
// service: it is encoded here, by `uqr` (no dependencies, ~10 KB), and
// rendered as SVG — a single path, crisp at every size, no `innerHTML`.
//
// Black on white in both themes (`qr-ink` / `qr-paper` tokens): some
// authenticator apps do not read an inverted code.
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
