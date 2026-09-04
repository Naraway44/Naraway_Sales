/**
 * One-off Zoho SMTP check. Verifies credentials, then sends a single test mail
 * to the authenticated mailbox itself (never to a client).
 *
 * Reads GRANTS_SMTP_* from .env — no credential is passed on the command line,
 * so it stays out of shell history.
 *
 *   npx tsx scripts/test-zoho-mail.ts             verify only, sends nothing
 *   npx tsx scripts/test-zoho-mail.ts --send      verify, then send one test mail
 */
import "dotenv/config";
import { fromAddress, sendMail, smtpConfigured, verifySmtp, closeMailer } from "@/modules/grants/grants.mailer";

async function main() {
  const send = process.argv.includes("--send");

  if (!smtpConfigured()) {
    console.error("SMTP not configured. Missing one of GRANTS_SMTP_HOST / GRANTS_SMTP_USER / GRANTS_SMTP_PASS.");
    console.error("Add your Zoho app password to server/.env as GRANTS_SMTP_PASS, then re-run.");
    process.exitCode = 1;
    return;
  }

  console.log(`host: ${process.env.GRANTS_SMTP_HOST}:${process.env.GRANTS_SMTP_PORT ?? "465"}`);
  console.log(`user: ${process.env.GRANTS_SMTP_USER}`);
  console.log(`from: ${fromAddress()}`);
  console.log("");

  console.log("verifying credentials...");
  const v = await verifySmtp();
  console.log(v.ok ? `  OK — ${v.detail}` : `  FAILED — ${v.detail}`);
  if (!v.ok) {
    console.error("\nCommon causes: using the account password instead of a Zoho APP password;");
    console.error("wrong region host (smtp.zoho.in vs smtp.zoho.com); or IMAP/SMTP access disabled in Zoho.");
    process.exitCode = 1;
    return;
  }

  if (!send) {
    console.log("\nVerify only. Re-run with --send to deliver one test message.");
    return;
  }

  // Recipient defaults to the authenticated mailbox; pass --to=<addr> to override.
  // Deliberately never reads from the client list.
  const toArg = process.argv.find((a) => a.startsWith("--to="));
  const self = (toArg ? toArg.slice(5) : process.env.GRANTS_SMTP_USER!).trim();
  console.log(`\nsending test mail to ${self} ...`);
  const r = await sendMail({
    to: [self],
    subject: "[Naraway Grants] SMTP test",
    text: [
      "This is a test message from the Naraway grants engine.",
      "",
      "If you are reading this, Zoho SMTP delivery works.",
      `Sent at ${new Date().toISOString()}`,
    ].join("\n"),
  });
  console.log(r.ok ? `  SENT — ${r.detail}` : `  FAILED — ${r.detail}`);
  if (!r.ok) process.exitCode = 1;
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => closeMailer());
