import assert from "node:assert/strict";
import { after, test } from "node:test";
import { randomUUID } from "node:crypto";
import express from "express";
import { eq, or, sql } from "drizzle-orm";
import { db, pool, tinanPaymentAdminsTable as admins, tinanPaymentAuditTable as audit } from "@workspace/db";
import { assertAdminEnvironment, bootstrapConfiguredPaymentAdmin, changePaymentAdmin, resolveVerifiedPaymentOwner } from "./tinan-payment-admin-bootstrap";
import { isPaymentAdmin } from "./tinan-payment-store";
import { assertPaymentAdminConfirmation, paymentAdminConfirmation, paymentAdminErrorOutput, paymentAdminStatusOutput } from "./tinan-payment-admin-output";
import adminRouter from "../routes/tinan-payments-admin";

const identity = () => `admin-test-${randomUUID()}`;
test("operator confirmation references are bound to owner and environment without exposing identity", () => {
  const owner = identity();
  const reference = paymentAdminConfirmation(owner, "development");
  assert.match(reference, /^sha256:[a-f0-9]{64}$/);
  assert.equal(reference.includes(owner), false);
  assert.equal(reference, paymentAdminConfirmation(owner, "development"));
  assert.notEqual(reference, paymentAdminConfirmation(owner, "production"));
  assert.notEqual(reference, paymentAdminConfirmation(identity(), "development"));
});
test("operator mutations require matching confirmation and preserve independently verified legacy IDs", () => {
  const owner = identity();
  const reference = paymentAdminConfirmation(owner, "development");
  assert.doesNotThrow(() => assertPaymentAdminConfirmation("check", owner, "development"));
  for (const mode of ["grant", "revoke"] as const) {
    assert.doesNotThrow(() => assertPaymentAdminConfirmation(mode, owner, "development", reference));
    assert.doesNotThrow(() => assertPaymentAdminConfirmation(mode, owner, "development", undefined, owner));
    assert.throws(() => assertPaymentAdminConfirmation(mode, owner, "development"));
    assert.throws(() => assertPaymentAdminConfirmation(mode, owner, "production", reference));
    assert.throws(() => assertPaymentAdminConfirmation(mode, identity(), "development", reference));
    assert.throws(() => assertPaymentAdminConfirmation(mode, owner, "development", "sha256:bad"));
    assert.throws(() => assertPaymentAdminConfirmation(mode, owner, "development", reference, owner));
  }
});
test("operator status output allows only booleans, operation metadata and the confirmation reference", () => {
  const owner = identity();
  const state = { isAdmin: true, bootstrapConsumed: false, changed: false,
    email: "fixture@example.test", ownerUserId: owner, secret: "fixture-sensitive-data" };
  const output = paymentAdminStatusOutput("development", "check", state, paymentAdminConfirmation(owner, "development"));
  assert.deepEqual(Object.keys(JSON.parse(output)).sort(),
    ["environment", "mode", "ownerConfirmation", "isAdmin", "bootstrapConsumed", "changed"].sort());
  for (const sensitive of [owner, state.email, state.secret]) assert.equal(output.includes(sensitive), false);
  assert.throws(() => paymentAdminStatusOutput("development", "check", state, state.email));
});
test("operator error output never passes through provider messages or prefix-spoofed secrets", () => {
  for (const error of [
    new Error("Expected exactly fixture@example.test"),
    new Error("The Clerk instance credential=fixture-sensitive-data"),
    new Error("database connection string: fixture-sensitive-data"), "fixture@example.test",
  ]) {
    const output = paymentAdminErrorOutput(error);
    assert.equal(output.includes("fixture@"), false);
    assert.equal(output.includes("fixture-sensitive"), false);
  }
  assert.equal(paymentAdminErrorOutput(new Error("Invalid operator arguments.")), "Invalid operator arguments.");
});
async function cleanup(id: string) {
  await db.delete(admins).where(eq(admins.ownerId, id));
  await db.delete(audit).where(or(eq(audit.actorId, id), sql`${audit.details}->>'targetOwnerId' = ${id}`));
}
test("environment checks reject missing/mismatched instances and production from a development runtime", () => {
  assert.throws(() => assertAdminEnvironment(undefined, {}));
  assert.throws(() => assertAdminEnvironment("production", { CLERK_PUBLISHABLE_KEY: "pk_test_fixture", NODE_ENV: "production" }));
  assert.throws(() => assertAdminEnvironment("production", { CLERK_PUBLISHABLE_KEY: "pk_live_fixture", NODE_ENV: "development" }));
  assert.equal(assertAdminEnvironment("development", { CLERK_PUBLISHABLE_KEY: "pk_test_fixture" }), "development");
});
test("owner resolution requires one exact verified, active account; metadata does not grant roles", async () => {
  const user = { id: identity(), banned: false, locked: false, publicMetadata: { role: "payment_admin" },
    emailAddresses: [{ emailAddress: "owner@example.test", verification: { status: "verified" } }] };
  const client = (data: unknown[]) => ({ getUserList: async () => ({ data }) }) as unknown as NonNullable<Parameters<typeof resolveVerifiedPaymentOwner>[1]>;
  assert.equal(await resolveVerifiedPaymentOwner("OWNER@example.test", client([user])), user.id);
  for (const users of [[], [user, user], [{ ...user, banned: true }], [{ ...user, locked: true }],
    [{ ...user, emailAddresses: [{ emailAddress: "owner@example.test", verification: { status: "unverified" } }] }],
    [{ ...user, emailAddresses: [{ emailAddress: "someone@example.test", verification: { status: "verified" } }] }]]) {
    await assert.rejects(resolveVerifiedPaymentOwner("owner@example.test", client(users)));
  }
  assert.equal(await isPaymentAdmin(user.id), false);
});
test("production startup bootstrap is inert unless explicitly enabled", async () => {
  assert.equal(await bootstrapConfiguredPaymentAdmin({}), "disabled");
  await assert.rejects(bootstrapConfiguredPaymentAdmin({ TINANAI_PAYMENT_ADMIN_BOOTSTRAP_ENABLED: "true", NODE_ENV: "development", CLERK_PUBLISHABLE_KEY: "pk_test_fixture" }));
});
test("owner grants are atomic, auditable, concurrent-idempotent and never restore revoked access", async () => {
  const owner = identity();
  try {
    assert.deepEqual(await changePaymentAdmin(owner, "check", "development"), { isAdmin: false, bootstrapConsumed: false, changed: false });
    const results = await Promise.all([changePaymentAdmin(owner, "grant", "development"), changePaymentAdmin(owner, "grant", "development")]);
    assert.equal(results.filter(r => r.changed).length, 1);
    assert.equal(await isPaymentAdmin(owner), true);
    const rows = await db.select().from(audit).where(sql`${audit.details}->>'targetOwnerId' = ${owner}`);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.actorId, "owner-controlled-cli");
    assert.equal(rows[0]!.action, "payment_admin_owner_granted");
    assert.equal((rows[0]!.details as { role: string }).role, "payment_admin");
    assert.equal((await changePaymentAdmin(owner, "revoke", "development")).changed, true);
    assert.deepEqual(await changePaymentAdmin(owner, "grant", "development"), { isAdmin: false, bootstrapConsumed: true, changed: false });
    assert.equal(await isPaymentAdmin(owner), false);
  } finally { await cleanup(owner); }
});
test("legacy revoked owner grants also cannot be silently bootstrapped again", async () => {
  const owner = identity();
  try {
    await db.insert(audit).values({ id: randomUUID(), actorId: owner, action: "admin_revoked_by_owner_cli", details: { source: "test" } });
    assert.equal((await changePaymentAdmin(owner, "grant", "development")).isAdmin, false);
  } finally { await cleanup(owner); }
});
test("admin router denies unlisted accounts and wallet headers, permits granted reads, and keeps retired preflight disabled", async () => {
  const owner = identity(), other = identity();
  const app = express();
  app.use(express.json());
  // Test-only authenticated-subject fixture. Production still derives this from getAuth(req).
  app.use((req, res, next) => { res.locals.paymentOwnerId = req.headers["x-test-subject"] ?? other; next(); });
  app.use(adminRouter);
  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>(resolve => server.once("listening", resolve));
  const address = server.address() as { port: number };
  const url = `http://127.0.0.1:${address.port}/tinanai/payments/admin`;
  const rpc = process.env.TINANAI_MAINNET_RPC_URL;
  delete process.env.TINANAI_MAINNET_RPC_URL;
  try {
    for (const suffix of ["", "/mainnet", "/mainnet/preflight"]) {
      const response = await fetch(url + suffix, { method: suffix.endsWith("preflight") ? "POST" : "GET",
        headers: { "x-test-subject": other, "x-wallet-address": "0x1111111111111111111111111111111111111111", "x-role": "payment_admin" } });
      assert.equal(response.status, 403);
    }
    assert.equal((await fetch(url + "/mainnet", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ role: "payment_admin" }) })).status, 403);
    await changePaymentAdmin(owner, "grant", "development");
    assert.equal((await fetch(url, { headers: { "x-test-subject": owner } })).status, 200);
    assert.equal((await fetch(url + "/mainnet", { headers: { "x-test-subject": owner } })).status, 200);
    const preflight = await fetch(url + "/mainnet/preflight", { method: "POST", headers: { "x-test-subject": owner, "content-type": "application/json" },
      body: JSON.stringify({ connectedAddress: null, walletChainId: null, connectorType: null }) });
    assert.equal(preflight.status, 409);
    assert.match(((await preflight.json()) as { error: string }).error, /Legacy preflight disabled/);
    await changePaymentAdmin(owner, "revoke", "development");
    assert.equal((await fetch(url + "/mainnet", { headers: { "x-test-subject": owner } })).status, 403);
  } finally {
    if (rpc === undefined) delete process.env.TINANAI_MAINNET_RPC_URL; else process.env.TINANAI_MAINNET_RPC_URL = rpc;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await cleanup(owner);
  }
});
after(() => pool.end());
