// @vitest-environment happy-dom
import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import messages from '@/messages/fr.json';
import {
  CampaignPreview,
  splitParagraphs,
} from '@/components/admin/campaign-preview';

afterEach(cleanup);

// APERÇU D'UNE CAMPAGNE (campagne du 27/09, R-07) : l'éditeur envoyait sans
// voir. L'aperçu doit découper le texte comme `campaignHtml`
// (convex/newsletter.ts) — un paragraphe par ligne vide — et ne jamais
// interpréter le corps comme du HTML.

function setup(subject: string, body: string) {
  render(
    <NextIntlClientProvider locale="fr" messages={messages}>
      <CampaignPreview subject={subject} body={body} />
    </NextIntlClientProvider>,
  );
  return screen.getByRole('region', { name: "Aperçu de l'e-mail" });
}

describe('splitParagraphs', () => {
  it('découpe sur les lignes vides et garde les retours simples', () => {
    expect(
      splitParagraphs('Bonjour\nà tous,\n\nDeuxième.\n\n\nTroisième.'),
    ).toEqual([['Bonjour', 'à tous,'], ['Deuxième.'], ['Troisième.']]);
  });
  it('ignore les blancs de bord et les paragraphes vides', () => {
    expect(splitParagraphs('  \n\n  Un.  \n\n  ')).toEqual([['Un.']]);
    expect(splitParagraphs('')).toEqual([]);
  });
});

describe('CampaignPreview', () => {
  it('rend le sujet, les paragraphes et le pied de désinscription', () => {
    const region = setup('Lettre de rentrée', 'Un.\n\nDeux\nlignes.');
    expect(region.textContent).toContain('Objet :');
    expect(region.textContent).toContain('Lettre de rentrée');
    expect(region.querySelectorAll('p.wrap-anywhere')).toHaveLength(2);
    expect(region.querySelectorAll('br')).toHaveLength(1);
    expect(region.textContent).toContain(messages.admin.nlPreviewFooter);
  });

  it('affiche le corps comme du texte, jamais comme du HTML', () => {
    const region = setup('Sujet', '<img src=x onerror="alert(1)">');
    expect(region.querySelector('img')).toBeNull();
    expect(region.textContent).toContain('<img src=x');
  });

  it('dit quoi faire quand rien n’est saisi', () => {
    const region = setup('', '   ');
    expect(region.textContent).toContain(messages.admin.nlPreviewEmpty);
  });
});
