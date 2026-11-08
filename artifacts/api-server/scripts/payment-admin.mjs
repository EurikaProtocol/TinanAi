// Owner-controlled operator CLI only. Default operation is read-only.
import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const directory = await mkdtemp(join(tmpdir(), "tinan-admin-"));
try {
  const outfile = join(directory, "operator.cjs");
  await build({ entryPoints: ["src/scripts/payment-admin.ts"], outfile, bundle: true, platform: "node", format: "cjs", external: ["pg-native"], logLevel: "silent" });
  const result = spawnSync(process.execPath, [outfile, ...process.argv.slice(2)], { stdio: "inherit", env: process.env });
  process.exitCode = result.status ?? 1;
} catch {
  process.stderr.write("Could not start the payment administrator operator tool. No grant was confirmed.\n");
  process.exitCode = 1;
} finally { await rm(directory, { recursive: true, force: true }); }
