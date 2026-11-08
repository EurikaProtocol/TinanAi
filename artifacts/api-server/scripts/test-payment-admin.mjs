import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

if (process.env.NODE_ENV === "production") throw new Error("Administrator integration tests require development.");
const dir = await mkdtemp(join(tmpdir(), "tinan-admin-tests-"));
try {
  const outfile = join(dir, "admin.test.cjs");
  await build({ entryPoints: ["src/lib/tinan-payment-admin-bootstrap.test.ts"], outfile, bundle: true, platform: "node", format: "cjs", external: ["pg-native"], logLevel: "warning" });
  const result = spawnSync(process.execPath, ["--test", outfile], { stdio: "inherit", env: process.env });
  process.exitCode = result.status ?? 1;
} finally { await rm(dir, { recursive: true, force: true }); }
