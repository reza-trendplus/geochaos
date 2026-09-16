import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** A repository slug is data, never a shell command or arbitrary URL. */
export function validateRepository(value) {
  if (typeof value !== 'string') throw new Error('Use OWNER/REPOSITORY.');
  const parts = value.split('/');
  if (parts.length !== 2) throw new Error('Use OWNER/REPOSITORY, not a URL.');
  const [owner, repo] = parts;
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(owner) || owner.includes('--'))
    throw new Error('Invalid GitHub owner.');
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(repo) || repo.endsWith('.git'))
    throw new Error('Invalid repository name; omit the .git suffix.');
  if (/^(YOUR_|CHANGE_ME|OWNER$)/i.test(owner)) throw new Error('Replace the example owner with your GitHub username.');
  return { owner, repo, slug: `${owner}/${repo}`, url: `https://github.com/${owner}/${repo}`,
    pages: `https://${owner.toLowerCase()}.github.io/${repo}/` };
}

export function missingIntegrity(lock) {
  if (lock.lockfileVersion !== 3 || !lock.packages) throw new Error('Expected an npm v3 package lock.');
  return Object.entries(lock.packages)
    .filter(([name, info]) => name && !info.link && /^https?:/.test(info.resolved ?? '') &&
      !/^sha(256|384|512)-[A-Za-z0-9+/]+=*$/.test(info.integrity ?? ''))
    .map(([name]) => name);
}

export function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
}

export function managedBlock(text, name, value) {
  const start = `<!-- ${name}:start -->`, end = `<!-- ${name}:end -->`;
  const from = text.indexOf(start), to = text.indexOf(end);
  if (from < 0 || to < from || text.indexOf(start, from + start.length) !== -1)
    throw new Error(`Missing or duplicate managed block: ${name}`);
  return text.slice(0, from) + `${start}
${value.trim()}
${end}` + text.slice(to + end.length);
}

export const readJson = async path => JSON.parse(await readFile(path, 'utf8'));
export const isMain = meta => !!process.argv[1] && fileURLToPath(meta) === resolve(process.argv[1]);
