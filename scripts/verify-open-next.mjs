import { existsSync, readFileSync } from "node:fs";

const errors = [];
const stripJsonc = (text) =>
  text.replace(/("(?:[^"\\]|\\.)*")|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, (m, str) => str ?? "");

for (const file of ["package.json", "package-lock.json", "wrangler.jsonc", "open-next.config.ts"]) {
  if (!existsSync(file)) errors.push(`Missing required file: ${file}`);
}

if (errors.length === 0) {
  const pkg = JSON.parse(readFileSync("package.json", "utf8"));
  const wrangler = JSON.parse(stripJsonc(readFileSync("wrangler.jsonc", "utf8")));
  const scripts = pkg.scripts ?? {};
  const preview = wrangler.env?.preview ?? {};

  for (const dep of ["@opennextjs/cloudflare", "wrangler"]) {
    if (!pkg.devDependencies?.[dep] && !pkg.dependencies?.[dep]) errors.push(`Missing dependency: ${dep}`);
  }
  if (!/opennextjs-cloudflare build/.test(scripts.build ?? "")) {
    errors.push('"build" must run `opennextjs-cloudflare build` (plain `next build` does not produce .open-next).');
  }
  if (/opennextjs-cloudflare build|next build/.test(scripts["deploy:cloudflare"] ?? "")) {
    errors.push('"deploy:cloudflare" must not rebuild; it must deploy the already-built output.');
  }
  if (!/--env preview/.test(scripts["deploy:cloudflare:preview"] ?? "") || !wrangler.env?.preview) {
    errors.push("Preview deploy must pass `--env preview` and wrangler.jsonc must define env.preview.");
  }
  if (wrangler.main !== ".open-next/worker.js") errors.push('wrangler.jsonc "main" must be .open-next/worker.js.');
  if (wrangler.assets?.directory !== ".open-next/assets") {
    errors.push('wrangler.jsonc "assets.directory" must be .open-next/assets.');
  }
  for (const [name, cfg] of [["production", wrangler], ["preview", preview]]) {
    for (const key of ["d1_databases", "r2_buckets", "services"]) {
      if (!cfg[key]?.length) errors.push(`${name}: missing ${key} binding.`);
    }
  }
  const prodDb = wrangler.d1_databases?.[0]?.database_name;
  if (prodDb && prodDb === preview.d1_databases?.[0]?.database_name) {
    errors.push("Preview must not share the production D1 database.");
  }

  const secretPattern = /(sk-[A-Za-z0-9_-]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY-----)/;
  for (const file of ["wrangler.jsonc", ".dev.vars.example", "package.json"]) {
    if (existsSync(file) && secretPattern.test(readFileSync(file, "utf8"))) {
      errors.push(`Possible committed secret in ${file}.`);
    }
  }
}

if (!process.argv.includes("--config-only")) {
  for (const path of [".open-next/worker.js", ".open-next/assets", ".open-next/.build/open-next.config.edge.mjs"]) {
    if (!existsSync(path)) errors.push(`Missing OpenNext artifact: ${path} (run \`npm run build\` before deploying).`);
  }
}

if (errors.length > 0) {
  console.error(`Cloudflare preflight failed:\n${errors.map((e) => `  - ${e}`).join("\n")}`);
  process.exit(1);
}
console.log("Cloudflare preflight passed.");
