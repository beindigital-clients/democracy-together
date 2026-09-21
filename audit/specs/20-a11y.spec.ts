import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { PUBLIQUES } from './_routes';

for (const route of PUBLIQUES) {
  test(`a11y fr${route || '/'}`, async ({ page }) => {
    await page.goto(`/fr${route}`, { waitUntil: 'domcontentloaded' });
    const r = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
      .analyze();
    const graves = r.violations.filter((v) =>
      ['serious', 'critical'].includes(v.impact ?? ''),
    );
    const resume = graves.map((v) => `${v.id}(${v.impact},${v.nodes.length})`);
    console.log(
      `[a11y] /fr${route || '/'} total=${r.violations.length} graves=${graves.length} ${resume.join(' ')}`,
    );
    expect(resume, `/fr${route} : violations graves`).toEqual([]);
  });
}
