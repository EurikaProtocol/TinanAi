import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { Router, type IRouter } from "express";
import { asc, desc, eq, gt } from "drizzle-orm";
import { db, tinanPaymentSettingsTable as settings, tinanPaymentServicesTable as services, tinanPaymentInvoicesTable as invoices, tinanPaymentAuditTable as audit } from "@workspace/db";
import { GetTinanPaymentAdminResponse, UpdateTinanPaymentAdminBody, UpdateTinanPaymentAdminResponse } from "@workspace/api-zod";
import { csvCell, paymentAddress, PaymentError, quoteAtomic, validatePaymentConfirmations, validatePaymentToken } from "../lib/tinan-payment-chain";
import { defaultPaymentServices, initializePayments, isPaymentAdmin, paymentCatalog, serializeInvoice } from "../lib/tinan-payment-store";
import mainnetRouter from "./tinan-mainnet-admin";
import { paymentAdminGate } from "../lib/tinan-payment-admin-gate";

const router: IRouter = Router();
const base = "/tinanai/payments/admin";
router.use(base, paymentAdminGate(isPaymentAdmin));
router.use(`${base}/mainnet`, mainnetRouter);
router.post(`${base}/initialize`, async (_req, res): Promise<void> => {
  res.json(await initializePayments(res.locals.paymentOwnerId));
});
router.get(base, async (_req, res): Promise<void> => {
  const [catalog, rows] = await Promise.all([paymentCatalog(), db.select().from(invoices).orderBy(desc(invoices.createdAt)).limit(200)]);
  res.json(GetTinanPaymentAdminResponse.parse({ catalog, invoices: rows.map(serializeInvoice) }));
});
router.put(base, async (req, res): Promise<void> => {
  const input = UpdateTinanPaymentAdminBody.parse(req.body);
  const s = input.settings;
  if (new Set(input.services.map((s) => s.slug)).size !== defaultPaymentServices.length) throw new PaymentError("Configure each of the six supported services exactly once.");
  validatePaymentConfirmations(s.confirmations);
  const tokenAddress = s.tokenAddress ? paymentAddress(s.tokenAddress).toLowerCase() : null;
  const treasuryAddress = s.treasuryAddress ? paymentAddress(s.treasuryAddress).toLowerCase() : null;
  if (tokenAddress && tokenAddress === treasuryAddress) throw new PaymentError("The token and treasury addresses must differ.");
  const rate = s.tinanPerEur?.trim() || null;
  if (rate) quoteAtomic(100, rate);
  for (const service of input.services) {
    if (!service.name.trim()) throw new PaymentError("Every service needs a nonempty name.");
    if (service.enabled && service.requiresPayment && (!service.eurCents || !rate)) throw new PaymentError("Every paid service needs a price and conversion rate.");
    if (service.eurCents && rate) quoteAtomic(service.eurCents, rate);
  }
  if (tokenAddress) await validatePaymentToken(s.chainId, paymentAddress(tokenAddress));
  if (s.enabled) {
    if (s.chainId !== 1) throw new PaymentError("Live checkout requires the verified Ethereum Mainnet TINAN token.");
    if (!tokenAddress || !treasuryAddress || !rate || !s.rateSource.trim()) throw new PaymentError("Token, treasury, conversion rate and its source are required before enabling payments.");
  }
  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(settings).where(eq(settings.id, "default")).for("update");
    if (!current || current.revision !== s.revision) throw new PaymentError("Settings changed in another session. Reload before saving.", 409);
    await tx.update(settings).set({
      enabled: s.enabled, chainId: s.chainId, tokenAddress, treasuryAddress,
      tinanPerEur: rate, rateSource: s.rateSource.trim(), confirmations: s.confirmations, revision: current.revision + 1,
    }).where(eq(settings.id, "default"));
    for (const service of input.services) {
      const definition = defaultPaymentServices.find((d) => d.slug === service.slug)!;
      await tx.update(services).set({ ...service, route: definition.route, name: service.name.trim(), description: service.description.trim() }).where(eq(services.slug, service.slug));
    }
    await tx.insert(audit).values({ id: randomUUID(), actorId: res.locals.paymentOwnerId, action: "configuration_updated",
      details: { previousSettings: current, newSettings: { ...current, ...s, tokenAddress, treasuryAddress, tinanPerEur: rate, revision: current.revision + 1 }, configuration: input } });
  });
  res.json(UpdateTinanPaymentAdminResponse.parse(await paymentCatalog()));
});
router.get(`${base}/export`, async (req, res): Promise<void> => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", 'attachment; filename="tinan-payments.csv"');
  res.setHeader("X-Content-Type-Options", "nosniff");
  const columns = ["id", "ownerId", "serviceSlug", "serviceName", "payer", "chainId", "tokenAddress", "treasuryAddress", "eurCents", "tinanPerEur", "rateSource", "amountAtomic", "status", "txHash", "confirmations", "requiredConfirmations", "blockNumber", "createdAt", "expiresAt", "confirmedAt", "error"] as const;
  res.write(`${columns.map(csvCell).join(",")}\r\n`);
  let cursor: string | undefined;
  try {
    while (!res.destroyed) {
      const rows = await db.select().from(invoices).where(cursor ? gt(invoices.id, cursor) : undefined).orderBy(asc(invoices.id)).limit(500);
      if (!rows.length) break;
      for (const row of rows) {
        const line = columns.map((key) => csvCell(row[key] instanceof Date ? (row[key] as Date).toISOString() : row[key])).join(",");
        if (!res.write(`${line}\r\n`)) await once(res, "drain");
      }
      cursor = rows.at(-1)!.id;
    }
    res.end();
  } catch {
    req.log.error("Payment CSV export interrupted");
    res.destroy();
  }
});
export default router;
