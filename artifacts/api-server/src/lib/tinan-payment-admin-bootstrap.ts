import { randomUUID } from "node:crypto";
import { and, desc, eq, or, sql } from "drizzle-orm";
import { clerkClient } from "@clerk/express";
import { db, tinanPaymentAdminsTable as admins, tinanPaymentAuditTable as audit } from "@workspace/db";

export function assertAdminEnvironment(environment: string | undefined, env = process.env) {
  if (environment !== "development" && environment !== "production") throw new Error("Specify --environment=development or --environment=production.");
  const key = env.CLERK_PUBLISHABLE_KEY || env.VITE_CLERK_PUBLISHABLE_KEY;
  if (!key?.startsWith(environment === "production" ? "pk_live_" : "pk_test_")) {
    throw new Error("The Clerk instance does not match the requested environment. No privileges changed.");
  }
  if (environment === "production" && env.NODE_ENV !== "production") throw new Error("Production grants must run inside the production runtime, not the development workspace.");
  return environment;
}

export async function resolveVerifiedPaymentOwner(email: string, users = clerkClient.users) {
  const normalized = email.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(normalized)) throw new Error("An owner-designated verified email is required.");
  const result = await users.getUserList({ emailAddress: [normalized], limit: 100 });
  const matches = result.data.filter(user => user.emailAddresses.some(address =>
    address.emailAddress.toLowerCase() === normalized && address.verification?.status === "verified"));
  if (matches.length !== 1 || matches[0]!.banned || matches[0]!.locked) {
    throw new Error("Expected exactly one existing, verified, active owner account in this Clerk environment. No privileges changed.");
  }
  return matches[0]!.id;
}

async function roleStatus(ownerId: string, client: Pick<typeof db, "select"> = db) {
  const [role] = await client.select().from(admins).where(eq(admins.ownerId, ownerId));
  const [history] = await client.select({ id: audit.id }).from(audit).where(and(
    or(eq(audit.actorId, ownerId), sql`${audit.details}->>'targetOwnerId' = ${ownerId}`),
    sql`${audit.action} in ('admin_granted_by_owner_cli', 'admin_revoked_by_owner_cli', 'payment_admin_owner_granted', 'payment_admin_owner_revoked')`,
  )).orderBy(desc(audit.createdAt)).limit(1);
  return { isAdmin: Boolean(role), bootstrapConsumed: Boolean(history) };
}

/** Private operator operation. Never mounted as an HTTP endpoint. */
export async function changePaymentAdmin(ownerId: string, mode: "check" | "grant" | "revoke", environment: string) {
  if (mode === "check") return { ...await roleStatus(ownerId), changed: false };
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(791205314)`);
    const state = await roleStatus(ownerId, tx);
    if (mode === "grant" && (state.isAdmin || state.bootstrapConsumed)) return { ...state, changed: false };
    if (mode === "revoke" && !state.isAdmin) return { ...state, changed: false };
    if (mode === "grant") await tx.insert(admins).values({ ownerId });
    else await tx.delete(admins).where(eq(admins.ownerId, ownerId));
    await tx.insert(audit).values({
      id: randomUUID(), actorId: "owner-controlled-cli",
      action: mode === "grant" ? "payment_admin_owner_granted" : "payment_admin_owner_revoked",
      details: { targetOwnerId: ownerId, role: "payment_admin", source: "owner-controlled-runtime", environment, verifiedEmail: true },
    });
    return { isAdmin: mode === "grant", bootstrapConsumed: true, changed: true };
  });
}

/** Opt-in production bootstrap; a consumed/revoked grant is never restored. */
export async function bootstrapConfiguredPaymentAdmin(env = process.env) {
  if (env.TINANAI_PAYMENT_ADMIN_BOOTSTRAP_ENABLED !== "true") return "disabled";
  assertAdminEnvironment("production", env);
  const email = env.TINANAI_PAYMENT_ADMIN_BOOTSTRAP_EMAIL;
  if (!email) throw new Error("The production owner email is not configured.");
  const ownerId = await resolveVerifiedPaymentOwner(email);
  const state = await changePaymentAdmin(ownerId, "grant", "production");
  return state.changed ? "granted" : state.isAdmin ? "already-authorized" : "consumed-without-restoring-access";
}
