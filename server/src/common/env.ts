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
  corsOrigins: (process.env.CORS_ORIGIN ?? "http://localhost:5173")
    .split(",")
    .map((origin) => origin.trim()),
  // Deliberately a separate secret from jwtSecret: a buyer token must never verify
  // successfully against staff auth, or vice versa, even if one secret were ever leaked.
  buyerJwtSecret: required("BUYER_JWT_SECRET"),
  buyerJwtExpiresIn: process.env.BUYER_JWT_EXPIRES_IN ?? "8h",
  razorpayKeyId: required("RAZORPAY_KEY_ID"),
  razorpayKeySecret: required("RAZORPAY_KEY_SECRET"),
  razorpayWebhookSecret: required("RAZORPAY_WEBHOOK_SECRET"),
};
