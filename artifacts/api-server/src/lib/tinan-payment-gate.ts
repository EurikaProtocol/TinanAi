import { getAuth } from "@clerk/express";
import type { Request, Response } from "express";
import { finishServiceCredit, reserveServiceCredit } from "./tinan-payment-store";
import { PaymentError } from "./tinan-payment-chain";

/** Call only after input/ownership/rate-limit validation, before costly work. */
export async function authorizePaidService(req: Request, res: Response, serviceSlug: string) {
  let reservationId;
  try { reservationId = await reserveServiceCredit(getAuth(req).userId, serviceSlug); }
  catch (error) {
    res.status(error instanceof PaymentError ? error.status : 503).json({
      error: error instanceof PaymentError ? error.message : "Service authorization is temporarily unavailable. No credit was consumed.",
      paymentsPath: "/payments",
    });
    return false;
  }
  if (!reservationId) return true;
  res.once("finish", () => {
    // A confirmed payment authorizes service execution, not successful model output.
    // Synchronous HTTP failures refund the credit. Accepted asynchronous runs consume it.
    void finishServiceCredit(reservationId, res.statusCode < 400).catch(() => {
      req.log.error({ reservationId }, "Could not finalize service credit; reservation requires review");
    });
  });
  return true;
}
