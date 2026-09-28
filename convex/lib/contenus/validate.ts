import { isHttpUrl } from '../validation';

// Règles de saisie des contenus éditoriaux — pures, donc testables sans base.

// Un slug de contenu est une adresse publique (`/evenements/<slug>`) : il est
// STABLE (non modifiable après création, pour ne jamais casser un lien déjà
// partagé) et restreint à ce qu'une URL porte sans encodage.
export const CONTENT_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const CONTENT_SLUG_MAX = 100;

export function isContentSlug(value: string): boolean {
  return value.length <= CONTENT_SLUG_MAX && CONTENT_SLUG_RE.test(value);
}

// Bornes des textes saisis par un éditeur.
export const CONTENT_MAX = {
  title: 200,
  short: 400,
  body: 4000,
  listItems: 20,
  url: 2000,
} as const;

/** URL http(s) absolue et bornée, ou erreur `INVALID_URL`. */
export function requireHttpUrl(value: string): string {
  const v = value.trim();
  if (v.length > CONTENT_MAX.url || !isHttpUrl(v))
    throw new Error('INVALID_URL');
  return v;
}

export type VideoKind = 'youtube' | 'vimeo' | 'file';

const YOUTUBE_HOSTS = new Set([
  'youtube.com',
  'www.youtube.com',
  'm.youtube.com',
  'youtu.be',
  'www.youtube-nocookie.com',
]);
const VIMEO_HOSTS = new Set(['vimeo.com', 'www.vimeo.com', 'player.vimeo.com']);
const VIDEO_FILE_RE = /\.(mp4|webm|ogv|ogg|mov|m4v)$/i;

/**
 * Lien vidéo d'un replay, validé CONTRE SA NATURE : une vidéo « YouTube » qui
 * pointe ailleurs est refusée, et un « fichier » doit être en https et finir
 * par une extension vidéo. Le lecteur public ne sert donc jamais une adresse
 * arbitraire sous une étiquette rassurante.
 */
export function validateVideoUrl(kind: VideoKind, value: string): string {
  const url = requireHttpUrl(value);
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('INVALID_VIDEO_URL');
  const host = parsed.hostname.toLowerCase();
  if (kind === 'youtube' && !YOUTUBE_HOSTS.has(host))
    throw new Error('INVALID_VIDEO_URL');
  if (kind === 'vimeo' && !VIMEO_HOSTS.has(host))
    throw new Error('INVALID_VIDEO_URL');
  if (kind === 'file' && !VIDEO_FILE_RE.test(parsed.pathname))
    throw new Error('INVALID_VIDEO_URL');
  return url;
}

/**
 * Adresse d'intégration (iframe) d'une vidéo YouTube ou Vimeo, ou `null`.
 * Le domaine « nocookie » de YouTube est retenu : pas de traceur avant lecture.
 */
export function videoEmbedUrl(kind: VideoKind, value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (kind === 'youtube') {
    const host = parsed.hostname.toLowerCase();
    const segment = (i: number) => parsed.pathname.split('/')[i] ?? null;
    const id =
      host === 'youtu.be'
        ? segment(1)
        : parsed.pathname.startsWith('/embed/') ||
            parsed.pathname.startsWith('/shorts/')
          ? segment(2)
          : parsed.searchParams.get('v');
    return id && /^[A-Za-z0-9_-]{6,20}$/.test(id)
      ? `https://www.youtube-nocookie.com/embed/${id}`
      : null;
  }
  if (kind === 'vimeo') {
    const id = parsed.pathname.split('/').filter(Boolean).pop();
    return id && /^\d{4,15}$/.test(id)
      ? `https://player.vimeo.com/video/${id}`
      : null;
  }
  return null;
}
