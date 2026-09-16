import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';
import { buildSite } from '../../scripts/build-site.mjs';

test('The public landing page renders accessibly without overflow or external requests at four widths', async () => {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
  const site = await buildSite(root);
  const css = await readFile(join(site, 'assets/styles.css'), 'utf8');
  const image = await readFile(join(site, 'assets/report-preview.png'));
  // Render the static document with embedded local assets. This is a layout test,
  // not a claim of ordinary-navigation or deployed GitHub Pages verification.
  const html = (await readFile(join(site, 'index.html'), 'utf8'))
    .replace('<link rel="stylesheet" href="assets/styles.css">', `<style>${css}</style>`)
    .replace('src="assets/report-preview.png"', `src="data:image/png;base64,${image.toString('base64')}"`);
  const browser = await chromium.launch({executablePath:process.env.GEOCHAOS_CHROMIUM_PATH});
  try {
    for (const width of [1360,768,390,320]) {
      const page = await browser.newPage({viewport:{width, height:950}});
      const errors = [], requests = [];
      page.on('pageerror', error => errors.push(error.message));
      page.on('request', request => {if (/^https?:/.test(request.url())) requests.push(request.url());});
      await page.setContent(html, {waitUntil:'load'});
      await page.locator('.report-preview').scrollIntoViewIfNeeded();
      await page.waitForFunction(() => document.querySelector('img')?.complete);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `width ${width}`);
      assert.equal(await page.locator('img').evaluateAll(images => images.every(img => img.naturalWidth > 0)), true);
      assert.match(await page.locator('footer').textContent(), /Vibe coded with ChatGPT Pro 6/);
      assert.equal(await page.getByRole('heading', {level:1}).count(), 1);
      assert.deepEqual(errors, []); assert.deepEqual(requests, []);
      await page.close();
    }
  } finally {await browser.close();}
});
