# Architecture and interpretation

## Pipeline

```text
Trusted .mjs config
       |
       v
Repeated baseline journeys in fresh browser contexts
       |
       +-- any failed/inconclusive baseline --> report, exit 2, no injection
       |
       v
Aggregate observed response IPs by exact HTTP(S) origin
       |
       v
IP2Location.io: country + country name + ASN + AS name
       |
       v
Per-axis known / mixed / partial / unknown classification
       |
       v
Freeze fully classified country/ASN origin groups
       |
       v
Repeat the same steps, aborting selected origin requests
       |
       v
Verify actual fault exercise and complete capture
       |
       v
Aggregate attempts --> HTML + JSON + screenshots + exit code
```

## Source map

| Module | Responsibility |
| --- | --- |
| `src/config.ts` | Strict configuration validation, normalization and exact-origin handling. |
| `src/ip.ts` | Canonical IPv4/IPv6 addresses and conservative external-lookup eligibility. |
| `src/geo.ts` | Fixed-endpoint IP2Location client, in-run caching, request timeouts, retries and lookup budget. |
| `src/scenarios.ts` | Observation aggregation, independent country/ASN classification and deterministic target planning. |
| `src/runner.ts` | Browser/context lifecycle, response address capture, request interception, step deadlines, screenshots and baseline gate. |
| `src/summary.ts` | Repetition-aware result cells, relevance checks and exit semantics. |
| `src/report.ts` | Escaped self-contained HTML, embedded screenshots, interactive filtering and JSON output. |
| `src/demo.ts` | Original local storefronts and synthetic dependency labels; normal and inline-document demo modes. |
| `src/cli.ts` | `init`, `run`, `demo`, `lookup` and `doctor` commands. |

## Baseline and dependency identity

Origin identity is exactly scheme + hostname + port. A response address is obtained from Playwright `response.serverAddr()`, not a speculative DNS query. The recorder attaches at the browser-context level so it can observe requests from multiple pages in the context. It aggregates rather than keeping unbounded individual request logs. Capturing more than 500 distinct origins makes a run inconclusive.

The baseline is repeated twice by default. That catches some instability but is not a statistical guarantee. All configured baselines must pass before fault injection. Browser state is isolated by fresh contexts; backend state is the application's responsibility.

A dependency may contact more than one observed IP. Per grouping axis, labels are:

- **Known:** every relevant recorded address is classified and agrees.
- **Mixed:** more than one distinct known value is present.
- **Partial:** one known value is present, but some addresses or observations lack coverage.
- **Unknown:** no usable value is available.
- **Excluded:** protected first-party or explicitly excluded origin.

A mixed country is independent of a known ASN. Country scenarios exclude that origin while an ASN scenario can still use it. Failed baseline requests and missing response addresses cause partial/unknown coverage rather than optimistic guesses.

Synthetic mode assigns labels by exact origin. This lets multiple local services on different ports represent different *fictional* groups while retaining their true loopback addresses. Synthetic records are never described as live API results.

## Scenario semantics

The target set is frozen from the baseline. A country-DE scenario means "abort requests to these baseline-classified origins," not "abort every packet currently destined for Germany." The same origin remains targeted if its DNS changes. Newly appearing origins are not silently added; they are reported outside the frozen scope and make overall coverage incomplete.

The base application origin is always protected. No option silently removes that protection. Owned subdomains/ports and canonical redirect destinations must be explicitly listed where needed. Third-party authentication origins are not automatically exempt.

Each scenario reruns relevant journeys only. Relevance comes from actual baseline requests, not static URLs in source code. N/A means the journey never used this group in its baselines. A relevant run must actually abort at least one target request before its functional outcome can be considered conclusive. Any observed target request not aborted makes the result inconclusive, even if another target request was successfully aborted.

Country and ASN scenarios with identical origins are both retained, so the classification explanation remains explicit. This costs extra runs; it is bounded by `maxScenarios` and optional filters. There is no unsupported probabilistic resilience score.

## Fault mechanics and boundaries

The runner installs `BrowserContext.route('**/*')` in both baseline and scenario phases. Playwright routing disables the HTTP cache, so the phases have consistent cache behavior. Service workers are blocked in both phases. These settings are recorded in every report.

Selected requests are aborted with Playwright's `failed` error. No remote service is shut down and no other process's traffic is modified. Contexts are closed after capture, including deadline/cancellation paths.

Redirect follow-up requests can escape ordinary Playwright route interception. GeoChaos checks observed target requests versus completed aborts and marks bypassed attempts inconclusive instead of claiming success. It does not pretend to be an OS-level fault injector. Browser response IPs can also reflect proxies or CDN edges rather than true application origins.

WebSockets and WebRTC are not faulted. Observed WebSockets trigger an incomplete-coverage warning. Node-side requests, direct `context.request` operations, browser-internal traffic, hidden backend calls, and real global outages are outside scope. Screenshots capture the primary page viewport after each attempt; other context pages are not individually screenshotted.

The per-step asynchronous deadline does not interrupt infinite synchronous Node code. The supplied signal should be used by custom async work. Browser operations are stopped when the context is closed, but external side effects cannot be undone.

## Outcome aggregation

A matrix cell is a journey/scenario pair. Consistent passing attempts produce PASS. Consistent failed attempts with exercised targets produce FAIL. Disagreement, absent attempts, missing injection, or instrumentation errors produce INCONCLUSIVE. A missing baseline relationship produces N/A.

The process returns 1 for observed regression cells, even if coverage is also incomplete. It returns 0 only when the baseline gate passed, all selected scenarios and configured repetitions completed, at least one scenario exists, classification/instrumentation coverage is complete, and no cell is failed or inconclusive. All other cases return 2. This is a workflow contract, not a general resilience certification.

A failed assertion during an injected failure is evidence of a regression under that experiment, not automatic proof that one particular source-code line caused it. Repetition and baseline stability reduce ambiguity but do not eliminate it.

## Cost and storage

Live lookup results are cached only in memory and deduplicated by canonical IP. The default budget is 200 unique public IPs, with at most one retry each. Authentication failures stop subsequent requests; rate-limit responses are retried once, then stop further requests. The provider's current account limits remain authoritative.

Reports persist only the normalized subset needed to explain classification. They do not contain a provider database or raw response dump. Generated run directories and evidence files request private filesystem permissions where supported. No credentials, vendor font files, or browser binaries are included in the distributed source archive.
