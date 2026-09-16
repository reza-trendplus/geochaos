# Contributing

Use Node.js 22 or newer. Run `npm run setup`, `npm run browser:install`, and
`npm run check`. Browser tests use only local demo services and synthetic labels;
no API key is required. Run `npm run demo` on a machine that allows ordinary
browser navigation, then inspect both reports before proposing behavioral changes.

Use a focused branch, add a regression test, and describe the behavior change and
its verification. Never remove coverage warnings just to make an outcome pass.
Preserve the distinction between an observed location label and physical geography.

Keep credentials, private staging URLs, customer screenshots, and real reports out
of issues and pull requests. The public Pages build intentionally publishes only
allowlisted historical synthetic fixtures, not arbitrary new test output.

AI-assisted contributions are welcome, but disclose material assistance and review
what you submit. Do not invent test results. State explicitly when live API calls,
ordinary navigation, or a clean installation were not verified.

See SECURITY.md for security reporting and CREDITS.md for development attribution.
