export const apiVersion =
  process.env.NEXT_PUBLIC_SANITY_API_VERSION || '2025-01-01';

export const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || 'production';

// Fallback alphanumérique : le Studio s'importe même sans projet configuré.
// Renseigner NEXT_PUBLIC_SANITY_PROJECT_ID dans .env.local pour l'activer.
export const projectId =
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || 'placeholder';
