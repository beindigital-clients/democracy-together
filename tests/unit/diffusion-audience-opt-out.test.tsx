// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import fr from '@/messages/fr.json';
import { AudienceOptOut } from '@/components/analytics/audience-opt-out';
import { AUDIENCE_OPTOUT_KEY, audienceAllowed } from '@/lib/audience';

// Réglage d'opposition à la mesure d'audience (F-66, chantier diffusion),
// posé dans la politique de confidentialité. Ce qui compte : la case pilote
// RÉELLEMENT la balise (`audienceAllowed`), et l'état est dit en toutes
// lettres — pas seulement par la coche.

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function renderIt() {
  return render(
    <NextIntlClientProvider locale="fr" messages={fr}>
      <AudienceOptOut />
    </NextIntlClientProvider>,
  );
}

describe('AudienceOptOut', () => {
  it('cocher la case coupe la mesure sur ce navigateur, décocher la rétablit', async () => {
    renderIt();
    const box = await screen.findByRole('checkbox', {
      name: 'Ne pas mesurer mes visites sur ce navigateur',
    });
    expect((box as HTMLInputElement).checked).toBe(false);
    expect(audienceAllowed()).toBe(true);
    expect(
      screen.getByText('Vos visites sont comptées de façon anonyme.'),
    ).toBeTruthy();

    fireEvent.click(box);
    expect((box as HTMLInputElement).checked).toBe(true);
    expect(window.localStorage.getItem(AUDIENCE_OPTOUT_KEY)).toBe('1');
    expect(audienceAllowed()).toBe(false);
    expect(
      screen.getByText(
        "La mesure d'audience est désactivée sur ce navigateur.",
      ),
    ).toBeTruthy();

    fireEvent.click(box);
    expect(window.localStorage.getItem(AUDIENCE_OPTOUT_KEY)).toBeNull();
    expect(audienceAllowed()).toBe(true);
  });

  it('« Essentiels uniquement » du bandeau vaut opposition', () => {
    window.localStorage.setItem('dt-cookie-consent', 'essential');
    expect(audienceAllowed()).toBe(false);
  });
});
