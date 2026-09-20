import { expect, type Locator, type Page } from '@playwright/test';

// RATTACHEMENT DU MESSAGE AU CHAMP (issues #12 et #37).
//
// Vérifier qu'un texte d'erreur est « visible quelque part » ne dit rien de ce
// qui manquait : le LIEN entre le champ fautif et son message. Ces assertions
// tiennent le lien lui-même — le champ est marqué invalide, et le message qui
// le DÉCRIT (`aria-describedby`) est bien celui-là.

export async function expectFieldError(
  page: Page,
  field: Locator,
  message: string | RegExp,
): Promise<void> {
  await expect(field).toHaveAttribute('aria-invalid', 'true');
  const describedBy = (await field.getAttribute('aria-describedby')) ?? '';
  const ids = describedBy.split(/\s+/).filter(Boolean);
  expect(ids.length, 'le champ ne décrit aucun message').toBeGreaterThan(0);

  // Un champ peut être décrit par son aide ET son erreur : on cherche parmi
  // les deux. Sélecteur d'attribut et non `#id` — les identifiants générés par
  // React contiennent « : », ce qui n'est pas un sélecteur CSS valide.
  const described = page.locator(ids.map((id) => `[id="${id}"]`).join(', '));
  await expect(described.filter({ hasText: message })).toHaveCount(1);
}

export async function expectNoFieldError(field: Locator): Promise<void> {
  await expect(field).not.toHaveAttribute('aria-invalid', 'true');
}
