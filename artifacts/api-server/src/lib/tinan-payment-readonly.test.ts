import assert from "node:assert/strict";
import { beforeEach, test } from "node:test";
import { registerHooks } from "node:module";
import { readFileSync } from "node:fs";
import { applicationIdentity } from "./tinan-application-state.ts";
import { paymentAdminGate } from "./tinan-payment-admin-gate.ts";

// Load the ACTUAL store without bundling or opening a database connection.
// Every database mutation throws unless an explicit mutation test enables it.
const tables = Object.fromEntries(["settings", "services", "invoices", "admins", "audit", "usage"].map(name =>
  [name, new Proxy({ name }, { get: (target, key) => key === "name" ? target.name : String(key) })]));
let state: any;
let allowWrites = false;
const writes: string[] = [];
function insert(table: any) {
  if (!allowWrites) throw new Error(`Forbidden GET write: insert ${table.name}`);
  return { values(value: any) {
    const apply = () => {
      writes.push(`insert:${table.name}`);
      if (table.name === "settings") {
        if (state.settings) return [];
        state.settings = { ...value, tokenAddress: null, treasuryAddress: null, tinanPerEur: null, rateSource: "", revision: 0 };
        return [state.settings];
      }
      if (table.name === "services") {
        const added = value.filter((v: any) => !state.services.some((s: any) => s.slug === v.slug));
        state.services.push(...added);
        return added;
      }
      state.audit.push(value);
      return [];
    };
    const action: any = {
      onConflictDoNothing: () => action,
      returning: async () => apply(),
      then: (resolve: any, reject: any) => Promise.resolve().then(apply).then(resolve, reject),
    };
    return action;
  } };
}
const fakeDb = {
  select(projection?: unknown) {
    return { from(table: any) {
      const rows = () => table.name === "settings" ? state.settings ? [state.settings] : []
        : table.name === "services" ? state.services
        : table.name === "invoices" ? projection ? [] : state.invoices
        : table.name === "admins" ? state.isAdmin ? [{ ownerId: "admin" }] : [] : [];
      const chain: any = {
        where: () => chain, orderBy: () => chain, limit: () => chain, groupBy: () => chain, for: () => chain,
        then: (resolve: any, reject: any) => Promise.resolve(rows()).then(resolve, reject),
      };
      return chain;
    } };
  },
  insert,
  update() { throw new Error("Forbidden settings/invoice update"); },
  delete() { throw new Error("Forbidden history deletion"); },
  async execute() { assert.ok(allowWrites, "GET must not acquire mutation locks"); },
  async transaction(callback: any) {
    assert.ok(allowWrites, "GET must not start a mutation transaction");
    const previous = structuredClone(state);
    try { return await callback(fakeDb); }
    catch (error) { state = previous; throw error; }
  },
};
(globalThis as any).__tinanReadOnlyFixture = { db: fakeDb, tables };
const dbModule = `const f=globalThis.__tinanReadOnlyFixture;export const db=f.db;${Object.entries({
  tinanPaymentSettingsTable: "settings", tinanPaymentServicesTable: "services", tinanPaymentInvoicesTable: "invoices",
  tinanPaymentAdminsTable: "admins", tinanPaymentAuditTable: "audit", tinanPaymentUsageTable: "usage",
}).map(([exportName, name]) => `export const ${exportName}=f.tables.${name};`).join("")}`;
registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.endsWith("/tinan-payment-store.ts")) {
    if (specifier === "@workspace/db") return { url: `data:text/javascript,${encodeURIComponent(dbModule)}`, shortCircuit: true };
    if (specifier === "./tinan-payment-chain") return {
      url: `data:text/javascript,${encodeURIComponent('export class PaymentError extends Error {constructor(message,status=400){super(message);this.status=status;}} export const displayAtomic=value=>String(value);')}`,
      shortCircuit: true,
    };
  }
  return next(specifier, context);
} });
const store = await import("./tinan-payment-store.ts");
beforeEach(() => {
  allowWrites = false; writes.length = 0;
  state = {
    settings: { id: "default", chainId: 11155111, confirmations: 12, enabled: false, tokenAddress: null, treasuryAddress: null, tinanPerEur: null, rateSource: "", revision: 1 },
    services: store.defaultPaymentServices.map(s => ({ ...s, enabled: false, requiresPayment: false, eurCents: null })),
    invoices: [], audit: [{ action: "historical_audit" }], isAdmin: true,
  };
});
test("actual catalog and account reads preserve every configuration and audit value", async () => {
  const before = structuredClone(state);
  const catalog = await store.paymentCatalog();
  assert.equal(catalog.settings.confirmations, 12);
  assert.equal(catalog.settings.chainId, 11155111);
  assert.equal(catalog.ready, false);
  assert.equal((await store.accountPayments("admin")).isAdmin, true);
  assert.deepEqual(state, before); assert.deepEqual(writes, []);
});
test("GET does not upgrade an existing lower confirmation count", async () => {
  state.settings.confirmations = 2;
  assert.equal((await store.paymentCatalog()).settings.confirmations, 2);
  assert.equal(state.settings.confirmations, 2); assert.deepEqual(writes, []);
});
test("missing configuration fails explicitly without creating defaults", async () => {
  state.settings = null;
  await assert.rejects(store.paymentCatalog(), /not initialized/);
  assert.equal(state.settings, null); assert.deepEqual(writes, []);
});
test("missing services fail explicitly without inserts", async () => {
  state.services.pop();
  await assert.rejects(store.paymentCatalog(), /services are incomplete/);
  assert.deepEqual(writes, []);
});
test("expired quote is projected into response without changing invoice or history", async () => {
  state.invoices = [{ id: "expired", status: "created", txHash: null, error: null, requiredConfirmations: 2,
    amountAtomic: "100", createdAt: new Date(0), expiresAt: new Date(1), confirmedAt: null }];
  const before = structuredClone(state);
  const response = await store.accountPayments("admin");
  assert.equal(response.invoices[0].status, "expired");
  assert.equal(response.invoices[0].requiredConfirmations, 2);
  assert.deepEqual(state, before);
});
test("submitted expired quotes are not hidden as expired", async () => {
  const row = { status: "created", txHash: "0xsubmitted", error: null, requiredConfirmations: 12,
    amountAtomic: "100", createdAt: new Date(0), expiresAt: new Date(1), confirmedAt: null };
  assert.equal(store.serializeInvoice(row as any).status, "created");
});
test("explicit initialization is idempotent and never overwrites existing values", async () => {
  allowWrites = true;
  const before = structuredClone(state);
  assert.equal((await store.initializePayments("admin")).changed, false);
  assert.deepEqual(state, before);
});
test("explicit initialization creates disabled records with attributable previous/new audit", async () => {
  allowWrites = true; state.settings = null; state.services = [];
  await store.initializePayments("admin");
  assert.equal(state.settings.confirmations, 12); assert.equal(state.settings.chainId, 11155111);
  assert.equal(state.settings.enabled, false); assert.equal(state.settings.tokenAddress, null);
  const entry = state.audit.at(-1);
  assert.equal(entry.actorId, "admin"); assert.equal(entry.details.previousSettings, null);
  assert.equal(entry.details.newSettings.confirmations, 12);
  assert.equal(entry.details.addedServices.length, 6);
  assert.equal(state.audit[0].action, "historical_audit");
});
test("anonymous initialization is refused before any database write", async () => {
  await assert.rejects(store.initializePayments(""), /administrator/);
  assert.deepEqual(writes, []);
});
test("administrator gate independently denies anonymous and ordinary authenticated users", async () => {
  for (const [ownerId, isAdmin, expected] of [[undefined, false, 401], ["normal", false, 403], ["admin", true, 200]] as const) {
    let status = 200; let passed = false; let checks = 0;
    const res: any = { locals: { paymentOwnerId: ownerId }, status(code: number) { status = code; return this; }, json() {} };
    await paymentAdminGate(async () => { checks++; return isAdmin; })({} as any, res, () => { passed = true; });
    assert.equal(status, expected); assert.equal(passed, expected === 200);
    assert.equal(checks, ownerId ? 1 : 0);
  }
});
test("environment metadata never guesses a domain or exposes RPC/secrets", () => {
  const id = "1234567@2026-11-06T13:00:00.000Z";
  assert.deepEqual(applicationIdentity({ NODE_ENV: "production", TINANAI_BUILD_ID: id, TINANAI_MAINNET_RPC_URL: "https://secret.test" }), { environment: "production", buildId: id });
  assert.deepEqual(applicationIdentity({ NODE_ENV: "development" }), { environment: "development", buildId: null });
  assert.deepEqual(applicationIdentity({ TINANAI_BUILD_ID: "https://secret.test/token" }), { environment: "unknown", buildId: null });
});
test("startup cannot initialize settings/grant roles and admin mutations remain behind auth", () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
  const startup = read("../index.ts");
  assert.ok(!startup.includes("initializePayments(")); assert.ok(!startup.includes("bootstrapConfiguredPaymentAdmin("));
  const admin = read("../routes/tinan-payments-admin.ts");
  assert.ok(admin.indexOf("paymentAdminGate(isPaymentAdmin)") < admin.indexOf('router.post(`${base}/initialize`'));
  const auth = read("../routes/tinan-payments.ts");
  assert.ok(auth.indexOf("getAuth(req).userId") < auth.indexOf("router.use(adminRouter)"));
  const component = read("../../../tinanai/src/components/mainnet-preparation.tsx");
  assert.ok(!component.includes("confirmations 2 → 12 remain unapproved"));
  assert.ok(component.includes("config.data?.payment")); assert.ok(component.includes("separate-readiness"));
});
