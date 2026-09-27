'use client';

import dynamic from 'next/dynamic';
import { projectId } from '../../../../../sanity/env';

// Le Studio Sanity appelle React.createContext au niveau module : incompatible
// avec le rendu serveur. On le charge donc uniquement côté client (ssr:false),
// pour qu'il ne soit jamais évalué pendant le prérendu.
const StudioClient = dynamic(() => import('./studio-client'), { ssr: false });

// STUDIO NON CONFIGURÉ (transversal A-13, R-16). `sanity/env.ts` replie
// `projectId` sur « placeholder » pour que le Studio s'importe sans projet ;
// mais monté avec ce faux identifiant, il tentait de joindre
// placeholder.api.sanity.io en boucle et laissait une page blanche avec un
// spinner infini (mesuré le 27/09 : 9 × ERR_TUNNEL_CONNECTION_FAILED). Ici,
// on ne monte le Studio QUE si un projet est renseigné ; sinon, une page qui
// dit quoi faire. Texte en dur et styles en ligne : ce groupe de routes vit
// HORS du segment [locale] (pas de next-intl, pas de globals.css), comme la
// 404 racine. Le Studio reste exclu de la CSP (next.config.ts) : cette page
// n'y change rien.
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
