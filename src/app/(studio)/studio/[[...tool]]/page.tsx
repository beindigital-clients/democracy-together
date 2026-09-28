'use client';

import dynamic from 'next/dynamic';
import { projectId } from '../../../../../sanity/env';

// The Sanity Studio calls React.createContext at module level: incompatible
// with server rendering. We therefore load it client-side only (ssr:false),
// so that it is never evaluated during prerendering.
const StudioClient = dynamic(() => import('./studio-client'), { ssr: false });

// STUDIO NOT CONFIGURED (cross-cutting A-13, R-16). `sanity/env.ts` falls back
// `projectId` to "placeholder" so that the Studio can be imported without a project;
// but mounted with this fake identifier, it tried to reach
// placeholder.api.sanity.io in a loop and left a blank page with an
// endless spinner (measured on 27/09: 9 × ERR_TUNNEL_CONNECTION_FAILED). Here,
// we mount the Studio ONLY if a project is set; otherwise, a page that
// says what to do. Hard-coded text and inline styles: this route group lives
// OUTSIDE the [locale] segment (no next-intl, no globals.css), like the
// root 404. The Studio remains excluded from the CSP (next.config.ts): this page
// changes nothing there.
const PAGE: React.CSSProperties = {
  minHeight: '100dvh',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '48px 24px',
  background: '#fbfaf8',
  color: '#15202b',
  fontFamily:
    'system-ui, -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  lineHeight: 1.55,
};

const CODE: React.CSSProperties = {
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: 13,
  background: '#efede4',
  padding: '2px 6px',
  borderRadius: 3,
};

function StudioNotConfigured() {
  return (
    <main style={PAGE}>
      <div style={{ maxWidth: 560 }}>
        <div
          style={{
            width: 44,
            height: 4,
            background: '#1f3d6e',
            marginBottom: 28,
          }}
        />
        <p
          style={{
            margin: 0,
            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            fontSize: 12,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#6b7683',
          }}
        >
          Sanity Studio
        </p>
        <h1
          lang="fr"
          style={{ margin: '12px 0 0', fontSize: 28, letterSpacing: '-0.01em' }}
        >
          Studio non configuré
        </h1>
        <p lang="fr" style={{ margin: '10px 0 0', color: '#4a5561' }}>
          Aucun projet Sanity n’est renseigné. Définissez{' '}
          <code style={CODE}>NEXT_PUBLIC_SANITY_PROJECT_ID</code> (et, au
          besoin, <code style={CODE}>NEXT_PUBLIC_SANITY_DATASET</code>) dans{' '}
          <code style={CODE}>.env.local</code>, puis redémarrez le serveur pour
          activer le Studio.
        </p>
        <p style={{ margin: '20px 0 0', color: '#6b7683' }}>
          No Sanity project is configured. Set{' '}
          <code style={CODE}>NEXT_PUBLIC_SANITY_PROJECT_ID</code> in{' '}
          <code style={CODE}>.env.local</code> and restart the server to enable
          the Studio.
        </p>
      </div>
    </main>
  );
}

export default function StudioPage() {
  if (projectId === 'placeholder') return <StudioNotConfigured />;
  return <StudioClient />;
}
