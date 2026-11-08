import { sql } from "drizzle-orm";
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const tinanPaymentSettingsTable = pgTable("tinan_payment_settings", {
  id: text("id").primaryKey().default("default"),
  enabled: boolean("enabled").notNull().default(false),
  chainId: integer("chain_id").notNull().default(11155111),
  tokenAddress: text("token_address"),
  treasuryAddress: text("treasury_address"),
  tinanPerEur: text("tinan_per_eur"),
  rateSource: text("rate_source").notNull().default(""),
  confirmations: integer("confirmations").notNull().default(12),
  revision: integer("revision").notNull().default(0),
});
export const tinanPaymentServicesTable = pgTable("tinan_payment_services", {
  slug: text("slug").primaryKey(),
  name: text("name").notNull(),
  description: text("description").notNull(),
  route: text("route").notNull(),
  eurCents: integer("eur_cents"),
  enabled: boolean("enabled").notNull().default(false),
  requiresPayment: boolean("requires_payment").notNull().default(false),
});
export const tinanPaymentInvoicesTable = pgTable("tinan_payment_invoices", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  serviceSlug: text("service_slug").notNull(),
  serviceName: text("service_name").notNull(),
  payer: text("payer").notNull(),
  chainId: integer("chain_id").notNull(),
  tokenAddress: text("token_address").notNull(),
  treasuryAddress: text("treasury_address").notNull(),
  eurCents: integer("eur_cents").notNull(),
  tinanPerEur: text("tinan_per_eur").notNull(),
  rateSource: text("rate_source").notNull(),
  amountAtomic: text("amount_atomic").notNull(),
  requiredConfirmations: integer("required_confirmations").notNull(),
  configRevision: integer("config_revision").notNull(),
  minBlock: text("min_block").notNull(),
  status: text("status").notNull().default("created"),
  txHash: text("tx_hash"),
  confirmations: integer("confirmations").notNull().default(0),
  blockNumber: text("block_number"),
  error: text("error"),
  creditRemaining: integer("credit_remaining").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
}, (t) => [
  uniqueIndex("tinan_payment_chain_transaction_unique").on(t.chainId, t.txHash),
  index("tinan_payment_owner_created").on(t.ownerId, t.createdAt),
  check("tinan_payment_credit_bound", sql`${t.creditRemaining} between 0 and 1 and (${t.creditRemaining} = 0 or ${t.status} = 'confirmed')`),
]);
export const tinanPaymentChallengesTable = pgTable("tinan_payment_challenges", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  payer: text("payer").notNull(),
  chainId: integer("chain_id").notNull(),
  message: text("message").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  usedAt: timestamp("used_at", { withTimezone: true }),
});
export const tinanPaymentUsageTable = pgTable("tinan_payment_usage", {
  id: text("id").primaryKey(),
  invoiceId: text("invoice_id").notNull().references(() => tinanPaymentInvoicesTable.id),
  ownerId: text("owner_id").notNull(),
  serviceSlug: text("service_slug").notNull(),
  status: text("status").notNull().default("reserved"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const tinanPaymentAdminsTable = pgTable("tinan_payment_admins", {
  ownerId: text("owner_id").primaryKey(),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
});
export const tinanPaymentAuditTable = pgTable("tinan_payment_audit", {
  id: text("id").primaryKey(),
  actorId: text("actor_id").notNull(),
  action: text("action").notNull(),
  details: jsonb("details").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
export const tinanMarketplaceOrdersTable = pgTable("tinan_marketplace_orders", {
  id: text("id").primaryKey(),
  ownerId: text("owner_id").notNull(),
  invoiceId: text("invoice_id").notNull().references(() => tinanPaymentInvoicesTable.id),
  request: text("request").notNull(),
  status: text("status").notNull().default("open"),
  response: text("response"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
});

export const insertTinanPaymentInvoiceSchema = createInsertSchema(tinanPaymentInvoicesTable);
export type TinanPaymentInvoiceRow = typeof tinanPaymentInvoicesTable.$inferSelect;
export type TinanPaymentSettingsRow = typeof tinanPaymentSettingsTable.$inferSelect;
