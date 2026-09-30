import { afterEach, describe, expect, it, vi } from 'vitest';
import { emailKit, htmlToText, stripTags } from './lib/emailLayout';
import { invitationEmail, otpEmail } from './lib/emailContent';
import { campaignHtml } from './lib/newsletterContent';
import { newMessageEmail } from './lib/socialEmail';
import { paymentConfirmationEmail } from './lib/payments/emails';
import { SITE_LOCALES } from './lib/locales';

// The shared layout of every e-mail (convex/lib/emailLayout.ts). The five
// languages and the right-to-left layout are covered, template by template,
// in emailContent.test.ts; this file holds what the layout itself promises:
// a complete document in the site's image, a faithful text version, and
// nothing unescaped.

afterEach(() => vi.unstubAllEnvs());

describe('Mise en page — un document complet, à l’image du site', () => {
  it.each(SITE_LOCALES)('%s : document, logo, titre et pied de page', (loc) => {
    vi.stubEnv('SITE_URL', 'https://exemple.test/');
    const { subject, html } = otpEmail('123456', 'signin', loc);
    expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
    expect(html).toContain(`<html lang="${loc}"`);
    expect(html).toContain('<meta name="color-scheme" content="light dark">');
    // The logo: absolute (an e-mail has no base URL), sized, with a text
    // alternative for the clients that block images.
    expect(html).toContain(
      'src="https://exemple.test/brand/email/logo-on-navy@2x.png" width="188" height="52" alt="Democracy Together"',
    );
    // The heading is the subject without the brand suffix.
    const heading = subject.replace(' · Democracy Together', '');
    expect(html).toContain(`>${heading}</h1>`);
    expect(html).toContain(`<title>${heading}</title>`);
    expect(html).toContain(
      `href="https://exemple.test/${loc}/confidentialite"`,
    );
    expect(html).toContain(
      `<span dir="ltr">© ${new Date().getFullYear()} Democracy Together.</span>`,
    );
  });

  it('suit le mode sombre et les petits écrans, là où le client lit le <style>', () => {
    const { html } = otpEmail('123456', 'signin', 'fr');
    expect(html).toContain('@media (prefers-color-scheme:dark)');
    expect(html).toContain('@media only screen and (max-width:620px)');
  });

  it('n’espace ni ne capitalise les libellés en arabe (les lettres se lient)', () => {
    const args = {
      kind: 'donation' as const,
      recurring: false,
      amountMinor: 5000,
      currency: 'EUR' as const,
      receiptNumber: 'R-1',
      receiptUrl: 'https://exemple.test/recu',
    };
    expect(paymentConfirmationEmail({ ...args, locale: 'fr' }).html).toContain(
      'text-transform:uppercase',
    );
    expect(
      paymentConfirmationEmail({ ...args, locale: 'ar' }).html,
    ).not.toContain('text-transform:uppercase');
  });

  it('une campagne prend son sujet pour titre et offre la désinscription dans sa langue', () => {
    vi.stubEnv('SITE_URL', 'https://exemple.test');
    const html = campaignHtml(
      'First paragraph.\n\nSecond.',
      'tok',
      'en',
      'Our summit',
    );
    expect(html).toContain('>Our summit</h1>');
    expect(html).toContain(
      'href="https://exemple.test/en/newsletter/desinscription?token=tok"',
    );
    expect(html).toContain('>Unsubscribe</a>');
  });
});

describe('Version texte', () => {
  it('rend les liens « libellé (adresse) », le logo par son texte, sans balise ni style', () => {
    vi.stubEnv('SITE_URL', 'https://exemple.test');
    const text = htmlToText(
      invitationEmail({ siteUrl: 'https://exemple.test', locale: 'fr' }).html,
    );
    expect(
      text.startsWith('Democracy Together (https://exemple.test/fr)'),
    ).toBe(true);
    expect(text).toContain(
      'Se connecter (https://exemple.test/fr/connexion-otp)',
    );
    expect(text).not.toMatch(/<[a-z!/]/i);
    expect(text).not.toContain('font-family');
    expect(text).not.toMatch(/\n{3,}/);
  });

  it('ne répète pas le préheader', () => {
    const intro = 'Voici votre code de connexion à usage unique :';
    const text = htmlToText(otpEmail('123456', 'signin', 'fr').html);
    expect(text.split(intro).length - 1).toBe(1);
  });

  it('retire les balises jusqu’à la dernière, même imbriquées', () => {
    // One pass would turn `<scr<b>ipt>` back into `<script>`.
    expect(stripTags('<scr<b>ipt>x</scr</b>ipt>')).not.toMatch(/<script/i);
    expect(stripTags('<p>a <b>b</b></p>')).toBe('a b');
  });

  it('décode les entités une seule fois', () => {
    expect(htmlToText('<p>A &amp;lt; B &amp; C</p>')).toBe('A &lt; B & C');
  });
});

describe('Échappement', () => {
  it('échappe le titre et le préheader, qui viennent d’un nom saisi', () => {
    const html = newMessageEmail({
      senderName: '<img src=x onerror=alert(1)>',
      siteUrl: 'https://exemple.test',
      locale: 'fr',
    }).html;
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('échappe l’adresse d’un bouton', () => {
    expect(
      emailKit('fr').button('https://x.test/?a=1&b="2"', 'Aller'),
    ).toContain('href="https://x.test/?a=1&amp;b=&quot;2&quot;"');
  });
});
