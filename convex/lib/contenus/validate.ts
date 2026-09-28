import { isHttpUrl } from '../validation';

// Input rules for editorial content — pure, hence testable without a database.

// A content slug is a public address (`/evenements/<slug>`): it is
// STABLE (not editable after creation, so as never to break an already
// shared link) and restricted to what a URL carries without encoding.
export const CONTENT_SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const CONTENT_SLUG_MAX = 100;

export function isContentSlug(value: string): boolean {
  return value.length <= CONTENT_SLUG_MAX && CONTENT_SLUG_RE.test(value);
}

// Bounds on texts entered by an editor.
export const CONTENT_MAX = {
  title: 200,
  short: 400,
  body: 4000,
  listItems: 20,
  url: 2000,
} as const;

/** Absolute, bounded http(s) URL, or an `INVALID_URL` error. */
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
 * Video link of a replay, validated AGAINST ITS KIND: a "YouTube" video that
 * points elsewhere is refused, and a "file" must be https and end
 * with a video extension. The public player thus never serves an arbitrary
 * address under a reassuring label.
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
 * Embed address (iframe) of a YouTube or Vimeo video, or `null`.
 * YouTube's "nocookie" domain is used: no tracker before playback.
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
