import { createHash, timingSafeEqual } from "node:crypto";

type Environment = "development" | "production";
type Mode = "check" | "grant" | "revoke";
type Status = { isAdmin: boolean; bootstrapConsumed: boolean; changed: boolean };

const confirmationError = "First run the read-only check, then pass its exact --confirm-owner reference (or an independently verified --confirm-user-id). No privileges changed.";
const fallbackError = "Owner grant check failed. Verify server-side Clerk/database configuration. No grant was confirmed.";
const safeErrors = new Set([
  "Invalid operator arguments.",
  "Duplicate operator arguments are not allowed.",
  "Specify --environment=development or --environment=production.",
  "The Clerk instance does not match the requested environment. No privileges changed.",
  "Production grants must run inside the production runtime, not the development workspace.",
  "An owner-designated verified email is required.",
  "Expected exactly one existing, verified, active owner account in this Clerk environment. No privileges changed.",
  confirmationError,
]);

/** Pseudonymous confirmation reference, not a credential or anonymous identifier. */
export function paymentAdminConfirmation(ownerId: string, environment: Environment) {
  const digest = createHash("sha256")
    .update(`tinanai-payment-admin-confirmation:v1\0${environment}\0${ownerId}`)
    .digest("hex");
  return `sha256:${digest}`;
}

export function assertPaymentAdminConfirmation(
  mode: Mode, ownerId: string, environment: Environment,
  reference?: string, legacyUserId?: string,
) {
  if (reference !== undefined && legacyUserId !== undefined) throw new Error("Invalid operator arguments.");
  if (mode === "check") return;
  const referenceMatches = reference !== undefined && /^sha256:[a-f0-9]{64}$/.test(reference) &&
    timingSafeEqual(Buffer.from(reference), Buffer.from(paymentAdminConfirmation(ownerId, environment)));
  if (!referenceMatches && legacyUserId !== ownerId) throw new Error(confirmationError);
}

/** Explicit allowlist: never serialize identities, provider responses or extra state fields. */
export function paymentAdminStatusOutput(
  environment: Environment, mode: Mode, status: Status, ownerConfirmation: string,
) {
  if (!/^sha256:[a-f0-9]{64}$/.test(ownerConfirmation)) throw new Error("Invalid operator arguments.");
  return JSON.stringify({
    environment,
    mode,
    ownerConfirmation,
    isAdmin: status.isAdmin === true,
    bootstrapConsumed: status.bootstrapConsumed === true,
    changed: status.changed === true,
  }, null, 2) + "\n";
}

/** Prefix matching is unsafe: a provider error may append secrets to a familiar prefix. */
export function paymentAdminErrorOutput(error: unknown) {
  return error instanceof Error && safeErrors.has(error.message) ? error.message : fallbackError;
}
