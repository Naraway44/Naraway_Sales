/**
 * Zoho SMTP transport for grants notifications.
 *
 * Credentials come from env, never from source: this file is committed to a remote,
 * and a literal password would persist in git history and ship inside dist/.
 * Set them in the Render dashboard once.
 *
 *   GRANTS_SMTP_HOST=smtp.zoho.in       (smtp.zoho.com for non-India accounts)
 *   GRANTS_SMTP_PORT=465
 *   GRANTS_SMTP_USER=team@naraway.com
 *   GRANTS_SMTP_PASS=<app password from Zoho>
 *   GRANTS_SMTP_FROM="Naraway Grants <team@naraway.com>"
 *
 * Zoho requires the From address to match the authenticated mailbox (or a verified
 * alias of it), otherwise it rejects the message with a relay error.
 */
import nodemailer, { type Transporter } from "nodemailer";

export type MailResult = {
  ok: boolean;
  mode: "sent" | "simulated" | "failed";
  detail: string;
};

/**
 * Zoho counts every BCC recipient individually against the mailbox's daily and
 * hourly quota — a cohort mail to 67 clients costs 67 recipients, not 1.
 * Caps here are conservative defaults; raise once the real plan limit is known.
 */
export const RECIPIENTS_PER_MESSAGE_CAP = Math.max(
  1,
  parseInt(process.env.GRANTS_SMTP_MAX_RECIPIENTS_PER_MSG ?? "50", 10)
);

let cached: Transporter | null = null;

export function smtpConfigured(): boolean {
  return Boolean(process.env.GRANTS_SMTP_HOST?.trim() && process.env.GRANTS_SMTP_USER?.trim() && process.env.GRANTS_SMTP_PASS);
}

function transporter(): Transporter {
  if (cached) return cached;

  const port = parseInt(process.env.GRANTS_SMTP_PORT ?? "465", 10);
  cached = nodemailer.createTransport({
    host: process.env.GRANTS_SMTP_HOST!.trim(),
    port,
    secure: port === 465, // 465 = implicit TLS, 587 = STARTTLS
    auth: {
      user: process.env.GRANTS_SMTP_USER!.trim(),
      pass: process.env.GRANTS_SMTP_PASS!,
    },
    // Reuse one connection across a cohort run rather than reconnecting per send,
    // and stay under Zoho's per-connection message rate.
    pool: true,
    maxConnections: 1,
    maxMessages: 50,
    rateDelta: 1000,
    rateLimit: 2,
  });
  return cached;
}

export function fromAddress(): string {
  return (
    process.env.GRANTS_SMTP_FROM?.trim() ||
    process.env.GRANTS_SMTP_USER?.trim() ||
    "grants@naraway.com"
  );
}

/** Verifies credentials against Zoho without sending. Used by the health endpoint. */
export async function verifySmtp(): Promise<MailResult> {
  if (!smtpConfigured()) {
    return { ok: false, mode: "failed", detail: "SMTP not configured (need GRANTS_SMTP_HOST/USER/PASS)" };
  }
  try {
    await transporter().verify();
    return { ok: true, mode: "sent", detail: `SMTP ready: ${process.env.GRANTS_SMTP_HOST} as ${process.env.GRANTS_SMTP_USER}` };
  } catch (e) {
    return { ok: false, mode: "failed", detail: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Sends one message. `bcc` carries client cohorts so recipients never see each other;
 * `to` should stay the team mailbox.
 *
 * Large cohorts are split into chunks of RECIPIENTS_PER_MESSAGE_CAP — Zoho rejects
 * oversized recipient lists outright, which would drop the whole cohort.
 */
export async function sendMail(opts: {
  to: string[];
  bcc?: string[];
  subject: string;
  text: string;
}): Promise<MailResult> {
  if (!smtpConfigured()) {
    return { ok: false, mode: "failed", detail: "SMTP not configured" };
  }

  const bcc = [...new Set((opts.bcc ?? []).map((e) => e.trim().toLowerCase()).filter(Boolean))];
  const chunks: string[][] = [];
  for (let i = 0; i < bcc.length; i += RECIPIENTS_PER_MESSAGE_CAP) {
    chunks.push(bcc.slice(i, i + RECIPIENTS_PER_MESSAGE_CAP));
  }
  if (!chunks.length) chunks.push([]); // team-only message, no cohort

  const sentIds: string[] = [];
  try {
    for (const chunk of chunks) {
      const info = await transporter().sendMail({
        from: fromAddress(),
        to: opts.to,
        bcc: chunk.length ? chunk : undefined,
        subject: opts.subject,
        text: opts.text,
      });
      sentIds.push(String(info.messageId ?? "ok"));
    }
    return {
      ok: true,
      mode: "sent",
      detail: `SMTP → to=${opts.to.join(", ")} bcc=${bcc.length}${
        chunks.length > 1 ? ` in ${chunks.length} chunks` : ""
      } [${sentIds.join(", ")}]`,
    };
  } catch (e) {
    return { ok: false, mode: "failed", detail: e instanceof Error ? e.message : String(e) };
  }
}

/** Closes the pooled connection — call on shutdown so Zoho does not see a dangling session. */
export function closeMailer(): void {
  cached?.close();
  cached = null;
}
