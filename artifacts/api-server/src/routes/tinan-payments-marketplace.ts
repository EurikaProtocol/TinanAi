import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import { and, desc, eq, gt } from "drizzle-orm";
import { db, tinanMarketplaceOrdersTable as orders, tinanPaymentInvoicesTable as invoices, tinanPaymentAuditTable as audit } from "@workspace/db";
import { CreateTinanMarketplaceOrderBody, CreateTinanMarketplaceOrderResponse, GetTinanMarketplaceOrdersResponse, UpdateTinanMarketplaceOrderBody, UpdateTinanMarketplaceOrderParams, UpdateTinanMarketplaceOrderResponse } from "@workspace/api-zod";
import { isPaymentAdmin } from "../lib/tinan-payment-store";
import { PaymentError } from "../lib/tinan-payment-chain";

const router: IRouter = Router();
type Order = typeof orders.$inferSelect;
function serialize(row: Order) {
  const { ownerId: _owner, ...rest } = row;
  return { ...rest, createdAt: row.createdAt.toISOString(), resolvedAt: row.resolvedAt?.toISOString() ?? null };
}
router.get("/tinanai/payments/marketplace-orders", async (_req, res): Promise<void> => {
  const ownerId = res.locals.paymentOwnerId as string;
  const admin = await isPaymentAdmin(ownerId);
  const rows = await db.select().from(orders).where(admin ? undefined : eq(orders.ownerId, ownerId)).orderBy(desc(orders.createdAt)).limit(200);
  res.json(GetTinanMarketplaceOrdersResponse.parse(rows.map(serialize)));
});
router.post("/tinanai/payments/marketplace-orders", async (req, res): Promise<void> => {
  const body = CreateTinanMarketplaceOrderBody.parse(req.body);
  if (body.request.trim().length < 10) throw new PaymentError("Describe the marketplace request in at least 10 non-padding characters.");
  const ownerId = res.locals.paymentOwnerId as string;
  const row = await db.transaction(async (tx) => {
    const [credit] = await tx.select().from(invoices).where(and(eq(invoices.ownerId, ownerId), eq(invoices.serviceSlug, "marketplace"), eq(invoices.status, "confirmed"), gt(invoices.creditRemaining, 0))).orderBy(invoices.createdAt).limit(1).for("update", { skipLocked: true });
    if (!credit) throw new PaymentError("A confirmed marketplace service credit is required.", 402);
    await tx.update(invoices).set({ creditRemaining: 0 }).where(eq(invoices.id, credit.id));
    const [order] = await tx.insert(orders).values({ id: randomUUID(), ownerId, invoiceId: credit.id, request: body.request.trim() }).returning();
    return order!;
  });
  res.status(201).json(CreateTinanMarketplaceOrderResponse.parse(serialize(row)));
});
router.patch("/tinanai/payments/admin/marketplace-orders/:id", async (req, res): Promise<void> => {
  const ownerId = res.locals.paymentOwnerId as string;
  if (!await isPaymentAdmin(ownerId)) throw new PaymentError("Administrator required.", 403);
  const { id } = UpdateTinanMarketplaceOrderParams.parse(req.params);
  const body = UpdateTinanMarketplaceOrderBody.parse(req.body);
  if (body.response.trim().length < 10) throw new PaymentError("Provide a resolution of at least 10 non-padding characters.");
  const row = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(orders).where(eq(orders.id, id)).for("update");
    if (!current) throw new PaymentError("Marketplace request not found.", 404);
    if (current.status !== "open") throw new PaymentError("This request was already resolved.", 409);
    if (body.status === "rejected") await tx.update(invoices).set({ creditRemaining: 1 }).where(eq(invoices.id, current.invoiceId));
    const [updated] = await tx.update(orders).set({ status: body.status, response: body.response.trim(), resolvedAt: new Date() }).where(eq(orders.id, id)).returning();
    await tx.insert(audit).values({ id: randomUUID(), actorId: ownerId, action: "marketplace_request_resolved", details: { orderId: id, status: body.status } });
    return updated!;
  });
  res.json(UpdateTinanMarketplaceOrderResponse.parse(serialize(row)));
});
export default router;
