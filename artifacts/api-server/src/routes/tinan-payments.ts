import { createHash, randomUUID } from "node:crypto";
import { Router, type ErrorRequestHandler, type IRouter } from "express";
import { getAuth } from "@clerk/express";
import { and, eq, gte, sql } from "drizzle-orm";
import { db, tinanPaymentChallengesTable as challenges, tinanPaymentInvoicesTable as invoices, tinanPaymentSettingsTable as settings, tinanPaymentServicesTable as services } from "@workspace/db";
import {
  CreateTinanPaymentChallengeBody, CreateTinanPaymentChallengeResponse,
  CreateTinanPaymentInvoiceBody, CreateTinanPaymentInvoiceResponse,
  GetTinanPaymentCatalogResponse, GetTinanPaymentAccountResponse,
  VerifyTinanPaymentInvoiceBody, VerifyTinanPaymentInvoiceParams, VerifyTinanPaymentInvoiceResponse,
} from "@workspace/api-zod";
import { paymentAddress, paymentClient, PaymentError, quoteAtomic, validatePaymentToken } from "../lib/tinan-payment-chain";
import { accountPayments, paymentCatalog, serializeInvoice } from "../lib/tinan-payment-store";
import { verifyOwnedInvoice } from "../lib/tinan-payment-verification";
import { createFixedWindowRateLimiter } from "../lib/fixed-window-rate-limit";
import adminRouter from "./tinan-payments-admin";
import marketplaceRouter from "./tinan-payments-marketplace";

const router: IRouter = Router();
const base = "/tinanai/payments";
const limiter = createFixedWindowRateLimiter({ windowMs: 60_000, maxRequests: 30 });
router.use(base, (_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
router.get(`${base}/catalog`, async (_req, res): Promise<void> => {
  res.json(GetTinanPaymentCatalogResponse.parse(await paymentCatalog()));
});
router.use(base, (req, res, next) => {
  const owner = getAuth(req).userId;
  if (!owner) { res.status(401).json({ error: "Sign in to manage TINAN payments." }); return; }
  // Reject cookie-only mutation requests: the existing Clerk client supplies
  // a validated bearer session token. No cross-origin ambient-cookie writes.
  if (req.method !== "GET" && !req.headers.authorization?.startsWith("Bearer ")) { res.status(403).json({ error: "A Clerk bearer token is required for payment changes." }); return; }
  if (!limiter.take(owner)) { res.setHeader("Retry-After", "60"); res.status(429).json({ error: "Too many payment requests. Retry in one minute." }); return; }
  res.locals.paymentOwnerId = owner;
  next();
});
router.get(`${base}/account`, async (_req, res): Promise<void> => {
  res.json(GetTinanPaymentAccountResponse.parse(await accountPayments(res.locals.paymentOwnerId)));
});
router.post(`${base}/challenge`, async (req, res): Promise<void> => {
  const body = CreateTinanPaymentChallengeBody.parse(req.body);
  const catalog = await paymentCatalog();
  if (!catalog.ready) throw new PaymentError(catalog.reason!, 409);
  const payer = paymentAddress(body.payer);
  if (payer.toLowerCase() === catalog.settings.treasuryAddress?.toLowerCase()) throw new PaymentError("The treasury cannot pay itself.");
  const ownerId = res.locals.paymentOwnerId as string;
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + 5 * 60_000);
  const account = createHash("sha256").update(ownerId).digest("hex").slice(0, 24);
  const message = [
    "TINANAI payment wallet authorization",
    `Host: ${req.get("host")}`, `Account reference: ${account}`, `Wallet: ${payer}`,
    `Chain ID: ${catalog.settings.chainId}`, `Challenge: ${id}`, `Expires: ${expiresAt.toISOString()}`,
    "Prove wallet ownership for one payment quote. This signature does not transfer tokens, grant an allowance or authorize a transaction.",
  ].join("\n");
  // Bound storage per account and remove old nonces without storing signatures.
  await db.delete(challenges).where(and(eq(challenges.ownerId, ownerId), sql`${challenges.expiresAt} < now()`));
  const active = await db.select({ id: challenges.id }).from(challenges).where(and(eq(challenges.ownerId, ownerId), sql`${challenges.usedAt} is null`));
  if (active.length >= 10) throw new PaymentError("Too many unexpired wallet challenges. Wait five minutes.", 429);
  await db.insert(challenges).values({ id, ownerId, payer, chainId: catalog.settings.chainId, message, expiresAt });
  res.status(201).json(CreateTinanPaymentChallengeResponse.parse({ id, message, expiresAt: expiresAt.toISOString() }));
});
router.post(`${base}/invoices`, async (req, res): Promise<void> => {
  const body = CreateTinanPaymentInvoiceBody.parse(req.body);
  const ownerId = res.locals.paymentOwnerId as string;
  const catalog = await paymentCatalog();
  if (!catalog.ready) throw new PaymentError(catalog.reason!, 409);
  const service = catalog.services.find((s) => s.slug === body.serviceSlug);
  if (!service?.enabled || !service.requiresPayment || !service.eurCents) throw new PaymentError("This service is not configured for paid usage.", 409);
  const [challenge] = await db.select().from(challenges).where(and(eq(challenges.id, body.challengeId), eq(challenges.ownerId, ownerId)));
  if (!challenge || challenge.usedAt || challenge.expiresAt.getTime() <= Date.now() || challenge.chainId !== catalog.settings.chainId) throw new PaymentError("Wallet challenge is invalid, used, expired or on another network.");
  const client = paymentClient(catalog.settings.chainId);
  const signed = await client.verifyMessage({ address: paymentAddress(challenge.payer), message: challenge.message, signature: body.signature as `0x${string}` });
  if (!signed) throw new PaymentError("Wallet ownership signature is invalid.");
  const tokenAddress = paymentAddress(catalog.settings.tokenAddress!);
  const treasuryAddress = paymentAddress(catalog.settings.treasuryAddress!);
  const minBlock = await validatePaymentToken(catalog.settings.chainId, tokenAddress, client);
  const amountAtomic = quoteAtomic(service.eurCents, catalog.settings.tinanPerEur!);
  const createdAt = new Date();
  const result = await db.transaction(async (tx) => {
    // Serializes quote creation with admin configuration changes.
    const [current] = await tx.select().from(settings).where(eq(settings.id, "default")).for("update");
    if (!current?.enabled || current.revision !== catalog.settings.revision) throw new PaymentError("Payment configuration changed. Request a new quote.", 409);
    const [nonce] = await tx.select().from(challenges).where(eq(challenges.id, challenge.id)).for("update");
    if (!nonce || nonce.usedAt || nonce.expiresAt.getTime() <= Date.now()) throw new PaymentError("Wallet challenge expired or was already used.");
    const recent = await tx.select({ id: invoices.id }).from(invoices).where(and(eq(invoices.ownerId, ownerId), gte(invoices.createdAt, new Date(Date.now() - 60 * 60_000))));
    if (recent.length >= 30) throw new PaymentError("Invoice limit reached. Retry later.", 429);
    await tx.update(challenges).set({ usedAt: new Date() }).where(eq(challenges.id, nonce.id));
    const [invoice] = await tx.insert(invoices).values({
      id: randomUUID(), ownerId, serviceSlug: service.slug, serviceName: service.name,
      payer: challenge.payer.toLowerCase(), chainId: current.chainId,
      tokenAddress: tokenAddress.toLowerCase(), treasuryAddress: treasuryAddress.toLowerCase(),
      eurCents: service.eurCents!, tinanPerEur: current.tinanPerEur!, rateSource: current.rateSource,
      amountAtomic, configRevision: current.revision, requiredConfirmations: current.confirmations,
      minBlock: minBlock.toString(), createdAt, expiresAt: new Date(createdAt.getTime() + 15 * 60_000),
    }).returning();
    return serializeInvoice(invoice!);
  });
  res.status(201).json(CreateTinanPaymentInvoiceResponse.parse(result));
});
router.post(`${base}/invoices/:id/verify`, async (req, res): Promise<void> => {
  const { id } = VerifyTinanPaymentInvoiceParams.parse(req.params);
  const { txHash } = VerifyTinanPaymentInvoiceBody.parse(req.body);
  res.json(VerifyTinanPaymentInvoiceResponse.parse(await verifyOwnedInvoice(res.locals.paymentOwnerId, id, txHash as `0x${string}`)));
});
router.use(marketplaceRouter);
router.use(adminRouter);
const handleErrors: ErrorRequestHandler = (error, req, res, _next) => {
  if (res.headersSent) return;
  const code = error?.code ?? error?.cause?.code;
  const invalid = error?.name === "ZodError";
  if (error instanceof PaymentError) { res.status(error.status).json({ error: error.message }); return; }
  if (code === "23505") { res.status(409).json({ error: "This transaction is already assigned to an invoice. It cannot grant a second credit." }); return; }
  if (invalid) { res.status(400).json({ error: "Invalid payment request. Check the submitted fields." }); return; }
  req.log.error({ errorName: error instanceof Error ? error.name : "UnknownError" }, "TINAN payment operation unavailable");
  res.status(503).json({ error: "Payment storage or RPC verification is temporarily unavailable. No new service credit was granted. Retry safely with the same transaction hash." });
};
router.use(handleErrors);
export default router;
