// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import fr from '@/messages/fr.json';
import ar from '@/messages/ar.json';
import { PersonAvatar, initials } from '@/components/social/person-avatar';
import { PersonCard } from '@/components/social/person-card';
import { centeredSquare, CROP_OUTPUT_SIZE } from '@/lib/image-crop';
import { personJsonLd, profileDescription } from '@/lib/social-seo';

afterEach(cleanup);

// Composants PURS du réseau social, montés avec les vrais catalogues : une
// clé absente ferait échouer le rendu au lieu de passer en silence.

const PERSON = {
  handle: 'awa-diallo',
  displayName: 'Awa Diallo',
  photoUrl: null,
  jobTitle: 'Chercheuse',
  country: 'SN',
  themes: ['elections', 'jeunesse'],
  languages: ['fr'],
  followerCount: 3,
};

describe('PersonAvatar', () => {
  it('initiales sans photo, décoratives par défaut', () => {
    const { container } = render(
      <PersonAvatar name="Awa Diallo" photoUrl={null} />,
    );
    expect(container.textContent).toBe('AD');
    expect(container.firstElementChild?.getAttribute('aria-hidden')).toBe(
      'true',
    );
  });
  it('initiales robustes : nom vide, alphabet non latin', () => {
    expect(initials('')).toBe('·');
    expect(initials('محمد علي')).toBe('مع');
  });
  it('photo : une image, alt fourni par l’appelant', () => {
    render(
      <PersonAvatar
        name="Awa"
        photoUrl="https://x.convex.cloud/api/storage/abc"
        alt="Photo de Awa"
      />,
    );
    expect(screen.getByRole('img', { name: 'Photo de Awa' })).toBeTruthy();
  });
});

describe('PersonCard', () => {
  it('lien vers la page de profil, compteur traduit (fr)', () => {
    render(
      <NextIntlClientProvider locale="fr" messages={fr}>
        <PersonCard
          person={PERSON}
          themeLabels={{ elections: 'Élections & intégrité' }}
        />
      </NextIntlClientProvider>,
    );
    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe('/fr/membres/awa-diallo');
    expect(link.textContent).toContain('3 abonnés');
    expect(link.textContent).toContain('Élections & intégrité');
  });
  it('pluriel arabe (duel)', () => {
    render(
      <NextIntlClientProvider locale="ar" messages={ar}>
        <PersonCard person={{ ...PERSON, followerCount: 2 }} themeLabels={{}} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole('link').textContent).toContain('متابعان');
  });
});

describe('Recadrage carré', () => {
  it('carré centré, sans agrandir une petite image', () => {
    expect(centeredSquare(400, 300)).toEqual({
      sx: 50,
      sy: 0,
      side: 300,
      out: 300,
    });
    expect(centeredSquare(3000, 4000)).toEqual({
      sx: 0,
      sy: 500,
      side: 3000,
      out: CROP_OUTPUT_SIZE,
    });
  });
});

describe('Fiche Person (schema.org)', () => {
  it('ne déclare que ce que la page montre', () => {
    const ld = personJsonLd({
      locale: 'fr',
      handle: 'awa-diallo',
      displayName: 'Awa Diallo',
      jobTitle: null,
      description: null,
      organization: null,
      sameAs: [],
    });
    expect(Object.keys(ld).sort()).toEqual(
      ['@context', '@id', '@type', 'name', 'url'].sort(),
    );
    expect(ld.url).toMatch(/\/fr\/membres\/awa-diallo$/);
  });
  it('description bornée', () => {
    expect(profileDescription({ jobTitle: null, bio: null })).toBeUndefined();
    expect(
      profileDescription({ jobTitle: 'X', bio: 'y'.repeat(500) })!.length,
    ).toBe(200);
  });
});
