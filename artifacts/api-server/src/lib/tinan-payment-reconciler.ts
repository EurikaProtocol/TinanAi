import { and, inArray, isNotNull, sql } from "drizzle-orm";
import { db, tinanPaymentInvoicesTable as invoices } from "@workspace/db";
import { verifyOwnedInvoice } from "./tinan-payment-verification";
import { logger } from "./logger";

/** Submitted invoices progress even after the browser is closed. No signing. */
export function startPaymentReconciler() {
  let active = false;
  const timer = setInterval(() => {
    if (active) return;
    active = true;
    void (async () => {
      try {
        const pending = await db.select().from(invoices)
          .where(and(inArray(invoices.status, ["pending", "confirming"]), isNotNull(invoices.txHash)))
          .orderBy(sql`${invoices.lastCheckedAt} asc nulls first`).limit(10);
        for (const invoice of pending) {
          try { await verifyOwnedInvoice(invoice.ownerId, invoice.id, invoice.txHash as `0x${string}`); }
          catch {
            logger.warn({ invoiceId: invoice.id }, "Payment remains unverified; reconciler will retry");
          }
        }
      } catch {
        logger.warn("Payment reconciliation unavailable; submitted transactions remain unverified");
      } finally { active = false; }
    })();
  }, 30_000);
  timer.unref();
  return () => clearInterval(timer);
}
