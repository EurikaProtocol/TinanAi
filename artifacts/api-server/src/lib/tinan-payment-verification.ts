import { and, eq } from "drizzle-orm";
import { db, tinanPaymentInvoicesTable as invoices } from "@workspace/db";
import type { Hash, PublicClient } from "viem";
import { PaymentError, verifyInvoiceTransfer } from "./tinan-payment-chain";
import { serializeInvoice } from "./tinan-payment-store";

export async function verifyOwnedInvoice(ownerId: string, id: string, hash: Hash, client?: PublicClient) {
  const normalizedHash = hash.toLowerCase() as Hash;
  // The global (chain, tx hash) uniqueness constraint reserves the transfer
  // before RPC work. Parallel accounts/instances cannot consume it twice.
  await db.transaction(async (tx) => {
    const [invoice] = await tx.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.ownerId, ownerId))).for("update");
    if (!invoice) throw new PaymentError("Invoice not found.", 404);
    if (invoice.txHash && invoice.txHash !== normalizedHash) throw new PaymentError("This invoice already tracks a different transaction.", 409);
    if (invoice.status === "confirmed" || invoice.status === "failed") return;
    await tx.update(invoices).set({ txHash: normalizedHash, status: "pending", error: null, lastCheckedAt: new Date() }).where(eq(invoices.id, id));
  });
  const [invoice] = await db.select().from(invoices).where(and(eq(invoices.id, id), eq(invoices.ownerId, ownerId)));
  if (!invoice) throw new PaymentError("Invoice not found.", 404);
  if (invoice.status === "confirmed" || invoice.status === "failed") return serializeInvoice(invoice);
  // RPC failure is retryable and cannot grant a service credit or mark a
  // potentially successful transaction as a failed payment.
  const verification = await verifyInvoiceTransfer(invoice, normalizedHash, client);
  return db.transaction(async (tx) => {
    const [current] = await tx.select().from(invoices).where(eq(invoices.id, id)).for("update");
    if (!current) throw new PaymentError("Invoice not found.", 404);
    if (current.status === "confirmed" || current.status === "failed") return serializeInvoice(current);
    const [updated] = await tx.update(invoices).set({
      ...verification,
      confirmedAt: verification.status === "confirmed" ? new Date() : null,
      creditRemaining: verification.status === "confirmed" ? 1 : 0,
    }).where(eq(invoices.id, id)).returning();
    return serializeInvoice(updated!);
  });
}
