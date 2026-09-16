# Verification record - GeoChaos v0.1.0

Recorded on September 16, 2026. This document distinguishes observed results from implementation paths that still need verification outside the build environment.

## Observed results

The final strict TypeScript compilation passed. The complete local test command was:

```bash
GEOCHAOS_CHROMIUM_PATH=/usr/bin/chromium \
GEOCHAOS_INLINE_TESTS=1 npm run check
```

| Suite | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: |
| Unit tests | 47 | 0 | 0 |
| Browser and CLI integration tests | 17 | 0 | 0 |
| Total | 64 | 0 | 0 |

The accompanying `VERIFICATION-v0.1.0-tests.txt` contains the command output. Unit tests cover configuration, IP eligibility, independent country/ASN states, synthetic provenance, provider response validation, authentication/rate-limit errors, timeout/retry behavior, caching, lookup budgets, redaction, scenario selection, report escaping, repetition and exit codes.

The integration suite ran real Chromium processes and local HTTP servers. It tested the fragile/fixed workflows, intercepted request counts, actual server-side request counters, fresh browser contexts, deadlines, cancellation, baseline gating, missing target exercise, partially bypassed interception, screenshot/diagnostic opt-out, CLI config loading, relative paths, and offline report controls. The report was checked at desktop (1360 px) and mobile (390 px) widths without document overflow.

### Included demonstration evidence

`sample-reports/index.html` links the generated reports and their evidence. Both variants use two journeys, two baseline repetitions, and four failure scenarios. Each variant has four baseline attempts and eight journey/scenario attempts: 24 real browser attempts in total.

| Result | Fragile application | Resilient application |
| --- | ---: | ---: |
| Passing baseline attempts | 4 | 4 |
| Passing journey/scenario pairs | 6 | 8 |
| Regressed journey/scenario pairs | 2 | 0 |
| Inconclusive pairs | 0 | 0 |

Only the fragile checkout fails when the recommendation origin is selected through its synthetic country or ASN. Browsing and analytics-failure scenarios pass. The resilient checkout passes every selected pair. These are measured results for the bundled demo, not a prediction about other applications.

All country/ASN labels in this demo are explicit fixtures. The observed addresses are actual loopback addresses; they are not replaced with invented public IPs. Local dependency requests really occur, and aborted requests do not reach the dependency servers. Screenshots show actual rendered browser states.

## Exact environment

| Component | Version used |
| --- | --- |
| Node.js | 22.16.0 |
| npm | 10.9.2 |
| TypeScript | 5.8.3 |
| Chromium | 144.0.7559.96, Debian build |
| Python Playwright distribution available in the environment | 1.57.0 |
| Its bundled Node driver metadata | 1.57.0-beta-1764944708000 |
| Runtime dependency targeted by the delivered package | npm playwright-core 1.57.0 |

The preinstalled Node driver was used via a local development symlink because registry access was unavailable. Its metadata was not changed. The source archive does not contain that symlink, node_modules, third-party font files, or browser executables. The exact stable npm package named in the manifest was not installed from the registry here; testing a related preinstalled driver is not a clean-install verification of that package.

## Verification boundaries

### Main-document navigation

The environment's managed Chromium blocks top-level navigation. A normal demo attempt failed its baseline with `ERR_BLOCKED_BY_ADMINISTRATOR`; GeoChaos correctly refused to run failure scenarios from that baseline. No browser policy was changed or circumvented.

Successful demo and browser integration runs used the explicit inline mode. This mounts the bundled application document using Playwright `setContent`, while still making real HTTP subresource requests to the local services. Every delivered demo report discloses that top-level navigation was not tested. Normal `page.goto` execution is implemented, but the ordinary navigation workflow needs to be run on an authorized, unrestricted development machine.

### Live IP2Location.io calls

No real authenticated or keyless IP2Location request was verified from this environment. The provider implementation was exercised with controlled HTTP-response mocks, and integration tests confirmed that local/private IPs are not sent for lookup. A real API key is neither included nor required by the demo. Live credentials, quotas, network access, and provider behavior must be checked separately.

### Dependency installation and CI

Registry network access was unavailable. Development dependencies came from the existing offline cache, and the browser driver came from the preinstalled distribution described above. A fresh `npm ci`, fresh browser download, and GitHub Actions execution were not performed.

The lockfile pins the intended runtime package and its canonical registry URL, but the `playwright-core` entry does not contain an integrity digest because its tarball could not be retrieved. No digest was fabricated. Before publication, regenerate/refresh the lockfile with registry access, inspect the result, and verify a clean install using the exact pinned package. The supplied CI workflow is an implementation artifact, not evidence that a hosted CI run passed.

## Pre-release checks on your development machine

Keep your own credentials outside source control. From a fresh copy, with network access:

```bash
npm install --package-lock-only
npm ci
npm run build
npm run browser:install
npm run check
npm run demo
```

Do not set `GEOCHAOS_INLINE_TESTS` for this verification. A compatible Chromium installation and any required operating-system dependencies are necessary. Inspect the resulting lockfile for a runtime integrity digest; regenerate it from the pinned manifest if npm retains the incomplete entry.

Then verify the live provider and your own authorized staging journey:

```bash
export IP2LOCATION_API_KEY='your-own-key'
node dist/cli.js lookup 8.8.8.8
node dist/cli.js init
# Edit geochaos.config.mjs: base URL, owned origins, and real journey assertions.
node dist/cli.js run --config geochaos.config.mjs
```

An all-local application will have no eligible public-IP groups in live mode. That should produce an incomplete/no-scenarios outcome, not a successful geographic test. Use an authorized application with actual external public-IP dependencies to verify live grouping and fault execution.

Finally, review the report's exact frozen targets, exercise each scenario, check privacy and attribution requirements, and publish the original source under an appropriate repository name before submitting the contest form. Nothing has been published or submitted on your behalf.
