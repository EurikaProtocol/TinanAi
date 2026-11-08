import { desc, eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db, tinanPaymentAuditTable as audit, tinanPaymentSettingsTable as settings } from "@workspace/db";
import { applicationIdentity } from "./tinan-application-state";
import { PaymentError } from "./tinan-payment-chain";
import { validDeployer, validCatalogEndpoint } from "./tinan-mainnet-policy";

const action = "mainnet_deployer_approved";
export async function mainnetConfig() {
  const [row] = await db.select().from(audit).where(eq(audit.action, action)).orderBy(desc(audit.createdAt), desc(audit.id)).limit(1);
  const details = row?.details as { approvedDeployer?: string | null } | undefined;
  const approvedDeployer = validDeployer(details?.approvedDeployer);
  const envDeployer = validDeployer(process.env.TINANAI_MAINNET_AUTHORIZED_DEPLOYER);
  const [payment] = await db.select().from(settings).where(eq(settings.id, "default"));
  return {
    approvedDeployer, revision: row?.id ?? null,
    rpcConfigured: Boolean(process.env.TINANAI_MAINNET_RPC_URL?.trim()),
    cliDeployerConfigured: Boolean(envDeployer),
    cliDeployerMatches: Boolean(approvedDeployer && envDeployer === approvedDeployer),
    catalogUrlConfigured: validCatalogEndpoint(process.env.TINANAI_MAINNET_PAYMENT_CATALOG_URL),
    application: applicationIdentity(),
    payment: payment ? {
      chainId: payment.chainId, confirmations: payment.confirmations, enabled: payment.enabled,
      tokenAddress: payment.tokenAddress, treasuryAddress: payment.treasuryAddress, tinanPerEur: payment.tinanPerEur,
    } : null,
  };
}

export async function saveMainnetApproval(actorId: string, approvedDeployer: string | null, revision: string | null) {
  const address = validDeployer(approvedDeployer);
  if (approvedDeployer !== null && !address) throw new PaymentError("Use a valid, nonzero Ethereum deployer address.");
  await db.transaction(async (tx) => {
    // Serialize changes without introducing a new table or touching payment settings.
    await tx.execute(sql`select pg_advisory_xact_lock(791205313)`);
    const [latest] = await tx.select().from(audit).where(eq(audit.action, action)).orderBy(desc(audit.createdAt), desc(audit.id)).limit(1);
    if ((latest?.id ?? null) !== revision) throw new PaymentError("The approved deployer changed. Reload before saving.", 409);
    const createdAt = new Date(Math.max(Date.now(), (latest?.createdAt.getTime() ?? 0) + 1));
    await tx.insert(audit).values({ id: randomUUID(), actorId, action, details: { approvedDeployer: address }, createdAt });
  });
  return mainnetConfig();
}
