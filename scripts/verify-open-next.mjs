import { existsSync } from "node:fs";

const required = [
  ".open-next/worker.js",
  ".open-next/assets",
  ".open-next/.build/open-next.config.edge.mjs",
];
const missing = required.filter((path) => !existsSync(path));

if (missing.length > 0) {
  console.error(
    `Missing OpenNext artifacts:\n${missing.map((p) => `  - ${p}`).join("\n")}\n` +
      "Run `npm run build:cloudflare` (opennextjs-cloudflare build) before deploying.",
  );
  process.exit(1);
}
console.log("OpenNext artifacts verified.");
