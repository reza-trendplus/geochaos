import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isMain, managedBlock, readJson, validateRepository } from './release-utils.mjs';

export async function personalize(root, slug) {
  const repo = validateRepository(slug);
  const pkg = await readJson(join(root, 'package.json'));
  const readme = await readFile(join(root, 'README.md'), 'utf8');
  const credits = await readFile(join(root, 'CREDITS.md'), 'utf8');
  // Validate every edit before writing. Running twice updates the same blocks.
  const newReadme = managedBlock(readme, 'project-links',
    `[Source](${repo.url}) | [Demo site](${repo.pages}) | [Publish your copy](PUBLISHING.md) | [AI disclosure](CREDITS.md)`);
  const newCredits = managedBlock(credits, 'maintainer',
    `Publishing account: [@${repo.owner}](https://github.com/${repo.owner}).
Repository: [${repo.slug}](${repo.url}).

This identifies the publishing account; it does not assert that a human review or
security audit has already occurred.`);
  pkg.repository = {type:'git', url:`git+${repo.url}.git`};
  pkg.homepage = repo.pages;
  pkg.bugs = {url:`${repo.url}/issues`};
  pkg.geochaos = {repository:repo.slug};
  await writeFile(join(root, 'package.json'), JSON.stringify(pkg, null, 2) + '\n');
  await writeFile(join(root, 'README.md'), newReadme);
  await writeFile(join(root, 'CREDITS.md'), newCredits);
  return repo;
}

if (isMain(import.meta.url)) {
  if (process.argv.length !== 3) {
    console.error('Usage: node scripts/personalize.mjs YOUR_GITHUB_USERNAME/geochaos');
    process.exitCode = 2;
  } else {
    personalize(dirname(dirname(fileURLToPath(import.meta.url))), process.argv[2])
      .then(repo => console.log(`Configured ${repo.slug}
Source: ${repo.url}
Demo (after Pages deployment): ${repo.pages}
No remote repository was created and nothing was pushed.`))
      .catch(error => { console.error(error.message); process.exitCode = 2; });
  }
}
