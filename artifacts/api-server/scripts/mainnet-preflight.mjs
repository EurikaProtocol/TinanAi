import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const dir = await mkdtemp(join(tmpdir(), "tinan-mainnet-preflight-"));
try {
  const outfile = join(dir, "preflight.mjs");
  await build({ entryPoints: ["src/scripts/mainnet-preflight.ts"], outfile, bundle: true, platform: "node", format: "esm", external: ["pg-native"], banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: "warning" });
  const result = spawnSync(process.execPath, [outfile], { stdio: "inherit", env: process.env });
  process.exitCode = result.status ?? 1;
} finally { await rm(dir, { recursive: true, force: true }); }
