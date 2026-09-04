import bcrypt from "bcryptjs";
import { randomUUID, randomBytes } from "crypto";
import { prisma } from "@/common/prisma";
import { signBuyerToken } from "@/common/middleware/buyerAuth";
import { ConflictError, UnauthorizedError, ValidationError } from "@/common/errors/AppError";
import { env } from "@/common/env";
// Reused from the grants module: a working generic SMTP sender, not grants-specific logic.
import { sendMail, smtpConfigured } from "@/modules/grants/grants.mailer";
import { verifyAuth0IdToken } from "./auth0";
import { BuyerLoginInput, BuyerSignupInput } from "./buyerAuth.schemas";

const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24h

export class BuyerAuthService {
  async signup(input: BuyerSignupInput) {
    const existing = await prisma.buyer.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictError("An account with this email already exists");

    const passwordHash = await bcrypt.hash(input.password, 10);
    const emailVerificationToken = randomBytes(32).toString("hex");
    const emailVerificationExpires = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);

    const buyer = await prisma.buyer.create({
      data: {
        name: input.name,
        company: input.company,
        email: input.email,
        phone: input.phone,
        passwordHash,
        emailVerified: false,
        emailVerificationToken,
        emailVerificationExpires,
      },
    });

    const verifyUrl = `${env.marketplaceUrl}/verify-email?token=${emailVerificationToken}`;
    if (smtpConfigured()) {
      await sendMail({
        to: [buyer.email],
        subject: "Verify your LeadStack account",
        text: `Welcome to LeadStack.\n\nVerify your email to start buying leads:\n${verifyUrl}\n\nThis link expires in 24 hours.`,
      });
    }

    // Buyer can log in and browse immediately; requireEmailVerified only gates checkout.
    const sessionToken = randomUUID();
    const updated = await prisma.buyer.update({
      where: { id: buyer.id },
      data: { currentSessionToken: sessionToken },
    });
    const token = signBuyerToken({ buyerId: updated.id, sessionToken });
    return { token, buyer: this.toSafeBuyer(updated), verificationEmailSent: smtpConfigured() };
  }

  async verifyEmail(rawToken: string) {
    const buyer = await prisma.buyer.findUnique({ where: { emailVerificationToken: rawToken } });
    if (!buyer || !buyer.emailVerificationExpires || buyer.emailVerificationExpires < new Date()) {
      throw new ValidationError("This verification link is invalid or has expired");
    }
    const updated = await prisma.buyer.update({
      where: { id: buyer.id },
      data: { emailVerified: true, emailVerificationToken: null, emailVerificationExpires: null },
    });
    return this.toSafeBuyer(updated);
  }

  async resendVerification(buyerId: string) {
    const buyer = await prisma.buyer.findUniqueOrThrow({ where: { id: buyerId } });
    if (buyer.emailVerified) return { alreadyVerified: true };

    const emailVerificationToken = randomBytes(32).toString("hex");
    const emailVerificationExpires = new Date(Date.now() + VERIFICATION_TOKEN_TTL_MS);
    await prisma.buyer.update({
      where: { id: buyer.id },
      data: { emailVerificationToken, emailVerificationExpires },
    });

    const verifyUrl = `${env.marketplaceUrl}/verify-email?token=${emailVerificationToken}`;
    if (smtpConfigured()) {
      await sendMail({
        to: [buyer.email],
        subject: "Verify your LeadStack account",
        text: `Verify your email to start buying leads:\n${verifyUrl}\n\nThis link expires in 24 hours.`,
      });
    }
    return { alreadyVerified: false, verificationEmailSent: smtpConfigured() };
  }

  async login(input: BuyerLoginInput) {
    const buyer = await prisma.buyer.findUnique({ where: { email: input.email } });
    if (!buyer || !buyer.isActive) {
      throw new UnauthorizedError("Invalid email or password");
    }

    const valid = await bcrypt.compare(input.password, buyer.passwordHash);
    if (!valid) {
      throw new UnauthorizedError("Invalid email or password");
    }

    // A fresh session token on every login overwrites whatever was active before —
    // this is the actual enforcement behind "single, not shareable" buyer access.
    const sessionToken = randomUUID();
    const updated = await prisma.buyer.update({
      where: { id: buyer.id },
      data: { currentSessionToken: sessionToken },
    });

    const token = signBuyerToken({ buyerId: buyer.id, sessionToken });
    return { token, buyer: this.toSafeBuyer(updated) };
  }

  /** "Log in with Google" (and any other Auth0 connection) — verifies the Auth0 ID token,
   *  then finds or creates a Buyer by email and issues the same session token/JWT the
   *  email/password login issues. Nothing downstream (checkout, my-leads, etc.) needs to
   *  know Auth0 exists. An Auth0-verified email is trusted as already verified — Google
   *  itself confirmed it — so this buyer skips the signup email-verification gate. */
  async loginWithAuth0(idToken: string) {
    const profile = await verifyAuth0IdToken(idToken);

    let buyer = await prisma.buyer.findUnique({ where: { email: profile.email } });
    if (buyer && !buyer.isActive) {
      throw new UnauthorizedError("This account has been deactivated");
    }

    if (!buyer) {
      // No password is ever used for an Auth0-only account — store an unguessable, unusable
      // hash so passwordHash's NOT NULL constraint is satisfied without a real password
      // existing anywhere; email/password login for this row will just always fail bcrypt.compare.
      const passwordHash = await bcrypt.hash(randomBytes(32).toString("hex"), 10);
      buyer = await prisma.buyer.create({
        data: {
          name: profile.name ?? profile.email,
          email: profile.email,
          passwordHash,
          emailVerified: profile.emailVerified,
        },
      });
    } else if (profile.emailVerified && !buyer.emailVerified) {
      buyer = await prisma.buyer.update({ where: { id: buyer.id }, data: { emailVerified: true } });
    }

    const sessionToken = randomUUID();
    const updated = await prisma.buyer.update({
      where: { id: buyer.id },
      data: { currentSessionToken: sessionToken },
    });

    const token = signBuyerToken({ buyerId: updated.id, sessionToken });
    return { token, buyer: this.toSafeBuyer(updated) };
  }

  async me(buyerId: string) {
    const buyer = await prisma.buyer.findUniqueOrThrow({ where: { id: buyerId } });
    return this.toSafeBuyer(buyer);
  }

  private toSafeBuyer<T extends { passwordHash: string }>(buyer: T) {
    const { passwordHash: _passwordHash, ...safe } = buyer;
    return safe;
  }
}

export const buyerAuthService = new BuyerAuthService();
