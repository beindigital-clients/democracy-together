import { test, expect } from '@playwright/test';
import { latestContactForEmail } from './_helpers';
import { expectFieldError, expectNoFieldError } from './_fields';

test.use({ locale: 'fr-FR' });

test('contact : envoi valide -> succès + message stocké (F-17)', async ({
  page,
}) => {
  const email = `e2e_contact_${Date.now()}@democracytogether.test`;
  await page.goto('/fr/contact');

  await page.getByLabel('Nom').fill('Awa Diop');
  await page.getByLabel('E-mail').fill(email);
  await page.getByLabel('Sujet').fill('Partenariat think tank');
  await page
    .getByLabel('Message')
    .fill(
      'Bonjour, notre institut souhaite rejoindre le réseau Democracy Together.',
    );
  await page.getByRole('button', { name: 'Envoyer le message' }).click();

  await expect(
    page.getByRole('heading', { name: 'Message envoyé' }),
  ).toBeVisible();

  // vérifie le stockage réel côté Convex (lecture dev, garde AUTH_DEV_OTP)
  const stored = latestContactForEmail(email);
  expect(stored?.subject).toBe('Partenariat think tank');
  expect(stored?.handled).toBe(false);
});

// Auparavant : un message unique en bas de formulaire, à charge pour la
// personne de deviner lequel des quatre champs pose problème (issue #37).
test('contact : l’envoi invalide désigne LE champ fautif (F-17, #37)', async ({
  page,
}) => {
  const message = 'Un message suffisamment long ici.';
  await page.goto('/fr/contact');

  await page.getByLabel('Nom').fill('Awa');
  await page.getByLabel('E-mail').fill('pas-un-email');
  await page.getByLabel('Sujet').fill('Sujet');
  await page.getByLabel('Message').fill(message);
  await page.getByRole('button', { name: 'Envoyer le message' }).click();

  const email = page.getByLabel('E-mail');
  await expectFieldError(page, email, 'Saisissez une adresse e-mail valide.');
  // Et lui SEUL : les champs valides ne sont pas mis en cause.
  await expectNoFieldError(page.getByLabel('Nom'));
  await expectNoFieldError(page.getByLabel('Sujet'));
  await expectNoFieldError(page.getByLabel('Message'));
  // Le focus va au champ à corriger : c'est ce qui fait lire le message.
  await expect(email).toBeFocused();
  // Et rien de ce qui a été écrit n'est perdu.
  await expect(page.getByLabel('Message')).toHaveValue(message);

  await expect(
    page.getByRole('heading', { name: 'Message envoyé' }),
  ).toHaveCount(0);
});

test('contact : le message disparaît dès que le champ est corrigé (#37)', async ({
  page,
}) => {
  await page.goto('/fr/contact');
  await page.getByRole('button', { name: 'Envoyer le message' }).click();

  const name = page.getByLabel('Nom');
  await expectFieldError(page, name, /Indiquez votre nom/);
  await name.fill('Awa Diop');
  await expectNoFieldError(name);
  // Les autres restent en cause : corriger l'un n'absout pas les autres.
  await expectFieldError(page, page.getByLabel('E-mail'), /adresse e-mail/);
});
