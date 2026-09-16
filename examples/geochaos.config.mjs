import { defineConfig, assert } from 'geochaos';

export default defineConfig({
  name: 'My application / dependency resilience',
  baseURL: process.env.TARGET_URL ?? 'http://localhost:3000',
  outputDir: './geochaos-reports',
  // Exact owned origins are protected, not suffix/domain matches.
  firstPartyOrigins: [],
  excludeOrigins: [],
  groupBy: ['country', 'asn'],
  baselineRuns: 2,
  scenarioRuns: 1,
  maxScenarios: 12,
  geo: { mode: 'live', allowKeyless: false, maxLookups: 200 },
  screenshots: 'all',
  screenshotMasks: ['input[type="password"]'],
  diagnostics: false,
  journeys: [{
    name: 'Open application',
    steps: [{
      name: 'Load the page',
      run: async ({ page, baseURL }) => {
        const response = await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
        assert(response?.ok(), 'Application should return a successful response.');
        await page.locator('body').waitFor();
        // Replace this smoke assertion with a meaningful business outcome.
        assert((await page.title()).trim().length > 0, 'Page title should not be empty.');
      },
    }],
  }],
});
