import { gzipSync } from 'node:zlib';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const outputDir = path.resolve(scriptDir, '../dist/public');
const assetsDir = path.join(outputDir, 'assets');
const html = readFileSync(path.join(outputDir, 'index.html'), 'utf8');
const entryUrl = html.match(/<script[^>]+src="([^"]+\.js)"/)?.[1];

if (!entryUrl) throw new Error('Could not find the TINANAI JavaScript entry in dist/public/index.html.');

const entryPath = path.join(assetsDir, path.basename(new URL(entryUrl, 'https://tinanai.invalid').pathname));
const visited = new Set();

function visitStaticImports(filePath) {
  const resolvedPath = path.resolve(filePath);
  const relativePath = path.relative(outputDir, resolvedPath);
  if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    throw new Error(`Bundle import escapes the output directory: ${filePath}`);
  }
  if (visited.has(resolvedPath)) return;
  visited.add(resolvedPath);

  const code = readFileSync(resolvedPath, 'utf8');
  const importPattern = /(?:\bfrom\s*|\bimport\s*)["']([^"']+\.js(?:\?[^"']*)?)["']/g;
  for (const match of code.matchAll(importPattern)) {
    const specifier = match[1].split(/[?#]/, 1)[0];
    const importedPath = specifier.startsWith('/')
      ? path.join(outputDir, specifier.slice(1))
      : path.resolve(path.dirname(resolvedPath), specifier);
    visitStaticImports(importedPath);
  }
}

visitStaticImports(entryPath);

function sizeOf(filePath) {
  const content = readFileSync(filePath);
  return { raw: content.length, gzip: gzipSync(content).length };
}

const initial = [...visited].reduce((total, filePath) => {
  const size = sizeOf(filePath);
  return { raw: total.raw + size.raw, gzip: total.gzip + size.gzip };
}, { raw: 0, gzip: 0 });

const maxInitialRaw = 850 * 1024;
const maxInitialGzip = 280 * 1024;
const maxGeneralChunkRaw = 800 * 1024;
const maxWalletChunkRaw = 1800 * 1024;
const maxWalletChunkGzip = 550 * 1024;
const chunks = readdirSync(assetsDir)
  .filter((name) => name.endsWith('.js'))
  .map((name) => {
    const filePath = path.join(assetsDir, name);
    return { name, ...sizeOf(filePath) };
  });

const problems = [];
if (initial.raw > maxInitialRaw) {
  problems.push(`Initial JavaScript is ${(initial.raw / 1024).toFixed(1)} KiB; limit is ${maxInitialRaw / 1024} KiB.`);
}
if (initial.gzip > maxInitialGzip) {
  problems.push(`Initial JavaScript gzip size is ${(initial.gzip / 1024).toFixed(1)} KiB; limit is ${maxInitialGzip / 1024} KiB.`);
}

for (const chunk of chunks) {
  if (chunk.name.startsWith('web3-wallet-')) {
    if (chunk.raw > maxWalletChunkRaw) {
      problems.push(`Deferred wallet chunk ${chunk.name} is ${(chunk.raw / 1024).toFixed(1)} KiB; limit is ${maxWalletChunkRaw / 1024} KiB.`);
    }
    if (chunk.gzip > maxWalletChunkGzip) {
      problems.push(`Deferred wallet chunk ${chunk.name} gzip size is ${(chunk.gzip / 1024).toFixed(1)} KiB; limit is ${maxWalletChunkGzip / 1024} KiB.`);
    }
  } else if (chunk.raw > maxGeneralChunkRaw) {
    problems.push(`Chunk ${chunk.name} is ${(chunk.raw / 1024).toFixed(1)} KiB; general limit is ${maxGeneralChunkRaw / 1024} KiB.`);
  }
}

const largestChunk = chunks.reduce((largest, chunk) => chunk.raw > largest.raw ? chunk : largest, { name: '(none)', raw: 0, gzip: 0 });
console.log(
  `TINANAI JS budget: initial ${ (initial.raw / 1024).toFixed(1) } KiB raw / ${(initial.gzip / 1024).toFixed(1)} KiB gzip; ` +
  `largest chunk ${largestChunk.name} ${(largestChunk.raw / 1024).toFixed(1)} KiB raw / ${(largestChunk.gzip / 1024).toFixed(1)} KiB gzip.`,
);

if (problems.length) throw new Error(`TINANAI bundle budget exceeded:\n- ${problems.join('\n- ')}`);
