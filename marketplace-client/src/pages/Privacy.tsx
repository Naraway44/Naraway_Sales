import { Link } from "react-router-dom";

export function PrivacyPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <Link to="/" className="mb-6 inline-block text-sm text-muted-foreground hover:text-foreground">
        ← Back
      </Link>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Privacy</h1>
      <div className="space-y-5 text-sm text-muted-foreground">
        <p>
          <strong className="text-foreground">What we collect.</strong> When you request access, we collect your
          name, company, email, phone, and any message you include. Once you have an account, we store your login
          activity and purchase history so we can show you the leads you've bought.
        </p>
        <p>
          <strong className="text-foreground">How it's used.</strong> Access requests are reviewed by Naraway staff
          to decide whether to create an account. Purchase history exists so your dashboard can show and let you
          export the leads you've paid for.
        </p>
        <p>
          <strong className="text-foreground">Payments.</strong> Payment processing is handled entirely by Razorpay.
          We never see or store your card or bank details.
        </p>
        <p>
          <strong className="text-foreground">Sharing.</strong> We don't sell or share your account information with
          anyone outside of Naraway.
        </p>
        <p>
          <strong className="text-foreground">Contact.</strong> Questions about your data can be sent to{" "}
          <a href="mailto:support@naraway.com" className="text-primary hover:underline">
            support@naraway.com
          </a>
          .
        </p>
        <p className="border-t border-border pt-5 text-xs italic">
          This page describes how the platform currently operates. It is a placeholder and has not been reviewed by
          legal counsel — please have it reviewed before relying on it for real transactions.
        </p>
      </div>
    </div>
  );
}
