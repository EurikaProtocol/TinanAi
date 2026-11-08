import type { RequestHandler } from "express";

/** Database-backed role check. A wallet observation never grants admin rights. */
export function paymentAdminGate(isAdmin: (ownerId: string) => Promise<boolean>): RequestHandler {
  return async (_req, res, next) => {
    const ownerId = res.locals.paymentOwnerId;
    if (typeof ownerId !== "string" || !ownerId) {
      res.status(401).json({ error: "Sign in required." });
      return;
    }
    if (!await isAdmin(ownerId)) {
      res.status(403).json({ error: "An authorized payments administrator is required." });
      return;
    }
    next();
  };
}
