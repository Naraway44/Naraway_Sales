import { Link } from "react-router-dom";

export function TermsPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-12 sm:px-6">
      <Link to="/" className="mb-6 inline-block text-sm text-muted-foreground hover:text-foreground">
        ← Back
      </Link>
      <h1 className="mb-6 text-2xl font-semibold tracking-tight">Terms of Use</h1>
      <div className="space-y-5 text-sm text-muted-foreground">
        <p>
          <strong className="text-foreground">Access.</strong> Accounts on the Naraway Lead Marketplace are created
          only after a request is reviewed and approved by Naraway. Access is not transferable — each account is for
          use by one person, and Naraway may deactivate an account used outside of that.
        </p>
        <p>
          <strong className="text-foreground">Purchases.</strong> Pricing is based on the number of leads purchased
          in a single order and is shown in full before checkout. Once purchased, a lead is exclusive to that buyer
          for 2 months from the purchase date and is never resold or shared with another buyer.
        </p>
        <p>
          <strong className="text-foreground">Use of leads.</strong> Leads are provided for the buyer's own business
          outreach. Buyers are responsible for their own compliance with applicable communication and data protection
          laws when contacting the businesses whose details they've purchased.
        </p>
        <p>
          <strong className="text-foreground">Payments.</strong> Payments are processed securely through Razorpay.
          Naraway does not store or have access to card or payment details.
        </p>
        <p>
          <strong className="text-foreground">Support.</strong> Questions or issues with a purchased lead can be
          raised at{" "}
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
