import { test, expect } from '@playwright/test';
import { provisionUser, signInWithCode } from '../_helpers';

// THE MEMBER-AREA NAVIGATION ON A PHONE (member-area redesign).
//
// Below `lg` the side column folds into one button that names the current
// screen. What is checked here is what only a touch viewport shows: the
// menu opens and closes by tap, following an entry navigates AND folds the
// menu back, and nothing widens the page.
//
// This project has no shared sessions (no `setup` dependency): the account
// is provisioned and signed in by code, as an invited member would be.
test.use({ locale: 'fr-FR' });

const TOGGLE = 'button[aria-controls="member-nav"]';

test('le menu de l’espace membre s’ouvre, mène à l’écran choisi et se replie', async ({
  page,
}) => {
  test.setTimeout(90_000);
  const email = `e2e_menu_mobile_${Date.now()}@democracytogether.test`;
  await provisionUser(email, 'membre');
  await signInWithCode(page, email);

  const toggle = page.locator(TOGGLE);
  await expect(toggle).toBeVisible();
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  // Folded, the button still says where one is.
  await expect(toggle).toContainText('Tableau de bord');
  await expect(page.locator('#member-nav')).toBeHidden();

  await toggle.tap();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  const menu = page.getByRole('navigation', { name: 'Mon espace' });
  await expect(menu).toBeVisible();

  await menu.getByRole('link', { name: 'Mon profil' }).tap();
  await expect(page).toHaveURL(/\/fr\/espace-membre\/profil$/);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(toggle).toContainText('Mon profil');

  // Nothing overflows the phone's width.
  const debordement = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(debordement).toBeLessThanOrEqual(1);
});
