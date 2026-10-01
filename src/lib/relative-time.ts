import { intlLocale } from '@/i18n/locale';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// "il y a 5 min", "hier", "il y a 3 jours" — then the date itself.
//
// Beyond a week, a relative time makes the reader do arithmetic ("il y a
// 23 jours": which day was that?): the date is given instead. Every value
// goes through `intlLocale`, so Arabic keeps Western digits like the rest of
// the site.
export function relativeTime(ms: number, now: number, locale: string): string {
  const tag = intlLocale(locale);
  const diff = ms - now;
  const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(tag, {
    numeric: 'auto',
    style: 'short',
  });
  if (abs < MINUTE) return rtf.format(0, 'second');
  if (abs < HOUR) return rtf.format(Math.round(diff / MINUTE), 'minute');
  if (abs < DAY) return rtf.format(Math.round(diff / HOUR), 'hour');
  if (abs < 7 * DAY) return rtf.format(Math.round(diff / DAY), 'day');
  const sameYear = new Date(ms).getFullYear() === new Date(now).getFullYear();
  return new Intl.DateTimeFormat(tag, {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  }).format(ms);
}
