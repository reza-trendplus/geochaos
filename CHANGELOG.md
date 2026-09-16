# Changelog

## 0.1.1 - 2026-09-16

### Publication polish

- Add a judge-facing static site with allowlisted, checksum-verified historical
  demo evidence, responsive layout, visible limitations, and IP2Location attribution.
- Add an opt-in GitHub Pages workflow. Only the generated `_site` directory is
  uploaded; private run output and API credentials are not included by that build.
- Add repository personalization, setup/lockfile-repair, and release-readiness tools
  with unit tests. No publishing script pushes commits or submits the contest form.
- Add publishing instructions, ready-to-paste contest fields, contribution guidance,
  issue templates, and the requested credit: "Vibe coded with ChatGPT Pro 6."
- Centralize the application version and preserve historical v0.1.0 report metadata.
- Ignore local journey configuration and common credential files by default.

### Verification boundaries

The shipped samples are historical synthetic, inline-mode runs. A fresh registry
installation, ordinary browser navigation, hosted GitHub Actions, and the live API
must still be verified by the publishing maintainer. See docs/VERIFICATION.md.
The archive's incomplete runtime integrity metadata is repaired by `npm run setup`
using the pinned package and npm registry; no integrity value is fabricated.

## 0.1.0 - 2026-09-16

Initial CLI/library implementation: observed browser IP inventory, country/ASN
scenario selection, baseline gating, isolated browser fault injection, HTML/JSON
reports, fragile/fixed storefront demo, and unit/browser integration tests.
