import jwt from "jsonwebtoken";
import jwksClient from "jwks-rsa";
import { env } from "@/common/env";
import { UnauthorizedError } from "@/common/errors/AppError";

const client = jwksClient({
  jwksUri: `https://${env.auth0Domain}/.well-known/jwks.json`,
  cache: true,
  rateLimit: true,
});

function getSigningKey(kid: string): Promise<string> {
  return new Promise((resolve, reject) => {
    client.getSigningKey(kid, (err, key) => {
      if (err || !key) return reject(err ?? new Error("No signing key"));
      resolve(key.getPublicKey());
    });
  });
}

export interface Auth0Profile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
}

/** Verifies an Auth0-issued ID token (RS256, signed by this tenant's JWKS) and returns the
 *  buyer's identity from it. Google sign-in and email/password both flow through Auth0, so
 *  this is the one place that needs to know Auth0 exists — everything past this point reuses
 *  the app's own buyer session/JWT exactly like a normal email/password login. */
export async function verifyAuth0IdToken(idToken: string): Promise<Auth0Profile> {
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded || typeof decoded === "string" || !decoded.header.kid) {
    throw new UnauthorizedError("Invalid Auth0 token");
  }

  let publicKey: string;
  try {
    publicKey = await getSigningKey(decoded.header.kid);
  } catch {
    throw new UnauthorizedError("Could not verify Auth0 token");
  }

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(idToken, publicKey, {
      algorithms: ["RS256"],
      audience: env.auth0ClientId,
      issuer: `https://${env.auth0Domain}/`,
    }) as jwt.JwtPayload;
  } catch {
    throw new UnauthorizedError("Auth0 token failed verification");
  }

  if (!payload.email) {
    throw new UnauthorizedError("Auth0 account has no email");
  }

  return {
    sub: String(payload.sub),
    email: String(payload.email).toLowerCase(),
    emailVerified: Boolean(payload.email_verified),
    name: typeof payload.name === "string" ? payload.name : undefined,
  };
}
