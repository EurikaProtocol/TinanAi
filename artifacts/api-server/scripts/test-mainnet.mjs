import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
const dir = await mkdtemp(join(tmpdir(), "tinan-mainnet-tests-"));
try {
  const outfile = join(dir, "tests.cjs");
  await build({ entryPoints: ["src/lib/tinan-mainnet-preflight.test.ts"], outfile, bundle: true, platform: "node", format: "cjs", logLevel: "warning" });
  process.exitCode = spawnSync(process.execPath, ["--test", outfile], { stdio: "inherit" }).status ?? 1;
} finally { await rm(dir, { recursive: true, force: true }); }
