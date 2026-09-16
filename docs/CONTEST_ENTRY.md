# Contest submission copy

Replace every example account/URL before pasting. Do not claim a live verification,
human review, or successful CI run that has not actually happened.

## Project Title

GeoChaos - Geographic Dependency Failure Testing

## Short Description

GeoChaos is an open-source TypeScript tool that turns IP2Location.io country and ASN
intelligence into controlled browser failure tests. It observes dependencies during
passing Playwright journeys, groups their origins by reported geography or network,
then reruns the same assertions while selected requests are blocked. HTML and JSON
reports show broken journeys, exact targets, screenshots, and coverage warnings.
A reproducible storefront demo compares a fragile checkout with a resilient fix.

## Source Code URL

```text
https://github.com/YOUR_GITHUB_USERNAME/geochaos
```

Use the public repository root, not the website or archive URL.

## Remarks

```text
Vibe coded with ChatGPT Pro 6. AI-assisted development is disclosed in CREDITS.md.
MIT-licensed TypeScript CLI/library, with source, tests, setup instructions and
visible IP2Location attribution.

Demo: https://YOUR_GITHUB_USERNAME.github.io/geochaos/
Release: https://github.com/YOUR_GITHUB_USERNAME/geochaos/releases/tag/v0.1.1

The public sample reports use synthetic geographic labels and actual local
Chromium requests, request blocking, assertions and screenshots. They were
captured in inline mode; ordinary top-level navigation is not represented in
those historical samples. Live mode integrates the real IP2Location.io API.
See docs/VERIFICATION.md and the repository's Actions for verification evidence
and limits. No contest-organizer approval or endorsement is claimed.
```

Remove a demo/release line until its link actually works. Keep the AI disclosure.
Append your own dated live-integration/ordinary-navigation results only after you
have reproduced them. Add a screen-recording link only after publishing the video.

## A shorter description for a restrictive form field

GeoChaos uses IP2Location.io country and ASN data to group browser dependencies,
inject controlled failures, and reveal broken user journeys. Its TypeScript CLI
produces HTML/JSON evidence and includes a fragile-versus-fixed storefront demo.

## Why the sponsor integration is essential

In live mode, IP2Location.io classifications determine which observed public-IP
dependencies enter country and ASN scenarios. Without them, GeoChaos cannot produce
those geographic/network groups. API error handling and incomplete-coverage warnings
are in the test workflow, not a decorative lookup page. The synthetic demo is for
reproducibility, not a replacement for demonstrating the actual provider integration.

## A 90-second demonstration outline

Show the passing baseline; open the fragile checkout's failed recommendation-group
scenario; inspect the exact target and browser screenshot; show the same scenario
passing in the resilient implementation. Disclose synthetic labels and sample mode.
Then show your separately verified real IP2Location lookup and authorized staging
run. Never expose the key, customer data, or private authentication information.

## Optional announcement

```text
I built GeoChaos: an open-source tool that turns IP2Location.io country and ASN
intelligence into browser dependency-failure tests.

The demo shows an optional recommendation widget breaking checkout, then verifies
a fix under the same experiment. The demo geography is synthetic; the browser
failures and assertions are real.

Vibe coded with ChatGPT Pro 6. AI-assisted development is openly disclosed.
Source: https://github.com/YOUR_GITHUB_USERNAME/geochaos
Demo: https://YOUR_GITHUB_USERNAME.github.io/geochaos/

#ProgrammingContest #IP2LocationContest
```

## Draft question about AI-assisted entries

Subject: 2026 contest eligibility - AI-assisted open-source submission

Hello IP2Location team,

I am preparing GeoChaos, an MIT-licensed TypeScript tool that uses IP2Location.io
country and ASN data to generate controlled browser dependency-failure scenarios.
The project was developed with substantial ChatGPT assistance, which is disclosed
in the repository. I will review the code, dependencies, licensing, and test results
before submitting. Are AI-assisted projects eligible for the 2026 programming
contest, and do you require any additional disclosure?

Thank you.

This is a draft, not a sent message. Adjust the review statement to your actual
status. Use the organizer's contact link on https://contest.ip2location.com/.

## Organizer references

Checked September 16, 2026:

- Submission: https://contest.ip2location.com/submission
- Terms: https://contest.ip2location.com/terms-and-conditions
- Contest/deadline wording: https://contest.ip2location.com/

The terms do not explicitly address AI assistance. They require original work and
necessary IP rights; no eligibility determination is made here. They also mention
creativity, functionality and GitHub stars in judging. Do not manufacture engagement.
No claims are made that the concept is globally novel or will win.
