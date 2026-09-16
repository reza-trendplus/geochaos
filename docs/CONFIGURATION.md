# Configuration reference

A configuration is the default export of a trusted `.mjs` file. `defineConfig` adds TypeScript-aware editor types; runtime validation still happens before running. Unknown option names fail immediately. Relative output and browser paths in a CLI-loaded config resolve against that config's directory. The CLI `--output` path is relative to the current working directory.

| Option | Default | Meaning |
| --- | --- | --- |
| `name` | `GeoChaos experiment` | Report title. Do not include secrets. |
| `notes` | `[]` | Additional interpretation notes displayed in the report. |
| `baseURL` | Required | Canonical HTTP(S) application URL. Its exact origin is always protected. |
| `journeys` | Required | Nonempty array of uniquely named journeys with nonempty named step arrays. |
| `firstPartyOrigins` | `[]` | Additional exact owned origins never targeted. |
| `excludeOrigins` | `[]` | Explicitly omit these exact origins from scenarios and coverage. |
| `groupBy` | `['country','asn']` | Grouping dimensions. |
| `countries` | `[]` | Optional two-letter country filters. Requires country grouping. |
| `asns` | `[]` | Optional string ASN filters; an `AS` prefix is accepted. |
| `maxScenarios` | `12` | 1-100 scenarios. Truncation makes coverage incomplete. |
| `baselineRuns` | `2` | 1-5 baseline attempts per journey. All must pass. |
| `scenarioRuns` | `1` | 1-5 attempts per relevant journey/scenario pair. |
| `actionTimeoutMs` | `5000` | Default browser locator/action timeout, 100-120000 ms. |
| `stepTimeoutMs` | `15000` | Per-step asynchronous deadline, 100-300000 ms. |
| `settleMs` | `250` | Brief post-journey observation window, 0-10000 ms. Not a substitute for assertions. |
| `outputDir` | `geochaos-reports` | Parent directory; each run gets a unique timestamp/id child. |
| `screenshots` | `'all'` | `'all'`, `'failures'`, or `'off'`. |
| `screenshotMasks` | `[]` | Playwright CSS/locator selector strings masked in primary-page screenshots. |
| `diagnostics` | `false` | Collect up to 30 warning/error console or page-error messages per attempt. |
| `redact` | `[]` | Exact additional sensitive strings to remove from diagnostics. |
| `browser.headless` | `true` | Whether the browser is visible. |
| `browser.executablePath` | Playwright-installed browser | Explicit compatible executable; also settable via `GEOCHAOS_CHROMIUM_PATH`. |
| `browser.viewport` | `{width:1280,height:850}` | Consistent viewport; width 320-3840 and height 240-2160. |
| `geo.mode` | `'live'` | `'live'` or explicitly `'synthetic'`. |
| `geo.allowKeyless` | `false` | Allow live provider requests without an API key. |
| `geo.timeoutMs` | `5000` | Per-provider-attempt timeout, 100-30000 ms. |
| `geo.maxLookups` | `200` | 1-5000 unique IP lookups per run, each with at most one retry. |
| `geo.fixtures` | `{}` internally | Synthetic mode only. Maps exact origins to countryCode, countryName, asn, asName. |

Use exact origins such as `https://api.example.test:8443`, not URL paths or suffix patterns. Credentials, queries, fragments and paths in an origin exclusion are rejected to prevent accidentally mis-scoping a fault.

## Step contract

```ts
interface JourneyStep {
  name: string;
  run(context: {
    page: import('playwright-core').Page;
    baseURL: string;
    signal: AbortSignal;
  }): Promise<void> | void;
}
```

An exception fails the step and skips later steps in that attempt. A resolved step is considered passed; the runner cannot tell whether your chosen assertions are meaningful. Use locator waits and explicit business assertions. Avoid arbitrary sleeps, shared mutable state and one-time-only backend actions.

## CI for your own app

Start your staging service before running the CLI and wait for its readiness. Provide the provider key through your CI secret store. Do not echo the key, commit `.env`, or publish reports containing real customer data. Upload `geochaos-reports` with an `always()` condition so failed experiments keep their evidence. Use a short artifact retention period.

The included workflow tests GeoChaos itself and its synthetic demo. It does not connect to your application or use a live API key. Adapt it after your application-specific journey works locally.
