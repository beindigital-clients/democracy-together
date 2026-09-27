import { describe, it, expect } from 'vitest';
import { routing } from '@/i18n/routing';
import {
  isValidDate,
  isValidTimeZone,
  nextDay,
  scheduleInstants,
  zonedTimeToUtc,
} from '@convex/lib/contenus/time';
import { sniffMedia, cleanFilename } from '@convex/lib/contenus/media';
import {
  isContentSlug,
  validateVideoUrl,
  videoEmbedUrl,
} from '@convex/lib/contenus/validate';
import {
  cleanList,
  cleanText,
  localizedText,
  missingLocales,
  pickList,
  pickText,
  pickedLocale,
} from '@convex/lib/contenus/i18n';
import {
  CODED_THEME_TITLES,
  THEME_SLUGS,
} from '@convex/lib/contenus/coded/themes';
import {
  CODED_EVENTS,
  CODED_CITY_TIMEZONES,
} from '@convex/lib/contenus/coded/events';
import { csvCell, toCsv } from '@/lib/csv';
import {
  codedAgenda,
  featuredEvent,
  fromConvex,
  type ConvexAgenda,
} from '@/lib/contenus/agenda';
import fr from '@/messages/fr.json';
import en from '@/messages/en.json';
import es from '@/messages/es.json';
import pt from '@/messages/pt.json';
import ar from '@/messages/ar.json';

// Règles pures du chantier « contenus » : fuseaux, nature réelle des fichiers,
// liens vidéo, repli des traductions, CSV, et la forme de l'agenda.

describe('Contenus — dates avec fuseau', () => {
  it('convertit une heure murale en instant UTC, heure d’été comprise', () => {
    // Paris : UTC+2 en été, UTC+1 en hiver.
    expect(zonedTimeToUtc('2026-07-01', '10:00', 'Europe/Paris')).toBe(
      Date.UTC(2026, 6, 1, 8, 0),
    );
    expect(zonedTimeToUtc('2026-12-01', '10:00', 'Europe/Paris')).toBe(
      Date.UTC(2026, 11, 1, 9, 0),
    );
    // Dakar : UTC toute l'année.
    expect(zonedTimeToUtc('2026-07-01', '10:00', 'Africa/Dakar')).toBe(
      Date.UTC(2026, 6, 1, 10, 0),
    );
  });

  it('un événement sans heure couvre toute la journée de son fuseau', () => {
    const { startsAt, endsAt } = scheduleInstants({
      startDate: '2026-11-14',
      timezone: 'Europe/Paris',
    });
    expect(startsAt).toBe(Date.UTC(2026, 10, 13, 23, 0));
    expect(endsAt).toBe(Date.UTC(2026, 10, 14, 23, 0) - 1);
  });

  it('valide dates, heures et fuseaux', () => {
    expect(isValidDate('2026-02-28')).toBe(true);
    expect(isValidDate('2026-02-29')).toBe(false);
    expect(isValidDate('2028-02-29')).toBe(true);
    expect(isValidDate('2026-2-3')).toBe(false);
    expect(isValidTimeZone('Africa/Dakar')).toBe(true);
    expect(isValidTimeZone('Mars/Olympus')).toBe(false);
    expect(nextDay('2026-12-31')).toBe('2027-01-01');
  });

  it('chaque lieu du catalogue codé a un fuseau valide', () => {
    for (const e of CODED_EVENTS) {
      expect(isValidTimeZone(CODED_CITY_TIMEZONES[e.cityKey])).toBe(true);
    }
  });
});

describe('Contenus — nature réelle d’un fichier (médiathèque)', () => {
  const png = new Uint8Array([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48,
    0x44, 0x52, 0, 0, 1, 0x2c, 0, 0, 0, 0x96, 8, 6, 0, 0, 0,
  ]);
  it('reconnaît un PNG et lit ses dimensions', () => {
    expect(sniffMedia(png)).toEqual({
      kind: 'image',
      contentType: 'image/png',
      width: 300,
      height: 150,
    });
  });

  it('reconnaît JPEG, GIF, WebP et PDF', () => {
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 11, 8, 0, 50, 0, 80, 3,
      0, 0, 0,
    ]);
    expect(sniffMedia(jpeg)).toMatchObject({ width: 80, height: 50 });
    const gif = new TextEncoder().encode('GIF89a');
    const gifFull = new Uint8Array([...gif, 10, 0, 20, 0, 0, 0]);
    expect(sniffMedia(gifFull)).toMatchObject({
      contentType: 'image/gif',
      width: 10,
      height: 20,
    });
    const webp = new Uint8Array(30);
    webp.set(new TextEncoder().encode('RIFF'), 0);
    webp.set(new TextEncoder().encode('WEBPVP8X'), 8);
    webp.set([99, 0, 0, 49, 0, 0], 24);
    expect(sniffMedia(webp)).toMatchObject({
      contentType: 'image/webp',
      width: 100,
      height: 50,
    });
    expect(sniffMedia(new TextEncoder().encode('%PDF-1.7\n'))).toEqual({
      kind: 'pdf',
      contentType: 'application/pdf',
    });
  });

  it('refuse SVG, HTML, texte et image tronquée', () => {
    for (const text of ['<svg xmlns="x"/>', '<html>', 'bonjour']) {
      expect(sniffMedia(new TextEncoder().encode(text))).toBeNull();
    }
    expect(sniffMedia(png.slice(0, 12))).toBeNull();
  });

  it('assainit le nom de fichier affiché', () => {
    expect(cleanFilename('C:\\photos\\logo\u0000.png')).toBe('logo.png');
    expect(cleanFilename('')).toBe('fichier');
  });
});

describe('Contenus — liens vidéo et slugs', () => {
  it('valide un lien contre sa plateforme', () => {
    expect(validateVideoUrl('youtube', 'https://youtu.be/dQw4w9WgXcQ')).toBe(
      'https://youtu.be/dQw4w9WgXcQ',
    );
    expect(() =>
      validateVideoUrl('youtube', 'https://vimeo.com/123456'),
    ).toThrow('INVALID_VIDEO_URL');
    expect(() =>
      validateVideoUrl('file', 'http://cdn.example.org/v.mp4'),
    ).toThrow('INVALID_VIDEO_URL');
    expect(() =>
      validateVideoUrl('file', 'https://cdn.example.org/page.html'),
    ).toThrow('INVALID_VIDEO_URL');
    expect(() => validateVideoUrl('vimeo', 'javascript:alert(1)')).toThrow(
      'INVALID_URL',
    );
  });

  it('calcule l’adresse d’intégration', () => {
    expect(
      videoEmbedUrl('youtube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    ).toBe('https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ');
    expect(videoEmbedUrl('vimeo', 'https://vimeo.com/76979871')).toBe(
      'https://player.vimeo.com/video/76979871',
    );
    expect(videoEmbedUrl('file', 'https://x.org/v.mp4')).toBeNull();
  });

  it('un slug est une adresse sans encodage', () => {
    expect(isContentSlug('webinaire-2026')).toBe(true);
    expect(isContentSlug('Webinaire 2026')).toBe(false);
    expect(isContentSlug('a--b')).toBe(false);
  });
});

describe('Contenus — textes traduisibles', () => {
  it('les cinq clés du validateur sont les langues du site', () => {
    expect(Object.keys(localizedText.fields).sort()).toEqual(
      [...routing.locales].sort(),
    );
  });

  it('replie sur le français, puis l’anglais, et signale les manques', () => {
    const text = { fr: 'Bonjour', en: 'Hello' };
    expect(pickText(text, 'ar')).toBe('Bonjour');
    expect(pickedLocale(text, 'ar')).toBe('fr');
    expect(pickText({ en: 'Hello' }, 'es')).toBe('Hello');
    expect(missingLocales(text)).toEqual(['es', 'pt', 'ar']);
    expect(pickList({ fr: ['a', ' '] }, 'pt')).toEqual(['a']);
  });

  it('nettoie et borne la saisie', () => {
    expect(cleanText({ fr: '  a  ', en: '   ' }, 10)).toEqual({ fr: 'a' });
    expect(() => cleanText({ fr: 'x'.repeat(11) }, 10)).toThrow(
      'TEXT_TOO_LONG',
    );
    expect(cleanList({ fr: [' a ', ''] }, 5, 10)).toEqual({ fr: ['a'] });
  });

  it('les titres codés des thématiques sont ceux de `library.themes`', () => {
    const catalogues = { fr, en, es, pt, ar } as const;
    for (const l of routing.locales) {
      for (const slug of THEME_SLUGS) {
        expect(CODED_THEME_TITLES[l][slug]).toBe(
          (catalogues[l].library.themes as Record<string, string>)[slug],
        );
      }
    }
  });
});

describe('Contenus — export CSV', () => {
  it('neutralise les formules et échappe selon la RFC 4180', () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+33 6 00')).toBe("'+33 6 00");
    expect(csvCell('Dupont, Awa')).toBe('"Dupont, Awa"');
    expect(toCsv(['a', 'b'], [['1', '2']])).toBe('a,b\r\n1,2');
  });
});

describe('Contenus — agenda (repli codé et table)', () => {
  it('passé ou à venir se décide par la date, pas par l’indicateur codé', () => {
    const avant = codedAgenda('fr', Date.UTC(2026, 0, 1));
    expect(avant.every((e) => e.upcoming)).toBe(true);
    const apres = codedAgenda('fr', Date.UTC(2027, 0, 1));
    expect(apres.every((e) => !e.upcoming)).toBe(true);
  });

  it('la vedette est l’événement « à la une » à venir, sinon aucune', () => {
    const a = codedAgenda('fr', Date.UTC(2026, 0, 1));
    expect(featuredEvent(a)?.slug).toBe('conference-inaugurale');
    expect(featuredEvent(codedAgenda('fr', Date.UTC(2027, 0, 1)))).toBeNull();
  });

  it('convertit la réponse de la table sans perdre le titre traduit', () => {
    const rows: ConvexAgenda = [
      {
        slug: 'x',
        type: 'atelier',
        region: 'afrique',
        format: 'presentiel',
        theme: 'participation',
        langs: ['ar'],
        title: 'ورشة',
        summary: null,
        place: 'داكار',
        cityKey: null,
        startDate: '2031-03-02',
        startTime: '09:00',
        endDate: null,
        endTime: null,
        timezone: 'Africa/Dakar',
        startsAt: Date.UTC(2031, 2, 2, 9),
        endsAt: Date.UTC(2031, 2, 2, 23, 59),
        status: 'cancelled',
        featured: false,
        capacity: 30,
        hasVisio: false,
        durationMin: null,
        image: null,
      },
    ];
    const [e] = fromConvex(rows, Date.UTC(2031, 0, 1));
    expect(e).toMatchObject({
      y: 2031,
      mo: 3,
      d: 2,
      title: 'ورشة',
      place: 'داكار',
      upcoming: true,
      status: 'cancelled',
      source: 'convex',
    });
  });
});
