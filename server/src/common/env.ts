function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: parseInt(process.env.PORT ?? "4000", 10),
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrl: required("DATABASE_URL"),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
  // Comma-separated — the internal Sales OS and the buyer-facing marketplace are two
  // different origins hitting this same backend, so a single CORS_ORIGIN string isn't
  // enough once the marketplace frontend exists.
  corsOrigins: (
    process.env.CORS_ORIGIN ??
    "http://localhost:5173,https://leadstack.equidamai.com,https://leadstack-ivrv.onrender.com,https://naraway-sales-1.onrender.com"
  )
    .split(",")
    .map((origin) => origin.trim()),
  // Deliberately a separate secret from jwtSecret: a buyer token must never verify
  // successfully against staff auth, or vice versa, even if one secret were ever leaked.
  buyerJwtSecret: required("BUYER_JWT_SECRET"),
  buyerJwtExpiresIn: process.env.BUYER_JWT_EXPIRES_IN ?? "8h",
  // Used to build the link inside the self-signup verification email.
  marketplaceUrl: process.env.MARKETPLACE_URL ?? "https://leadstack.equidamai.com",
  // Auth0 tenant used for "Log in with Google" — an alternate path onto the same buyer
  // session, alongside (not replacing) the existing email/password login. Domain and
  // client ID are public identifiers (not secrets), safe in frontend code and here.
  auth0Domain: process.env.AUTH0_DOMAIN ?? "dev-ogn7ve1a25oeyx1.us.auth0.com",
  auth0ClientId: process.env.AUTH0_CLIENT_ID ?? "37OE61aw5fEJdd9DSDECBU9jSCCTqX5u",
  // Used by the keepalive ping to hit our own /health endpoint (Render's free tier only
  // counts inbound traffic as activity). Defaults to the known production backend URL.
  selfUrl: process.env.SELF_URL ?? "https://naraway-sales.onrender.com",
  razorpayKeyId: required("RAZORPAY_KEY_ID"),
  razorpayKeySecret: required("RAZORPAY_KEY_SECRET"),
  razorpayWebhookSecret: required("RAZORPAY_WEBHOOK_SECRET"),
};
