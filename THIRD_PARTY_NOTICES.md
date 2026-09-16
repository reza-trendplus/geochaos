# Third-party notices

The GeoChaos source and original synthetic demonstration are MIT-licensed.

Runtime and development dependencies are installed separately by npm:

| Package | Pinned version | License |
| --- | --- | --- |
| playwright-core | 1.57.0 | Apache-2.0 |
| typescript | 5.8.3 | Apache-2.0 |
| @types/node | 22.15.33 | MIT |
| undici-types (transitive development dependency) | See package-lock.json | MIT |

Consult the licenses distributed with those packages. Their upstream copyright and license notices remain applicable. The source archive does not bundle node_modules, third-party font files, browser executables, or a licensed IP geolocation database.

The environment used to verify this implementation already contained a Playwright 1.57-family Node driver from the Python Playwright installation. The exact driver metadata and verification boundaries are documented in docs/VERIFICATION.md; it was not relabeled as the pinned npm package.

IP2Location.io is an external service governed by its own terms and data licensing. No sponsorship, endorsement, or official association is implied. GeoChaos retains visible provider attribution in generated reports.
