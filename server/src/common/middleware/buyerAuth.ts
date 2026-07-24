import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "@/common/env";
import { prisma } from "@/common/prisma";
import { UnauthorizedError } from "@/common/errors/AppError";
import { asyncHandler } from "@/common/middleware/asyncHandler";

export interface BuyerAuthPayload {
  buyerId: string;
  sessionToken: string;
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      buyer?: BuyerAuthPayload;
    }
  }
}

export function signBuyerToken(payload: BuyerAuthPayload): string {
  return jwt.sign(payload, env.buyerJwtSecret, {
    expiresIn: env.buyerJwtExpiresIn as jwt.SignOptions["expiresIn"],
  });
}

/** Verifies the JWT, then checks the embedded sessionToken still matches the Buyer row's
 *  currentSessionToken — a newer login elsewhere overwrites that column, so this is what
 *  actually enforces "single session" rather than just being a stateless JWT check.
 *
 *  Wrapped in asyncHandler: this is an async function used directly as Express middleware,
 *  and Express 4 does not await middleware or catch rejected promises on its own. Without
 *  this wrapper, every throw here (missing header, expired token, invalidated session —
 *  all routine, expected cases) became an unhandled promise rejection that crashed the
 *  entire Node process, taking down both apps sharing this backend. */
export const requireBuyerAuth = asyncHandler(async (req: Request, _res: Response, next: NextFunction) => {
  const header = req.headers.authorization;
  if (!header?.startsWith("Bearer ")) {
    throw new UnauthorizedError("Missing or malformed Authorization header");
  }

  const token = header.slice("Bearer ".length);
  let payload: BuyerAuthPayload;
  try {
    payload = jwt.verify(token, env.buyerJwtSecret) as BuyerAuthPayload;
  } catch {
    throw new UnauthorizedError("Invalid or expired token");
  }

  const buyer = await prisma.buyer.findUnique({ where: { id: payload.buyerId } });
  if (!buyer || !buyer.isActive || buyer.currentSessionToken !== payload.sessionToken) {
    throw new UnauthorizedError("Session expired — this account signed in elsewhere");
  }

  req.buyer = payload;
  next();
});
