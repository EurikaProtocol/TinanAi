import { eq } from "drizzle-orm";
import { db, pool, tinanPaymentSettingsTable as settings } from "@workspace/db";
import { mainnetConfig } from "../lib/tinan-mainnet-config";
import { deploymentRecords, readOnlyMainnetPreflight } from "../lib/tinan-mainnet-preflight";

try {
  const [payment] = await db.select().from(settings).where(eq(settings.id, "default"));
  const report = await readOnlyMainnetPreflight(await mainnetConfig(), { connectedAddress: null, walletChainId: null, connectorType: null }, payment, deploymentRecords());
  // Explicit operator CLI only; the object contains no credentials.
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  process.exitCode = report.ready ? 0 : 2;
} catch {
  process.stderr.write("Read-only preflight could not load server configuration. No transaction was attempted.\n");
  process.exitCode = 1;
} finally { await pool.end(); }
