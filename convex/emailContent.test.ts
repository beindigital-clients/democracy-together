import { describe, it, expect } from 'vitest';
import {
  eventReminderEmail,
  invitationEmail,
  otpEmail,
  type OtpPurpose,
} from './lib/emailContent';
import { SITE_LOCALES, type SiteLocale } from './lib/locales';

// LES COURRIELS SONT LE SEUL TEXTE DU PRODUIT QU'AUCUNE PAGE NE REND, donc le
// seul qu'aucun balayage du site ne peut attraper. Ils sont partis en français
// à tous les destinataires, toutes langues confondues, sans qu'un test le
// montre — celui-ci existe pour que cela ne puisse pas recommencer.

const PURPOSES: OtpPurpose[] = ['verification', 'reset', 'signin'];
const SITE = 'https://exemple.test';

/** Tous les courriels du produit, pour une langue donnée. */
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

// Mots-outils EXCLUSIVEMENT français — absents de l'espagnol, du portugais et
// de l'anglais. (« entre », « les », « sur » sont écartés : ce sont des mots
// valides en espagnol ou en portugais, et ils produiraient de faux positifs.)
// La frontière est UNICODE (`\p{L}`) et non `\w` : `\w` ne contient pas les
// lettres accentuées, si bien que « est » correspondait à l'intérieur de
// l'espagnol « está » et du portugais « está agora ». Une garde qui se trompe
// de cible ne garde rien — et celle-ci aurait rougi sur du texte correct.
const FRANCAIS_SEUL =
  /(?<![\p{L}\p{M}-])(votre|vous|nous|avec|pour|dans|cette|aucune|vérifiez|réinitialisez|connexion|demandez|recevez)(?![\p{L}\p{M}-])/iu;

describe('Courriels transactionnels — les cinq langues sont servies', () => {
  it.each(SITE_LOCALES)(
    '%s : tous les modèles rendent un sujet et un corps',
    (loc) => {
      for (const { nom, subject, html } of tous(loc)) {
        expect(subject.trim(), `${nom} : sujet vide`).not.toBe('');
        expect(html.trim(), `${nom} : corps vide`).not.toBe('');
        // Un placeholder oublié est le mode d'échec silencieux de ce module.
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
        // Le corps porte des attributs HTML (`style`, `font-family`…) : on ne
        // teste que le texte, sinon `for` de `font-family` passerait pour du
        // français.
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
      // `dir` seul ne suffit pas : beaucoup de clients de messagerie
      // n'alignent pas le texte d'après lui.
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
    // Une suite de chiffres espacée est fragile à l'algorithme bidirectionnel
    // si elle hérite du sens du paragraphe : elle porte son propre `dir`.
    expect(otpEmail('123456', 'signin', 'ar').html).toContain('dir="ltr"');
  });

  it('garde les chiffres occidentaux dans les dates', () => {
    // Décision du dépôt (`ar-MA`) : un rappel ne doit pas annoncer « ٢٠٢٦ »
    // quand la page de l'événement affiche « 2026 ».
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
      // L'adresse était `/fr/connexion-otp` EN DUR : un membre arabophone était
      // déposé sur une page française par un courriel qui, même traduit,
      // l'aurait renvoyé au point de départ.
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
