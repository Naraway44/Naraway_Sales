import { Link } from "react-router-dom";
import { PublicFooter, PublicHeader } from "@/components/PublicChrome";

export function PrivacyPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="relative pb-4 pt-4">
        <PublicHeader />
      </div>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-12 pt-24 sm:px-6">
        <Link to="/" className="mb-6 inline-block text-sm text-muted-foreground hover:text-foreground">
          ← Back to home
        </Link>
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">Privacy</h1>
        <p className="mb-8 text-xs text-muted-foreground">Naraway Lead Marketplace · last updated 2026</p>

        <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="mb-2 text-base font-semibold text-foreground">1. Scope</h2>
            <p>
              This notice covers the public Lead Marketplace website and buyer accounts. It does not describe Naraway's
              internal Sales OS used by staff.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-foreground">2. Information we collect</h2>
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong className="text-foreground">Access requests:</strong> name, company, email, phone, and any
                message you submit.
              </li>
              <li>
                <strong className="text-foreground">Buyer accounts:</strong> profile fields used for login and account
                management (e.g. name, email, company, phone).
              </li>
              <li>
                <strong className="text-foreground">Usage:</strong> login sessions, searches and purchases necessary to
                run Browse, checkout, and My Leads.
              </li>
              <li>
                <strong className="text-foreground">Technical:</strong> standard server logs and security-related data
                as needed to operate the service.
              </li>
            </ul>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-foreground">3. How we use it</h2>
            <p>
              We use this information to review access requests, create and secure buyer accounts, process purchases,
              show and export your purchased leads, prevent abuse, and respond to support requests. We do not sell your
              buyer account information to third parties as a marketing list.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-foreground">4. Payments</h2>
            <p>
              Payment processing is handled by Razorpay. Card, UPI, and bank details are entered on Razorpay's systems.
              Naraway does not store full payment credentials.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-foreground">5. Purchased lead data</h2>
            <p>
              After purchase, contact details for leads you bought are stored so you can view and export them from My
              Leads. You are responsible for using that data lawfully in your own outreach.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-foreground">6. Sharing</h2>
            <p>
              We may share data with infrastructure and payment providers strictly as needed to run the Marketplace, or
              when required by law. Buyer accounts are isolated from Naraway staff sales workflows except where staff
              must review access requests or support issues.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-foreground">7. Retention</h2>
            <p>
              Access requests and account records are kept as needed for operations, security, and legal compliance.
              Purchase history is retained so your dashboard continues to show leads you paid for.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-foreground">8. Contact</h2>
            <p>
              Privacy questions:{" "}
              <a href="mailto:support@naraway.com" className="text-primary hover:underline">
                support@naraway.com
              </a>
              .
            </p>
          </section>

          <p className="border-t border-border pt-5 text-xs text-muted-foreground">
            This notice describes how the marketplace handles data today. For production commercial use, have counsel
            review and customize it for your jurisdiction.
          </p>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
