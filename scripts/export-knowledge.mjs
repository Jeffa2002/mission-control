#!/usr/bin/env node
import { lstat, mkdir, readFile, readdir, realpath, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

const [vaultArg, outputArg] = process.argv.slice(2);
if (!vaultArg || !outputArg) {
  console.error('Usage: node scripts/export-knowledge.mjs <vault> <output-json>');
  process.exit(2);
}

const ALLOWED_ROOTS = ['00-Home', '01-Projects', '02-Areas', '03-Resources'];
const MAX_DOCUMENTS = 200;
const MAX_BODY = 24_000;
const SECRET_VALUE = /(bearer\s+[a-z0-9._-]{12,}|(?:api[-_ ]?key|token|secret|password)\s*[:=]\s*[^\s,;]{8,}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/gi;

function text(value, max = 160) {
  return String(value ?? '').replace(/[\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function parseNote(source) {
  let body = source;
  const metadata = {};
  if (source.startsWith('---\n')) {
    const end = source.indexOf('\n---\n', 4);
    if (end !== -1) {
      for (const line of source.slice(4, end).split('\n')) {
        const separator = line.indexOf(':');
        if (separator < 1) continue;
        metadata[text(line.slice(0, separator), 40)] = text(line.slice(separator + 1), 240);
      }
      body = source.slice(end + 5);
    }
  }
  body = body.replace(SECRET_VALUE, '[redacted]').trim().slice(0, MAX_BODY);
  const title = text(body.match(/^#\s+(.+)$/m)?.[1] || 'Untitled', 120);
  const excerpt = text(body.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, '$2$1').replace(/[#*_`>|-]/g, ' '), 260);
  const tags = text(metadata.tags, 240).replace(/^\[|\]$/g, '').split(',').map((tag) => text(tag, 40)).filter(Boolean).slice(0, 12);
  return { title, type: text(metadata.type || 'note', 40), status: text(metadata.status || 'unknown', 40), updated: text(metadata.updated || '', 40) || null, tags, excerpt, body };
}

const vault = await realpath(vaultArg);
const documents = [];

async function walk(directory, rootName) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const candidate = path.join(directory, entry.name);
    const info = await lstat(candidate);
    if (info.isSymbolicLink()) continue;
    if (info.isDirectory()) await walk(candidate, rootName);
    else if (info.isFile() && entry.name.endsWith('.md') && documents.length < MAX_DOCUMENTS) {
      const resolved = await realpath(candidate);
      if (!resolved.startsWith(`${vault}${path.sep}`)) continue;
      const relative = path.relative(vault, resolved).split(path.sep).join('/');
      const parsed = parseNote(await readFile(resolved, 'utf8'));
      documents.push({ id: relative.replace(/\.md$/i, ''), path: relative, area: rootName, ...parsed });
    }
  }
}

for (const rootName of ALLOWED_ROOTS) {
  try { await walk(path.join(vault, rootName), rootName); } catch { /* optional area */ }
}
documents.sort((left, right) => left.title.localeCompare(right.title));
const output = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  source: { status: 'healthy', mode: 'sanitized-projection', allowedRoots: ALLOWED_ROOTS },
  stats: { documents: documents.length, areas: [...new Set(documents.map((doc) => doc.area))].length },
  documents,
};
await mkdir(path.dirname(outputArg), { recursive: true });
const temporary = `${outputArg}.${process.pid}.tmp`;
await writeFile(temporary, `${JSON.stringify(output, null, 2)}\n`, { mode: 0o600 });
await rename(temporary, outputArg);
console.log(`Exported ${documents.length} sanitized knowledge documents.`);

