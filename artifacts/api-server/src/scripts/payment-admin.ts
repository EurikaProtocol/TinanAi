import { pool } from "@workspace/db";
import { assertAdminEnvironment, changePaymentAdmin, resolveVerifiedPaymentOwner } from "../lib/tinan-payment-admin-bootstrap";
import { assertPaymentAdminConfirmation, paymentAdminConfirmation, paymentAdminErrorOutput, paymentAdminStatusOutput } from "../lib/tinan-payment-admin-output";

async function main() {
try {
  const args = process.argv.slice(2);
  const value = (key: string) => args.find(arg => arg.startsWith(`--${key}=`))?.slice(key.length + 3);
  const allowed = /^(--email=.+|--environment=(development|production)|--confirm-user-id=.+|--confirm-owner=sha256:[a-f0-9]{64}|--grant|--revoke)$/;
  if (args.some(arg => !allowed.test(arg)) || (args.includes("--grant") && args.includes("--revoke"))) throw new Error("Invalid operator arguments.");
  if (new Set(args.map(arg => arg.split("=")[0])).size !== args.length) throw new Error("Duplicate operator arguments are not allowed.");
  const environment = assertAdminEnvironment(value("environment"));
  const ownerId = await resolveVerifiedPaymentOwner(value("email") ?? "");
  const mode = args.includes("--grant") ? "grant" : args.includes("--revoke") ? "revoke" : "check";
  assertPaymentAdminConfirmation(mode, ownerId, environment, value("confirm-owner"), value("confirm-user-id"));
  const state = await changePaymentAdmin(ownerId, mode, environment);
  process.stdout.write(paymentAdminStatusOutput(environment, mode, state, paymentAdminConfirmation(ownerId, environment)));
  if (mode === "grant" && !state.isAdmin) {
    process.stderr.write("The one-time grant was previously consumed or revoked. It will not restore privileges.\n");
    process.exitCode = 2;
  }
} catch (error) {
  process.stderr.write(`${paymentAdminErrorOutput(error)}\n`);
  process.exitCode = 1;
} finally { await pool.end(); }
}
void main();
