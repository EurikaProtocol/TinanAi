import { build } from "esbuild";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const dir = await mkdtemp(join(tmpdir(), "tinan-dependency-tests-"));
try {
  const outfile = join(dir, "dependencies.test.cjs");
  await build({
    entryPoints: ["src/lib/dependency-compatibility.test.ts"],
    outfile, bundle: true, platform: "node", format: "cjs",
    external: ["pg-native"], logLevel: "warning",
  });
  const result = spawnSync(process.execPath, ["--test", outfile], { stdio: "inherit" });
  process.exitCode = result.status ?? 1;
} finally {
  await rm(dir, { recursive: true, force: true });
}
