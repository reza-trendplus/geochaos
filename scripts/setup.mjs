import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { isMain, missingIntegrity, readJson } from './release-utils.mjs';

/** Repair only absent lockfile metadata. Restore the original on any failure. */
export async function repairLockfile(root, npm) {
  const path = join(root, 'package-lock.json');
  const original = await readFile(path, 'utf8');
  const lock = JSON.parse(original);
  const missing = missingIntegrity(lock);
  if (!missing.length) return false;
  const expected = Object.fromEntries(Object.entries(lock.packages).map(([key, data]) => [key, data.version]));
  // Removing incomplete entries makes npm fetch the pinned package metadata.
  for (const name of missing) delete lock.packages[name];
  try {
    await writeFile(path, JSON.stringify(lock, null, 2) + '\n');
    await npm(['install', '--package-lock-only', '--ignore-scripts', '--no-audit', '--no-fund']);
    const repaired = await readJson(path);
    if (missingIntegrity(repaired).length) throw new Error('npm did not fill all integrity digests.');
    for (const [key, version] of Object.entries(expected))
      if (repaired.packages[key]?.version !== version) throw new Error(`Unexpected version change: ${key || 'root'}`);
    return true;
  } catch (error) {
    await writeFile(path, original);
    throw new Error(`Lockfile repair failed; original restored. ${error.message}`);
  }
}

if (isMain(import.meta.url)) {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  const npmPath = process.env.npm_execpath;
  const run = args => {
    if (!npmPath) throw new Error('Invoke this script with npm run setup.');
    const result = spawnSync(process.execPath, [npmPath, ...args], {cwd:root, stdio:'inherit', timeout:180000});
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`npm ${args[0]} failed (exit ${result.status ?? 'signal'}).`);
  };
  (async () => {
    if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node.js 22 or newer is required.');
    if (process.argv.length !== 2) throw new Error('Usage: npm run setup (no additional arguments).');
    const changed = await repairLockfile(root, run);
    console.log(changed ? 'Filled missing integrity metadata. Review and commit package-lock.json.' : 'Lockfile integrity metadata is present.');
    run(['ci', '--no-audit', '--no-fund']);
    console.log('Dependencies installed. Next: npm run browser:install && npm run check');
  })().catch(error => {console.error(error.message); process.exitCode = 2;});
}
