import { getAddress, isAddress, zeroAddress } from "viem";
import pg from "pg";

/** Read-only database approval gate. Missing database/approval always blocks sending. */
export async function assertSavedMainnetApproval(expected: string | undefined) {
  if (!process.env.DATABASE_URL) throw new Error("The administrator approval database is unavailable. No transaction was submitted.");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, options: "-c default_transaction_read_only=on", connectionTimeoutMillis: 10_000 });
  try {
    const { rows: [row] } = await pool.query("select details from tinan_payment_audit where action = $1 order by created_at desc, id desc limit 1", ["mainnet_deployer_approved"]);
    const address = (row?.details as { approvedDeployer?: unknown } | undefined)?.approvedDeployer;
    if (typeof address !== "string" || !isAddress(address) || address === zeroAddress || !expected || !isAddress(expected) || getAddress(address) !== getAddress(expected)) {
      throw new Error();
    }
    // SELECT only: no catalog GET, initialization, configuration migration or audit write.
    const { rows: [payment] } = await pool.query("select enabled, token_address, treasury_address, tinan_per_eur, rate_source from tinan_payment_settings where id = $1", ["default"]);
    if (!payment || payment.enabled !== false) throw new Error();
    // Preserve the owner's explicit unset billing policy; never clear or populate it.
    if (payment.token_address || payment.treasury_address || payment.tinan_per_eur || payment.rate_source?.trim()) throw new Error();
  } catch {
    throw new Error("Read-only deployment gate blocked: verify saved deployer/allowlist, disabled checkout and unset payment-token/Treasury/rate fields. No settings were changed.");
  } finally { await pool.end(); }
}
