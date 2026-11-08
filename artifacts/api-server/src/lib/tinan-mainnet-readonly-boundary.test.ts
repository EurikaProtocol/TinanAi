import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
const read = (file: string) => readFileSync(new URL(file, import.meta.url), "utf8");
test("new diagnostics route has no persistence/catalog/simulation dependency and legacy POST is disabled", () => {
  const route = read("../routes/tinan-mainnet-admin.ts");
  const diagnostics = route.slice(route.indexOf('router.get("/diagnostics"'));
  for (const forbidden of ["db.insert", "db.update", "db.delete", "paymentCatalog(", "initializePayments(", "estimateGas(", "readOnlyMainnetPreflight("]) assert.ok(!diagnostics.includes(forbidden), forbidden);
  assert.match(diagnostics, /status\(409\)/);
  const auth = read("../routes/tinan-payments.ts");
  assert.ok(auth.indexOf("getAuth(req).userId") < auth.indexOf("router.use(adminRouter)"));
  const admin = read("../routes/tinan-payments-admin.ts");
  assert.ok(admin.indexOf("paymentAdminGate(isPaymentAdmin)") < admin.indexOf('router.use(`${base}/mainnet`'));
});
test("standalone frontend avoids payment hooks and disables simulation/transaction controls", () => {
  const component = read("../../../tinanai/src/components/mainnet-preparation.tsx");
  const page = read("../../../tinanai/src/pages/mainnet-preparation.tsx");
  for (const forbidden of ["usePaymentAccount(", "usePaymentCatalog(", "usePaymentAdmin(", "runTinanMainnetPreflight(", "writeContract", "signMessage", "connectWalletConnect()"]) {
    assert.ok(!component.includes(forbidden)); assert.ok(!page.includes(forbidden));
  }
  assert.match(component, /<Btn disabled title=/);
  assert.ok(component.includes("wallet.refreshSession()"));
  assert.ok(component.includes("wallet.connectorType === 'walletConnect'"));
  assert.ok(component.includes("wallet.sessionRevision"));
});
test("CLI approval gate only SELECTs billing state; retired helper cannot estimate gas", () => {
  const gate = read("../../../../lib/tinanai-contracts/scripts/admin-mainnet-approval.ts");
  assert.ok(gate.includes("default_transaction_read_only=on"));
  assert.ok(gate.includes("payment.enabled !== false"));
  assert.ok(gate.includes("payment.token_address || payment.treasury_address || payment.tinan_per_eur"));
  for (const forbidden of ["paymentCatalog(", "initializePayments(", "pool.query(\"update", "pool.query(\"insert", "pool.query(\"delete"]) assert.ok(!gate.includes(forbidden));
  const legacy = read("./tinan-mainnet-preflight.ts");
  assert.ok(!legacy.includes("client.estimateGas("));
  assert.ok(!legacy.includes("client.estimateFeesPerGas("));
});
