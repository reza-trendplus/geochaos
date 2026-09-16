import { readFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readJson, missingIntegrity, validateRepository } from './release-utils.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
let failures = 0;
const check = async (name, fn) => {
  try { await fn(); console.log(`PASS  ${name}`); }
  catch (error) { failures++; console.error(`CHECK ${name}: ${error.message}`); }
};
await check('Repository metadata', async () => {
  const pkg = await readJson(join(root, 'package.json'));
  const repo = validateRepository(pkg.geochaos?.repository);
  if (pkg.repository?.url !== `git+${repo.url}.git`) throw new Error('Run scripts/personalize.mjs again.');
});
await check('Version consistency', async () => {
  const pkg = await readJson(join(root, 'package.json'));
  const lock = await readJson(join(root, 'package-lock.json'));
  const source = await readFile(join(root, 'src/version.ts'), 'utf8');
  if (pkg.version !== lock.version || pkg.version !== lock.packages[''].version || !source.includes(`'${pkg.version}'`))
    throw new Error('package.json, package-lock.json and src/version.ts disagree.');
});
await check('Lockfile integrity metadata', async () => {
  const missing = missingIntegrity(await readJson(join(root, 'package-lock.json')));
  if (missing.length) throw new Error(`Run npm run setup with registry access. Missing: ${missing.join(', ')}`);
});
await check('Release documentation', async () => {
  for (const file of ['README.md','LICENSE','CREDITS.md','SECURITY.md','PUBLISHING.md','docs/CONTEST_ENTRY.md','docs/VERIFICATION.md'])
    await access(join(root, file));
});
await check('Tracked private/local files', async () => {
  const result = spawnSync('git', ['ls-files', '-z', '--cached'], {cwd:root, encoding:'utf8'});
  if (result.status !== 0) { console.log('      Not a Git repository yet; repeat after git add.'); return; }
  const bad = result.stdout.split('\0').filter(name => name && (
    /(^|\/)(node_modules|geochaos-reports|_site|test-results|playwright-report)\//.test(name) ||
    /(^|\/)\.env(?:\.|$)/.test(name) && !name.endsWith('/.env.example') && name !== '.env.example' ||
    /\.(pem|key)$/.test(name) || /(^|\/)geochaos\.config\.mjs$/.test(name) && !name.startsWith('examples/')
  ));
  if (bad.length) throw new Error(`Remove these from the Git index, not your disk: ${bad.join(', ')}`);
});
console.log('\nThis checks packaging, not runtime correctness, ownership, eligibility or every possible secret.');
console.log('Also run npm run check, npm run demo, and a live provider/staging test before submission.');
process.exitCode = failures ? 2 : 0;
