import { readFile, writeFile, mkdir, rm, copyFile, lstat } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { isMain, readJson, validateRepository, escapeHtml } from './release-utils.mjs';

function inside(root, name) {
  if (typeof name !== 'string' || name.includes('\\') || name.split('/').some(part => part === '..' || part === '.' || !part))
    throw new Error(`Unsafe relative artifact path: ${name}`);
  const result = resolve(root, name);
  if (!result.startsWith(resolve(root) + sep)) throw new Error(`Artifact leaves root: ${name}`);
  return result;
}

export async function buildSite(root, suppliedRepository) {
  const output = join(root, '_site');
  const pkg = await readJson(join(root, 'package.json'));
  const slug = suppliedRepository || pkg.geochaos?.repository;
  const repo = slug ? validateRepository(slug) : null;
  const manifest = await readJson(join(root, 'site/demo-manifest.json'));
  // Validate all evidence before touching a previously built site.
  const copies = [];
  for (const sample of manifest.samples) {
    if (!['fragile','resilient'].includes(sample.name)) throw new Error('Unknown demo sample.');
    const folder = inside(root, sample.source);
    const model = await readJson(join(folder, 'report.json'));
    if (model.mode !== 'synthetic' || model.dependencies.some(dep => dep.geo.some(record => record.source === 'ip2location')))
      throw new Error('Refusing to publish live provider data as a public synthetic demo.');
    for (const file of sample.files) {
      const source = inside(folder, file.path);
      const metadata = await lstat(source);
      if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error('Only regular allowlisted files can be published.');
      const digest = createHash('sha256').update(await readFile(source)).digest('hex');
      if (digest !== file.sha256) throw new Error(`Demo evidence checksum mismatch: ${sample.name}/${file.path}`);
      copies.push([source, inside(output, `reports/${sample.name}/${file.path}`)]);
    }
  }
  await rm(output, {recursive:true, force:true});
  await mkdir(join(output, 'assets'), {recursive:true});
  await mkdir(join(output, 'docs'), {recursive:true});
  for (const [from, to] of copies) {await mkdir(dirname(to), {recursive:true}); await copyFile(from, to);}
  await copyFile(join(root, 'docs/preview.png'), join(output, 'assets/report-preview.png'));
  await copyFile(join(root, 'site/styles.css'), join(output, 'assets/styles.css'));
  for (const name of ['README.md','LICENSE','CREDITS.md','SECURITY.md','PUBLISHING.md','THIRD_PARTY_NOTICES.md'])
    await copyFile(join(root, name), join(output, 'docs', name));
  await copyFile(join(root, 'docs/VERIFICATION.md'), join(output, 'docs/VERIFICATION.md'));
  const template = await readFile(join(root, 'site/index.html'), 'utf8');
  const values = {SOURCE_URL:repo?.url ?? 'docs/README.md', SOURCE_LABEL:repo ? 'Source on GitHub' : 'Read the README',
    VERSION:pkg.version, GUIDE_URL:repo ? `${repo.url}/blob/main/README.md#quick-start` : 'docs/README.md',
    CREDITS_URL:repo ? `${repo.url}/blob/main/CREDITS.md` : 'docs/CREDITS.md',
    VERIFICATION_URL:repo ? `${repo.url}/blob/main/docs/VERIFICATION.md` : 'docs/VERIFICATION.md'};
  const html = template.replace(/\{\{([A-Z_]+)\}\}/g, (_, key) => {
    if (!(key in values)) throw new Error(`Unknown site variable: ${key}`);
    return escapeHtml(values[key]);
  });
  await writeFile(join(output, 'index.html'), html);
  await writeFile(join(output, '.nojekyll'), '');
  return output;
}

if (isMain(import.meta.url)) {
  buildSite(dirname(dirname(fileURLToPath(import.meta.url))), process.env.GITHUB_REPOSITORY)
    .then(path => console.log(`Static site built at ${path}
Only allowlisted synthetic samples were copied. Nothing was deployed.`))
    .catch(error => {console.error(error.message); process.exitCode = 2;});
}
