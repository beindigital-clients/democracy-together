import { describe, it, expect } from 'vitest';
import {
  eventReminderEmail,
  invitationEmail,
  otpEmail,
  type OtpPurpose,
} from './lib/emailContent';
import { SITE_LOCALES, type SiteLocale } from './lib/locales';

// E-MAILS ARE THE ONLY PRODUCT TEXT THAT NO PAGE RENDERS, hence the
// only text no site crawl can catch. They went out in French
// to every recipient, whatever their language, without any test
// showing it — this one exists so that it cannot happen again.

const PURPOSES: OtpPurpose[] = ['verification', 'reset', 'signin'];
const SITE = 'https://exemple.test';

/** All the product's e-mails, for a given language. */
function tous(
  loc: SiteLocale,
): { nom: string; subject: string; html: string }[] {
  return [
    ...PURPOSES.map((p) => ({
      nom: `otp:${p}`,
      ...otpEmail('123456', p, loc),
    })),
    {
      nom: 'invitation:adhésion',
      ...invitationEmail({
        organizationName: 'Institut X',
        siteUrl: SITE,
        locale: loc,
      }),
    },
    {
      nom: 'invitation:compte',
      ...invitationEmail({ siteUrl: SITE, locale: loc }),
    },
    {
      nom: 'rappel',
      ...eventReminderEmail({
        eventSlug: 'sommet-2026',
        eventDate: Date.UTC(2026, 8, 24),
        siteUrl: SITE,
        locale: loc,
      }),
    },
  ];
}

// EXCLUSIVELY French function words — absent from Spanish, Portuguese and
// English. ("entre", "les", "sur" are excluded: they are valid words
// in Spanish or Portuguese, and would produce false positives.)
// The boundary is UNICODE (`\p{L}`) and not `\w`: `\w` does not include
// accented letters, so "est" matched inside the Spanish "está" and the
// Portuguese "está agora". A guard aimed at the wrong
// target guards nothing — and this one would have gone red on correct text.
const FRANCAIS_SEUL =
  /(?<![\p{L}\p{M}-])(votre|vous|nous|avec|pour|dans|cette|aucune|vérifiez|réinitialisez|connexion|demandez|recevez)(?![\p{L}\p{M}-])/iu;

describe('Courriels transactionnels — les cinq langues sont servies', () => {
  it.each(SITE_LOCALES)(
    '%s : tous les modèles rendent un sujet et un corps',
    (loc) => {
      for (const { nom, subject, html } of tous(loc)) {
        expect(subject.trim(), `${nom} : sujet vide`).not.toBe('');
        expect(html.trim(), `${nom} : corps vide`).not.toBe('');
        // A forgotten placeholder is this module's silent failure mode.
        expect(html, `${nom} : placeholder non substitué`).not.toMatch(
          /\{(org|date)\}/,
        );
      }
    },
  );

  it.each(SITE_LOCALES.filter((l) => l !== 'fr'))(
    '%s : aucun modèle ne recopie le français',
    (loc) => {
      const fr = tous('fr');
      const autre = tous(loc);
      for (let i = 0; i < fr.length; i++) {
        expect(
          autre[i].subject,
          `${autre[i].nom} : sujet identique au français`,
        ).not.toBe(fr[i].subject);
        expect(
          autre[i].html,
          `${autre[i].nom} : corps identique au français`,
        ).not.toBe(fr[i].html);
      }
    },
  );

  it.each(SITE_LOCALES.filter((l) => l !== 'fr'))(
    '%s : aucun mot français résiduel',
    (loc) => {
      for (const { nom, subject, html } of tous(loc)) {
        // The body carries HTML attributes (`style`, `font-family`…): we only
        // test the text, otherwise the `for` in `font-family` would pass for
        // French.
        const texte = html.replace(/<[^>]+>/g, ' ');
        expect(FRANCAIS_SEUL.test(subject), `${nom} : « ${subject} »`).toBe(
          false,
        );
        const m = FRANCAIS_SEUL.exec(texte);
        expect(
          m?.[0],
          `${nom} : mot français « ${m?.[0]} » dans le corps`,
        ).toBeUndefined();
      }
    },
  );
});

describe('Courriels transactionnels — l’arabe se compose de droite à gauche', () => {
  it('pose `dir="rtl"`, `lang="ar"` et un alignement explicite', () => {
    for (const { nom, html } of tous('ar')) {
      expect(html, `${nom}`).toContain('dir="rtl"');
      expect(html, `${nom}`).toContain('lang="ar"');
      // `dir` alone is not enough: many e-mail clients
      // do not align text based on it.
      expect(html, `${nom} : alignement non posé`).toContain(
        'text-align:right',
      );
    }
  });

  it('écrit bien de l’arabe, et non du latin translittéré', () => {
    for (const { nom, subject, html } of tous('ar')) {
      expect(/[؀-ۿ]/.test(subject), `${nom} : sujet sans arabe`).toBe(true);
      expect(/[؀-ۿ]/.test(html), `${nom} : corps sans arabe`).toBe(true);
    }
  });

  it('laisse le code à usage unique en lecture gauche-droite', () => {
    // A spaced sequence of digits is fragile under the bidirectional algorithm
    // if it inherits the paragraph's direction: it carries its own `dir`.
    expect(otpEmail('123456', 'signin', 'ar').html).toContain('dir="ltr"');
  });

  it('garde les chiffres occidentaux dans les dates', () => {
    // Repository decision (`ar-MA`): a reminder must not announce "٢٠٢٦"
    // when the event page displays "2026".
    const html = eventReminderEmail({
      eventSlug: 'x',
      eventDate: Date.UTC(2026, 8, 24),
      siteUrl: SITE,
      locale: 'ar',
    }).html;
    expect(html).toContain('2026');
    expect(html, 'chiffre indo-arabe dans une date').not.toMatch(/[٠-٩]/);
  });
});

describe('Courriels transactionnels — les liens suivent le destinataire', () => {
  it.each(SITE_LOCALES)(
    '%s : l’invitation mène à la connexion dans sa langue',
    (loc) => {
      const html = invitationEmail({ siteUrl: SITE, locale: loc }).html;
      // The address was HARD-CODED `/fr/connexion-otp`: an Arabic-speaking member was
      // dropped on a French page by an e-mail that, even translated,
      // would have sent them back to where they started.
      expect(html).toContain(`${SITE}/${loc}/connexion-otp`);
    },
  );

  it.each(SITE_LOCALES)(
    '%s : le rappel mène à l’événement dans sa langue',
    (loc) => {
      const html = eventReminderEmail({
        eventSlug: 'sommet-2026',
        eventDate: Date.UTC(2026, 8, 24),
        siteUrl: SITE,
        locale: loc,
      }).html;
      expect(html).toContain(`${SITE}/${loc}/evenements/sommet-2026`);
    },
  );

  it('ne double pas la barre oblique quand l’URL du site en porte une', () => {
    expect(
      invitationEmail({ siteUrl: 'https://exemple.test/', locale: 'fr' }).html,
    ).toContain('https://exemple.test/fr/connexion-otp');
  });
});

describe('Courriels transactionnels — dates et échappement', () => {
  it('formate la date dans la langue du destinataire', () => {
    const date = Date.UTC(2026, 8, 24);
    const rendu = (loc: SiteLocale) =>
      eventReminderEmail({
        eventSlug: 'x',
        eventDate: date,
        siteUrl: SITE,
        locale: loc,
      }).html;
    expect(rendu('fr')).toContain('septembre');
    expect(rendu('en')).toContain('September');
    expect(rendu('es')).toContain('septiembre');
    expect(rendu('pt')).toContain('setembro');
  });

  it('échappe le nom d’organisation, qui vient d’un formulaire public', () => {
    const html = invitationEmail({
      organizationName: '<script>alert(1)</script>',
      siteUrl: SITE,
      locale: 'fr',
    }).html;
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
