# Verification record - GeoChaos v0.1.1

Recorded September 16, 2026. These are observed local results, not a claim that
GitHub Actions, a fresh registry installation, the live API, or a public deployment
has passed. Historical v0.1.0 sample metadata is deliberately preserved.

## Tests run for this release

```bash
GEOCHAOS_CHROMIUM_PATH=/usr/bin/chromium \
GEOCHAOS_INLINE_TESTS=1 npm run check
```

| Suite | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Unit tests | 63 | 0 | 0 |
| Browser/CLI integration and landing-page tests | 18 | 0 | 0 |
| **Total** | **81** | **0** | **0** |

The exact output is in [VERIFICATION-v0.1.1-tests.txt](VERIFICATION-v0.1.1-tests.txt).
TypeScript compilation passed. The 16 new unit tests cover repository validation,
HTML escaping, repeatable personalization, lockfile metadata repair and rollback,
allowlisted demo publication, rejection of tampered/live evidence, and path safety.
Repair tests use controlled mock npm results; they do not verify registry access.

The browser suite exercises actual local HTTP requests, interception, assertions,
step deadlines, cancellation, fresh contexts, baseline gating, incomplete coverage,
report controls, and CLI behavior. The fragile demo has two regressed journey/scenario
pairs; the resilient demo has none. Both have four passing baseline attempts and
eight tested journey/scenario pairs. These are bundled-fixture results, not a claim
about an arbitrary website.

The added landing-page test rendered the generated HTML at 1360, 768, 390, and 320
pixels wide, with no document overflow, broken preview images, browser script errors,
or external HTTP asset requests. Its AI credit was present at all four widths.
The test uses an inline document with embedded local assets; it is not a deployed
Pages test or a comprehensive accessibility audit. A visual preview is saved in
[site-preview.png](site-preview.png).

## Exact local environment

| Component | Used here | Intended package manifest |
| --- | --- | --- |
| Node.js | 22.16.0 | 22 or newer |
| npm | 10.9.2 | Supplied with Node |
| TypeScript | 5.8.3 | 5.8.3 |
| Node type declarations | 24.0.4, preinstalled | 22.15.33 |
| Playwright Node driver | 1.57.0-beta-1764944708000, from the preinstalled Python distribution | Stable npm playwright-core 1.57.0 |
| Chromium | 144.0.7559.96, Debian system browser | Browser installed by the pinned Playwright package |

Preinstalled packages were linked locally for testing because npm registry DNS
resolution was unavailable. The archive contains no node_modules, development
symlinks, browser binaries, or font files. Passing with this environment is not
clean-install verification of the exact pinned npm dependencies.

## Checks still required before submission

### Ordinary page navigation

An ordinary-navigation demo was attempted again for v0.1.1. Chromium returned
`ERR_BLOCKED_BY_ADMINISTRATOR`; baselines failed, scenarios were correctly withheld,
and the CLI returned exit 2. No browser policy was modified. Successful browser
application tests used the disclosed inline demo mode. Run `npm run check` and
`npm run demo` without `GEOCHAOS_INLINE_TESTS` on your authorized development
machine or GitHub Actions to verify the ordinary path.

### Clean installation and lockfile

The archive still lacks the runtime package's npm integrity digest; none was
invented. `npm run setup` is implemented to refetch missing metadata for the pinned
version, verify that versions remain unchanged, restore the original lockfile on
caught repair failures, and then run `npm ci`. Its network path has not been run
successfully here. Run it with registry access, inspect/commit the refreshed lock,
and verify the exact pinned build and tests. `npm run release:check` intentionally
flags the missing digest until it is repaired.

### Live IP2Location integration

No authenticated or keyless live API request has been verified here. The provider
is implemented and tested with mocks, including errors, limits and response
validation. Run a lookup using your own key, then run a complete journey against
an authorized staging application with observed external public-IP dependencies.
A standalone lookup or an all-local demo is not proof of the whole live workflow.
Keep the key and real application output out of Git and public reports.

### Hosted GitHub workflows and publication

The CI and manual Pages workflows are included but have not been run on a hosted
GitHub runner. The site builder and its local-link/allowlist tests passed locally.
The release checker correctly flags absent publishing-account metadata; use
`scripts/personalize.mjs` to configure your actual account before publishing.
No repository, release, Pages site, or contest entry has been created on your behalf.

## Public historical samples

The public landing page uses only the content-addressed files in
`site/demo-manifest.json`. These are the original v0.1.0 synthetic, inline-mode
reports, not new v0.1.1 reports or live IP2Location data. Their original versions,
timestamps, loopback addresses, and limitations are preserved. Newly generated
`geochaos-reports` are not automatically made public.

The earlier measurement record is retained in
[VERIFICATION-v0.1.0.md](VERIFICATION-v0.1.0.md), with its original test output.

Follow [PUBLISHING.md](../PUBLISHING.md) for the complete pre-submission sequence.
