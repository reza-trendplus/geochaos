import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, rm, mkdir, cp, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validateRepository, managedBlock, missingIntegrity, escapeHtml } from '../../scripts/release-utils.mjs';
import { personalize } from '../../scripts/personalize.mjs';
import { repairLockfile } from '../../scripts/setup.mjs';
import { buildSite } from '../../scripts/build-site.mjs';

const project = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const temporary = async (fn) => {
  const root = await mkdtemp(join(tmpdir(), 'geochaos-release-'));
  try { return await fn(root); } finally { await rm(root, {recursive:true, force:true}); }
};
const fixtureLock = () => ({lockfileVersion:3, version:'0.1.1', packages:{
  '':{version:'0.1.1'}, 'node_modules/example-package':{
    version:'1.0.0', resolved:'https://registry.npmjs.org/example-package/-/example-package-1.0.0.tgz'
  }
}});
// This digest is only mock metadata used by the repair tests, not a package checksum.
const mockIntegrity = 'sha512-' + Buffer.alloc(64, 1).toString('base64');
const writeLock = (root, lock) => writeFile(join(root, 'package-lock.json'), JSON.stringify(lock, null, 2) + '\n');

async function siteFixture(root) {
  for (const file of ['package.json','README.md','LICENSE','CREDITS.md','SECURITY.md','PUBLISHING.md','THIRD_PARTY_NOTICES.md'])
    await cp(join(project, file), join(root, file));
  for (const directory of ['site','sample-reports','docs'])
    await cp(join(project, directory), join(root, directory), {recursive:true});
}

test('Repository personalization constructs valid source and project-site URLs', () => {
  assert.deepEqual(validateRepository('demo-user/geochaos'), {
    owner:'demo-user', repo:'geochaos', slug:'demo-user/geochaos',
    url:'https://github.com/demo-user/geochaos', pages:'https://demo-user.github.io/geochaos/'
  });
  assert.equal(validateRepository('Demo-User/GeoChaos').pages,'https://demo-user.github.io/GeoChaos/');
});

test('Repository slugs reject URLs, paths, injection and placeholder owners', () => {
  for (const value of [null, '', 'abc', 'https://github.com/a/b', '../repo', 'a/b/c',
    'a/../../etc', 'a/repo.git', 'a/x;echo hello', '-abc/repo', 'a--b/repo', 'OWNER/geochaos'])
    assert.throws(() => validateRepository(value), `must reject ${value}`);
});

test('HTML dynamic values escape markup and quoted attributes', () => {
  assert.equal(escapeHtml('<script "x">a&b\'</script>'), '&lt;script &quot;x&quot;&gt;a&amp;b&#39;&lt;/script&gt;');
});

test('Managed blocks preserve surrounding text and are idempotent', () => {
  const source = 'before\n<!-- links:start -->\nold\n<!-- links:end -->\nafter';
  const once = managedBlock(source, 'links', 'new');
  assert.equal(once, 'before\n<!-- links:start -->\nnew\n<!-- links:end -->\nafter');
  assert.equal(managedBlock(once, 'links', 'new'), once);
});

test('Managed blocks refuse a missing or duplicated marker', () => {
  assert.throws(() => managedBlock('no block', 'links', 'new'));
  assert.throws(() => managedBlock('<!-- links:start --><!-- links:start --><!-- links:end -->','links','new'));
});

test('Lockfile validation finds missing digests but ignores package root', () => {
  const lock = fixtureLock();
  assert.deepEqual(missingIntegrity(lock), ['node_modules/example-package']);
  lock.packages['node_modules/example-package'].integrity = mockIntegrity;
  assert.deepEqual(missingIntegrity(lock), []);
  assert.throws(() => missingIntegrity({lockfileVersion:2}));
});

test('Lockfile repair refetches missing metadata without changing pinned versions', () => temporary(async root => {
  const original = fixtureLock(); await writeLock(root, original);
  let calls = 0;
  const changed = await repairLockfile(root, async args => {
    calls++; assert(args.includes('--package-lock-only')); assert(args.includes('--ignore-scripts'));
    const input = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
    assert.equal(input.packages['node_modules/example-package'], undefined);
    original.packages['node_modules/example-package'].integrity = mockIntegrity;
    await writeLock(root, original);
  });
  assert.equal(changed, true); assert.equal(calls, 1);
}));

test('A failed metadata repair restores the original lockfile byte-for-byte', () => temporary(async root => {
  await writeLock(root, fixtureLock());
  const original = await readFile(join(root, 'package-lock.json'), 'utf8');
  await assert.rejects(repairLockfile(root, () => {throw new Error('Offline');}), /original restored/);
  assert.equal(await readFile(join(root, 'package-lock.json'), 'utf8'), original);
}));

test('An unexpected dependency version change is rejected and rolled back', () => temporary(async root => {
  const lock = fixtureLock(); await writeLock(root, lock);
  const original = await readFile(join(root, 'package-lock.json'), 'utf8');
  await assert.rejects(repairLockfile(root, async () => {
    lock.packages['node_modules/example-package'].version = '9.0.0';
    lock.packages['node_modules/example-package'].integrity = mockIntegrity;
    await writeLock(root, lock);
  }), /Unexpected version change/);
  assert.equal(await readFile(join(root, 'package-lock.json'), 'utf8'), original);
}));

test('A complete lockfile does not invoke npm during metadata repair', () => temporary(async root => {
  const lock = fixtureLock(); lock.packages['node_modules/example-package'].integrity = mockIntegrity;
  await writeLock(root, lock);
  assert.equal(await repairLockfile(root, () => assert.fail('Unexpected npm call')), false);
}));

test('Personalization is repeatable and does not claim a completed human audit', () => temporary(async root => {
  for (const name of ['package.json','README.md','CREDITS.md']) await cp(join(project, name), join(root, name));
  await personalize(root, 'demo-user/geochaos');
  const first = await readFile(join(root, 'README.md'), 'utf8');
  await personalize(root, 'demo-user/geochaos');
  assert.equal(await readFile(join(root, 'README.md'), 'utf8'), first);
  const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
  assert.equal(pkg.repository.url, 'git+https://github.com/demo-user/geochaos.git');
  const credits = await readFile(join(root, 'CREDITS.md'), 'utf8');
  assert.match(credits, /Vibe coded with ChatGPT Pro 6/);
  assert.match(credits, /does not assert that a human review/);
}));

test('Invalid personalization makes no filesystem changes', () => temporary(async root => {
  await writeFile(join(root, 'package.json'), '{}');
  await assert.rejects(personalize(root, 'https://github.com/a/b'));
  assert.equal(await readFile(join(root, 'package.json'), 'utf8'), '{}');
}));

test('Site publication allowlists synthetic samples and never copies local secrets', () => temporary(async root => {
  await siteFixture(root);
  await writeFile(join(root, '.env'), 'SECRET_DO_NOT_PUBLISH=fixture');
  await mkdir(join(root, 'geochaos-reports'));
  await writeFile(join(root, 'geochaos-reports/private.html'), 'PRIVATE_REPORT_DO_NOT_PUBLISH');
  const output = await buildSite(root, 'demo-user/geochaos');
  const html = await readFile(join(output, 'index.html'), 'utf8');
  assert.match(html, /https:\/\/github.com\/demo-user\/geochaos/);
  assert.match(html, /Vibe coded with ChatGPT Pro 6/);
  assert.match(html, /ordinary top-level navigation was not tested/);
  assert(!html.includes('{{'));
  assert(!(await readdir(output)).includes('.env'));
  assert(!(await readdir(output)).includes('geochaos-reports'));
  for (const variant of ['fragile','resilient']) {
    const report = JSON.parse(await readFile(join(output, 'reports', variant, 'report.json'), 'utf8'));
    assert.equal(report.mode, 'synthetic');
    assert(report.dependencies.every(dep => dep.geo.every(record => record.source !== 'ip2location')));
  }
  // All relative href/src values in the landing page must resolve within the build.
  for (const match of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    const url = match[1]; if (/^(https?:|#)/.test(url)) continue;
    await readFile(join(output, url));
  }
}));

test('Tampered evidence is refused without erasing a previously built site', () => temporary(async root => {
  await siteFixture(root); const output = await buildSite(root);
  const original = await readFile(join(output, 'index.html'), 'utf8');
  const manifest = JSON.parse(await readFile(join(root, 'site/demo-manifest.json'), 'utf8'));
  const sample = manifest.samples[0];
  await writeFile(join(root, sample.source, 'report.html'), '<html>Not approved evidence</html>');
  await assert.rejects(buildSite(root), /checksum mismatch/);
  assert.equal(await readFile(join(output, 'index.html'), 'utf8'), original);
}));

test('Public demo build refuses live-provider records', () => temporary(async root => {
  await siteFixture(root);
  const manifest = JSON.parse(await readFile(join(root, 'site/demo-manifest.json'), 'utf8'));
  const path = join(root, manifest.samples[0].source, 'report.json');
  const report = JSON.parse(await readFile(path, 'utf8')); report.mode = 'live';
  await writeFile(path, JSON.stringify(report));
  await assert.rejects(buildSite(root), /Refusing to publish live provider data/);
}));

test('Public demo build rejects path traversal in its manifest', () => temporary(async root => {
  await siteFixture(root);
  const path = join(root, 'site/demo-manifest.json');
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  manifest.samples[0].source = '../private-data';
  await writeFile(path, JSON.stringify(manifest));
  await assert.rejects(buildSite(root), /Unsafe relative artifact path/);
}));
