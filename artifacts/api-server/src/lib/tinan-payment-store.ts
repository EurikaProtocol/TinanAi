import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, sql } from "drizzle-orm";
import {
  db, tinanPaymentAdminsTable as admins, tinanPaymentInvoicesTable as invoices, tinanPaymentAuditTable as audit,
  tinanPaymentServicesTable as services, tinanPaymentSettingsTable as settings,
  tinanPaymentUsageTable as usage, type TinanPaymentInvoiceRow,
} from "@workspace/db";
import { displayAtomic, PaymentError } from "./tinan-payment-chain";

export const defaultPaymentServices = [
  { slug: "ai-builder", name: "AI Builder usage", route: "/assistant", description: "One Builder-mode assistant request." },
  { slug: "ai-agents", name: "AI Agent services", route: "/builder", description: "One engineering agent run. Existing run limits still apply." },
  { slug: "app-generation", name: "Website and application generation", route: "/builder", description: "One application generation request; not hosting or deployment." },
  { slug: "contract-generation", name: "Smart Contract generation", route: "/builder", description: "One token contract draft generation request; not audit or deployment." },
  { slug: "data-tokenization", name: "Data Tokenization", route: "/tokenize", description: "One AI tokenization planning request; not token issuance." },
  { slug: "marketplace", name: "Marketplace services", route: "/payments", description: "One marketplace service request for manual administrator fulfillment. Not an automatic asset purchase." },
] as const;
/** Explicit administrator mutation only. Never upgrades/overwrites existing settings. */
export async function initializePayments(actorId: string) {
  if (!actorId) throw new PaymentError("An authenticated administrator is required.", 403);
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(791205315)`);
    const [previous] = await tx.select().from(settings).where(eq(settings.id, "default")).for("update");
    const created = await tx.insert(settings).values({ id: "default", enabled: false, chainId: 11155111, confirmations: 12 })
      .onConflictDoNothing().returning();
    const addedServices = await tx.insert(services).values(defaultPaymentServices.map(s => ({ ...s }))).onConflictDoNothing().returning();
    if (created.length || addedServices.length) await tx.insert(audit).values({
      id: randomUUID(), actorId, action: "payment_configuration_initialized",
      details: { previousSettings: previous ?? null, newSettings: created[0] ?? previous, addedServices: addedServices.map(s => s.slug) },
    });
    return { initialized: true, changed: Boolean(created.length || addedServices.length) };
  });
}
export async function paymentCatalog() {
  const [[row], records] = await Promise.all([db.select().from(settings).where(eq(settings.id, "default")), db.select().from(services)]);
  if (!row) throw new PaymentError("Payment settings are not initialized. An administrator must explicitly initialize them.", 503);
  if (defaultPaymentServices.some(s => !records.some(r => r.slug === s.slug))) {
    throw new PaymentError("Payment services are incomplete. An administrator must explicitly initialize missing services.", 503);
  }
  const { id: _id, ...configuration } = row;
  const ready = row.enabled && Boolean(row.tokenAddress && row.treasuryAddress && row.tinanPerEur && row.rateSource);
  return {
    settings: configuration,
    services: defaultPaymentServices.map((s) => records.find((r) => r.slug === s.slug)!),
    ready,
    reason: ready ? null : "Payments are disabled or not configured. No deployed TINAN address or conversion rate is assumed.",
    rateKind: "administrator-set" as const,
  };
}
export async function isPaymentAdmin(ownerId: string) {
  const [row] = await db.select().from(admins).where(eq(admins.ownerId, ownerId));
  return Boolean(row);
}
export function serializeInvoice(row: TinanPaymentInvoiceRow) {
  const { ownerId: _owner, minBlock: _min, configRevision: _revision, creditRemaining: _credit, lastCheckedAt: _checked, ...publicRow } = row;
  const expired = row.status === "created" && !row.txHash && row.expiresAt.getTime() < Date.now();
  return {
    ...publicRow, status: expired ? "expired" : row.status,
    error: expired ? "Quote expired before a transaction was submitted." : row.error,
    requiredConfirmations: row.requiredConfirmations, amountTinan: displayAtomic(row.amountAtomic),
    createdAt: row.createdAt.toISOString(), expiresAt: row.expiresAt.toISOString(),
    confirmedAt: row.confirmedAt?.toISOString() ?? null,
  };
}
export async function accountPayments(ownerId: string) {
  // Expiry is a response projection; GET never changes an invoice or configuration.
  const [rows, balances, isAdmin] = await Promise.all([
    db.select().from(invoices).where(eq(invoices.ownerId, ownerId)).orderBy(desc(invoices.createdAt)).limit(100),
    db.select({ serviceSlug: invoices.serviceSlug, available: sql<number>`coalesce(sum(${invoices.creditRemaining}), 0)::int` })
      .from(invoices).where(and(eq(invoices.ownerId, ownerId), eq(invoices.status, "confirmed"))).groupBy(invoices.serviceSlug),
    isPaymentAdmin(ownerId),
  ]);
  return { invoices: rows.map(serializeInvoice), credits: defaultPaymentServices.map((s) => ({ serviceSlug: s.slug, available: balances.find((b) => b.serviceSlug === s.slug)?.available ?? 0 })), isAdmin };
}

/** One server-confirmed invoice = one service request; never a frontend flag. */
export async function reserveServiceCredit(ownerId: string | null, serviceSlug: string): Promise<string | null> {
  const [policy] = await db.select().from(services).where(eq(services.slug, serviceSlug));
  if (!policy) throw new Error("Unknown payment service.");
  if (!policy.requiresPayment) return null; // Preserve existing free behavior by default.
  if (!ownerId) throw new PaymentError("Sign in and obtain a confirmed service credit at Payments.", 401);
  return db.transaction(async (tx) => {
    const [credit] = await tx.select().from(invoices)
      .where(and(eq(invoices.ownerId, ownerId), eq(invoices.serviceSlug, serviceSlug), eq(invoices.status, "confirmed"), gt(invoices.creditRemaining, 0)))
      .orderBy(invoices.createdAt).limit(1).for("update", { skipLocked: true });
    if (!credit) throw new PaymentError(`A confirmed ${policy.name} credit is required. Open Payments to purchase one.`, 402);
    const id = randomUUID();
    await tx.update(invoices).set({ creditRemaining: 0 }).where(eq(invoices.id, credit.id));
    await tx.insert(usage).values({ id, invoiceId: credit.id, ownerId, serviceSlug });
    return id;
  });
}
export async function finishServiceCredit(id: string, successful: boolean) {
  await db.transaction(async (tx) => {
    const [reservation] = await tx.select().from(usage).where(eq(usage.id, id)).for("update");
    if (!reservation || reservation.status !== "reserved") return;
    await tx.update(usage).set({ status: successful ? "consumed" : "refunded" }).where(eq(usage.id, id));
    if (!successful) await tx.update(invoices).set({ creditRemaining: 1 }).where(eq(invoices.id, reservation.invoiceId));
  });
}
