'use client';

import dynamic from 'next/dynamic';

// Le Studio Sanity appelle React.createContext au niveau module : incompatible
// avec le rendu serveur. On le charge donc uniquement côté client (ssr:false),
// pour qu'il ne soit jamais évalué pendant le prérendu.
const StudioClient = dynamic(() => import('./studio-client'), { ssr: false });

export default function StudioPage() {
  return <StudioClient />;
}
