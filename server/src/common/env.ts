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
  // Powers the landing page's voice assistant. Deliberately optional, not required(): with
  // no key set the assistant silently falls back to its built-in canned answers rather than
  // the whole server refusing to boot over a marketing feature.
  //
  // Defaults target Groq (keys begin "gsk_"), whose API is OpenAI-compatible. Any other
  // OpenAI-compatible provider works by overriding the base URL and model — e.g. xAI's Grok
  // is https://api.x.ai/v1 with a key beginning "xai-". Note Groq and Grok are different
  // companies with near-identical names; the key prefix is what tells them apart.
  // Accepts the provider-neutral name first, then the Groq-specific ones, so an existing
  // GROQ_API/GROQ_API_KEY in the deploy environment works without being renamed.
  assistantApiKey:
    process.env.ASSISTANT_API_KEY ?? process.env.GROQ_API_KEY ?? process.env.GROQ_API ?? "",
  assistantBaseUrl: process.env.ASSISTANT_BASE_URL ?? "https://api.groq.com/openai/v1",
  // Providers decommission models without notice, and a dead model name fails silently as
  // "the assistant just gives canned answers". If that happens, check the live list at
  // GET /v1/models on the provider and set ASSISTANT_MODEL rather than editing this.
  // Small on purpose: the answers are two or three spoken sentences from a fixed brief, so
  // latency matters far more than reasoning depth, and this is a public endpoint whose cost
  // scales with anonymous traffic.
  assistantModel: process.env.ASSISTANT_MODEL ?? "openai/gpt-oss-20b",
  razorpayKeyId: required("RAZORPAY_KEY_ID"),
  razorpayKeySecret: required("RAZORPAY_KEY_SECRET"),
  razorpayWebhookSecret: required("RAZORPAY_WEBHOOK_SECRET"),
};
