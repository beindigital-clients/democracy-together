import { chromium } from '@playwright/test';

// Usage: node scripts/shot.mjs <path> <out.png> [path2 out2 ...]
const base = 'http://localhost:3000';
const args = process.argv.slice(2);
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 900 },
  reducedMotion: 'reduce',
  locale: 'fr-FR',
});
const page = await ctx.newPage();

for (let i = 0; i < args.length; i += 2) {
  const path = args[i];
  const out = args[i + 1];
  await page.goto(base + path, { waitUntil: 'networkidle' });
  // Défile pour déclencher les reveals (once:true) avant la capture pleine page.
  const h = await page.evaluate(() => document.body.scrollHeight);
  for (let y = 0; y < h; y += 600) {
    await page.evaluate((yy) => window.scrollTo(0, yy), y);
    await page.waitForTimeout(110);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(300);
  await page.screenshot({ path: out, fullPage: true });
  console.log('shot:', path, '->', out);
}
await browser.close();
