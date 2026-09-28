export const apiVersion =
  process.env.NEXT_PUBLIC_SANITY_API_VERSION || '2025-01-01';

export const dataset = process.env.NEXT_PUBLIC_SANITY_DATASET || 'production';

// Alphanumeric fallback: the Studio can be imported even without a configured project.
// Set NEXT_PUBLIC_SANITY_PROJECT_ID in .env.local to enable it.
export const projectId =
  process.env.NEXT_PUBLIC_SANITY_PROJECT_ID || 'placeholder';
