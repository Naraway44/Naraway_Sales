// Hand-rolled Auth0 login via OAuth Authorization Code + PKCE — no @auth0/auth0-spa-js
// dependency, just the Web Crypto API and fetch. This is "Log in with Google" (and any
// other connection enabled on this Auth0 tenant) as an alternate path onto the same buyer
// session the email/password login already uses; the backend verifies the resulting ID
// token and mints our own JWT (see POST /buyer-auth/auth0-login) — Auth0 never issues our
// session token directly.
const AUTH0_DOMAIN = "dev-ogn7ve1a25oeyx1.us.auth0.com";
const AUTH0_CLIENT_ID = "37OE61aw5fEJdd9DSDECBU9jSCCTqX5u";
const VERIFIER_KEY = "leadstack_auth0_pkce_verifier";

function base64url(bytes: ArrayBuffer | Uint8Array): string {
  const arr = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes;
  let str = "";
  arr.forEach((b) => (str += String.fromCharCode(b)));
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomVerifier(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return base64url(bytes);
}

async function challengeFor(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64url(digest);
}

/** Redirects the browser to Auth0's Universal Login (hosted page with Google + any other
 *  connection enabled on the tenant, plus email/password if you want it there too). */
export async function redirectToAuth0Login(): Promise<void> {
  const verifier = randomVerifier();
  sessionStorage.setItem(VERIFIER_KEY, verifier);
  const challenge = await challengeFor(verifier);

  const url = new URL(`https://${AUTH0_DOMAIN}/authorize`);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", AUTH0_CLIENT_ID);
  url.searchParams.set("redirect_uri", `${window.location.origin}/login`);
  url.searchParams.set("scope", "openid profile email");
  url.searchParams.set("code_challenge", challenge);
  url.searchParams.set("code_challenge_method", "S256");
  // Nudges Auth0's Universal Login toward showing Google as a prominent option; the page
  // still shows every connection enabled on the tenant (including email/password).
  url.searchParams.set("connection_scope", "google-oauth2");
  window.location.assign(url.toString());
}

/** Call on the /login page on mount. If the URL carries an Auth0 redirect (?code=...),
 *  exchanges it for an ID token and returns it; otherwise returns null. Always strips the
 *  query string so a refresh doesn't try to reuse a spent code. */
export async function completeAuth0Redirect(): Promise<string | null> {
  const params = new URLSearchParams(window.location.search);
  const code = params.get("code");
  if (!code) return null;

  const verifier = sessionStorage.getItem(VERIFIER_KEY);
  sessionStorage.removeItem(VERIFIER_KEY);
  window.history.replaceState({}, "", window.location.pathname);

  if (params.get("error")) {
    throw new Error(params.get("error_description") ?? "Google sign-in failed");
  }
  if (!verifier) {
    throw new Error("Sign-in session expired — please try again");
  }

  const res = await fetch(`https://${AUTH0_DOMAIN}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      client_id: AUTH0_CLIENT_ID,
      code,
      redirect_uri: `${window.location.origin}/login`,
      code_verifier: verifier,
    }),
  });
  if (!res.ok) {
    throw new Error("Google sign-in failed — please try again");
  }
  const data = (await res.json()) as { id_token?: string };
  if (!data.id_token) {
    throw new Error("Google sign-in did not return an ID token");
  }
  return data.id_token;
}
