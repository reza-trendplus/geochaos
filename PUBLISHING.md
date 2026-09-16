# Publish GeoChaos and submit the contest entry

These instructions publish a public repository on **your** account. They do not
submit the contest form automatically. Replace `YOUR_GITHUB_USERNAME` everywhere
with your GitHub username. The suggested repository name is `geochaos`.

The repository includes the requested disclosure: **Vibe coded with ChatGPT Pro 6.**
See CREDITS.md for its meaning and the maintainer's responsibilities.

## 1. Install prerequisites and personalize

Install Node.js 22 or newer, Git, and GitHub CLI from their official sites:

- https://nodejs.org/en/download
- https://git-scm.com/downloads
- https://cli.github.com/

On Windows, use Git Bash for the shell examples below. PowerShell can run the
same Node/npm commands; its environment-variable syntax differs.

Extract the archive and open a terminal inside the `geochaos` directory:

```bash
cd geochaos
node scripts/personalize.mjs YOUR_GITHUB_USERNAME/geochaos
```

This configures package metadata, README source/demo links, and the publishing
account in CREDITS.md. It does not log in, create a repository, change the license,
claim a human audit, or push anything. Keep the MIT notice and review the listed
third-party licenses. Add truthful maintainer details before submission.

## 2. Install and verify before publishing

```bash
npm run setup
npm run browser:install
npm run check
npm run demo
npm run site:build
npm run release:check
```

`setup` installs the pinned dependencies. It also fills the original archive's
missing Playwright integrity metadata using npm; it preserves pinned versions and
restores the old lockfile if repair fails. Review and commit the resulting
`package-lock.json`. Once repaired, ordinary `npm ci` is sufficient for subsequent
clean installs. Registry access and a browser download are required.

On Linux, a missing browser-library error may require:

```bash
npx playwright-core install --with-deps chromium
```

The demo must report two regressions for the fragile checkout and zero for the
fixed checkout. Its successful exit status is zero because those differences are
expected; an ordinary `run` exits one for a regression. Open the comparison HTML
printed by the command. Open `_site/index.html` to preview the public landing page.

Do not use `GEOCHAOS_INLINE_TESTS=1` to claim ordinary-navigation verification.
The bundled historical samples are disclosed inline-mode runs. Do not infer that
GitHub Actions passed until you see a successful run in your own repository.

### Verify the actual sponsor integration

The synthetic demo is useful to judges but does not demonstrate a live API call.
Use your own key locally:

```bash
cp .env.example .env
# Edit .env locally to add your key. Never add the key to Git or the contest form.
node --env-file=.env dist/cli.js lookup 8.8.8.8
node dist/cli.js init
# Edit geochaos.config.mjs for your authorized staging app and real assertions.
node --env-file=.env dist/cli.js run --config geochaos.config.mjs
```

Use an authorized test app with observed external public-IP dependencies. A purely
local app cannot produce live geographic groups. Examine the report and its
coverage warnings; a standalone lookup alone does not verify the whole workflow.
The generated `.env` and root journey config are ignored by Git. Review screenshots
and application actions; test journeys can create real orders or account changes.

## 3. Create the public GitHub repository

Authenticate interactively, without putting a token in a command or file:

```bash
gh auth login --hostname github.com --git-protocol https --web --scopes workflow
gh auth setup-git

git init -b main
git add .
git status --short
npm run release:check
git diff --cached --stat
```

**Stop and review the staged files.** Do not stage credentials, private reports,
customer screenshots, or local `node_modules`. The release checker catches common
file names, not every possible secret. Keep `sample-reports`: those are the original
synthetic evidence used by the public demo. Keep `.github` and `package-lock.json`.

If Git requests your identity, set it locally using your real name or preferred
public handle and the email or GitHub no-reply address you want on the commit:

```bash
git config user.name "YOUR NAME OR HANDLE"
git config user.email "YOUR COMMIT EMAIL"
```

Then publish:

```bash
git commit -m "Release GeoChaos v0.1.1 with disclosed AI-assisted development"
gh repo create YOUR_GITHUB_USERNAME/geochaos --public --source=. --remote=origin --push --description "IP2Location-powered dependency failure testing for web apps. Vibe coded with ChatGPT Pro 6."
gh repo view --web
```

That `gh repo create` command is for a **new repository**. If you already created
an empty one, use `git remote add origin https://github.com/YOUR_GITHUB_USERNAME/geochaos.git`
and `git push -u origin main` instead. Do not initialize that remote with a README
or license; the project already includes both. Do not use force-push to resolve an
existing repository with unrelated history; use a new name instead.

Your source link, after the push succeeds, will be:

```text
https://github.com/YOUR_GITHUB_USERNAME/geochaos
```

Open **Actions > Build and test** and verify that the run succeeds. It installs
packages and Chromium, runs both suites, builds the site, and runs the ordinary
navigation demo. It does not perform authenticated API calls or a live staging run.

## 4. Enable the public demo page (optional but useful)

In the repository, open **Settings > Pages**. Under **Build and deployment**, set
**Source** to **GitHub Actions**. Then open **Actions > Deploy demo site > Run workflow**
and choose `main`.

The included Pages workflow is intentionally manual. It builds `_site` without
an API key or npm installation, checks the allowlisted historical demo artifacts,
and uploads only `_site`. It never copies `geochaos-reports`, `.env`, or your whole
repository. Run it again manually after changes you want reflected on the site.

Use the deployment URL displayed by the workflow or Settings > Pages. For an
ordinary account repository named `geochaos`, the expected form is:

```text
https://YOUR_GITHUB_USERNAME.github.io/geochaos/
```

Check the page and both report links in a signed-out browser. Pages is a static
showcase, not a hosted version of the CLI or a service that accepts arbitrary URLs.
The page includes the requested AI credit and visible IP2Location attribution.

Set the repository's About website to that verified URL, for example:

```bash
gh repo edit --homepage "https://YOUR_GITHUB_USERNAME.github.io/geochaos/" --add-topic ip2location --add-topic chaos-engineering --add-topic playwright --add-topic typescript --add-topic resilience-testing
```

## 5. Tag a reproducible release

After the checks above pass and all final changes are committed and pushed:

```bash
git tag -a v0.1.1 -m "GeoChaos v0.1.1"
git push origin v0.1.1
gh release create v0.1.1 --verify-tag --title "GeoChaos v0.1.1" --notes-file docs/RELEASE_NOTES.md
```

A tag fixes the exact source revision you demonstrated. Do not reuse a tag to hide
later changes; publish a new version for a changed release. GitHub creates source
archive links for the release. There is no requirement to publish an npm package.

## 6. Submit the repository URL to the contest

Open the organizer's actual form:

**https://contest.ip2location.com/submission**

Copy the ready-to-use title, short description, and remarks from
[docs/CONTEST_ENTRY.md](docs/CONTEST_ENTRY.md). Use the **repository root URL** for
**Source Code URL**, not the Pages URL, a ZIP download, the winners page, or a local
file path. Add the working Pages URL and tagged release link to **Remarks**.
Fill in your real name, email, and how you heard about the contest yourself.
Read and accept the terms only after reviewing them. Save the confirmation.

The terms list July 1-September 30, 2026, while the homepage says to submit before
September 30. No closing timezone is specified in the visible text. A conservative
personal target is **September 29, 2026 or earlier**; that is a recommendation, not
an organizer-announced deadline change. Follow the organizer's listed social-account
instructions. Public promotion is optional; never buy or fabricate GitHub stars.

The published terms do not explicitly address AI-assisted entries. They require
original work and intellectual-property rights and contain publicity and indemnity
provisions. Disclosing AI assistance does not establish eligibility. Ask the organizer
whether this development process is eligible before relying on that assumption.
A draft question is included in docs/CONTEST_ENTRY.md; it has not been sent.

## Official references (checked September 16, 2026)

- GitHub publication: https://docs.github.com/en/migrations/importing-source-code/using-the-command-line-to-import-source-code/adding-locally-hosted-code-to-github
- GitHub CLI repository creation: https://cli.github.com/manual/gh_repo_create
- GitHub CLI authentication: https://cli.github.com/manual/gh_auth_login
- GitHub Pages workflow: https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
- GitHub release creation: https://cli.github.com/manual/gh_release_create
- Contest: https://contest.ip2location.com/
- Terms: https://contest.ip2location.com/terms-and-conditions
- Submission form: https://contest.ip2location.com/submission
