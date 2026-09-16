# Security and privacy

## Authorized systems and meaningful isolation

GeoChaos aborts requests inside a fresh Playwright browser context. It does not modify host firewalls, production infrastructure, DNS records, or other users' traffic. Browser policy restrictions are never disabled by the application.

This does not sandbox your application actions. Each baseline and scenario can place orders, create accounts, trigger email, or perform any action you program. Use a test/staging deployment, synthetic accounts, non-production payment integrations and idempotent/resettable test data. Fresh cookies do not reset server-side state.

## Trusted executable configuration

A `.mjs` config is Node.js code with the process's privileges. Do not load untrusted config files or journey modules. Journey code can call Node APIs and is not restricted to the provided Page. Review dependencies before installation and use an appropriately isolated development environment.

Step deadlines cancel the supplied signal and close the browser context after capture. They cannot preempt an infinite synchronous loop in arbitrary Node code or undo application side effects. Journey implementations should honor the cancellation signal for their own background operations.

## Credentials

Provide `IP2LOCATION_API_KEY` through an environment variable or a secrets manager. The live provider sends it in an Authorization header to a fixed HTTPS endpoint, rejects redirects, and does not store it in the config snapshot or report. Only a safe subset of response fields is persisted. Provider error bodies are not copied into evidence.

Console capture is off by default. Additional sensitive strings can be added to `redact`. Redaction removes known exact secrets, common credential patterns, email-shaped strings, and URL paths/queries from diagnostics. It is best-effort, not a complete sensitive-data detector. Do not put secrets in journey names, step names, hostnames or assertion descriptions.

## Reports are potentially sensitive

Network observations retain origins, IP addresses, aggregate counts, HTTP error status codes and resource types. Request paths, queries, headers, cookies, authorization values and bodies are not collected by the network recorder. Origin hostnames themselves can still be sensitive.

Screenshots, assertion output and optional console messages can contain user information or proprietary data. Use `screenshots: 'off'` or `screenshotMasks` where appropriate. Mask selectors apply to the primary page screenshot; review screenshots with cross-origin frames and popups separately. Do not publish reports unreviewed. API-derived labels are subject to the provider's terms.

The HTML renderer escapes untrusted text, embeds local screenshots only from validated generated paths, avoids raw report JSON in executable scripts, and supplies a restrictive Content Security Policy. It uses no analytics, external assets, fonts, or background network calls. Attribution links only contact their destination when followed.

## Network scope

Country and ASN labels choose exact origins from baseline observations, not broad IP ranges. The application's base origin is always protected; additional first-party and user-excluded origins match exactly. A subdomain is not automatically trusted just because it shares a suffix. Use the canonical application URL, and explicitly protect owned redirect destinations where appropriate.

Private/special-use IPs are excluded from external provider lookups using a conservative heuristic, not an authoritative security/routing classifier. There is no DNS fallback that invents a location when the actual response address is missing. Mixed and incomplete classifications remain visible rather than being forced into a scenario.

HTTP(S) routing does not cover all networking. Observed missing/bypassed target faults are inconclusive, but GeoChaos cannot prove the absence of unobserved traffic. It is not a DLP, compliance or production access-control system.

## Reporting a problem

Before publishing this as your own repository, add a maintainer contact and enable a private vulnerability reporting channel. Do not post API keys or private reports in public issues.
