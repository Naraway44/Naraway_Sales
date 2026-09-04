import { Link } from "react-router-dom";
import { PublicFooter, PublicHeader } from "@/components/PublicChrome";

export function TermsPage() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="relative pb-4 pt-4">
        <PublicHeader />
      </div>
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 pb-12 pt-24 sm:px-6">
        <Link to="/" className="mb-6 inline-block text-sm text-muted-foreground hover:text-foreground">
          ← Back to home
        </Link>
        <h1 className="mb-2 text-2xl font-semibold tracking-tight">Terms of Use</h1>
        <p className="mb-8 text-xs text-muted-foreground">LeadStack · last updated 2026</p>

        <div className="space-y-6 text-sm leading-relaxed text-muted-foreground">
          <section>
            <h2 className="mb-2 text-base font-semibold text-foreground">1. The service</h2>
            <p>
              LeadStack (“the Marketplace”) is a buyer-facing storefront where approved external buyers
              may browse teaser information about curated B2B leads, purchase exclusive access to contact details, and
              export purchased leads. It is separate from LeadStack's internal Sales OS.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-foreground">2. Access & accounts</h2>
            <p>
              Accounts are created only after LeadStack reviews an access request. There is no open public registration.
              Each account is for use by one person and is not transferable. LeadStack may suspend or deactivate accounts
              used outside these terms, shared improperly, or used to scrape or abuse the service. Logging in from a new
              device may invalidate a previous session.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-foreground">3. Lead nature & exclusivity</h2>
            <p>
              Leads listed on the Marketplace are opportunities LeadStack is no longer pursuing. Before purchase you see
              teaser fields only (for example company, industry, location, service, notes). Phone, email, and contact
              person are revealed after successful payment. Each lead is sold to at most one buyer and remains exclusive
              to that buyer for two (2) months from purchase. Leads are not resold or recycled after exclusivity ends.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-foreground">4. Pricing & purchases</h2>
            <p>
              Pricing is volume-based on the quantity of leads in a single order and is shown before checkout. There is
              no published static rate card on the public website. If fewer matching leads are available at payment than
              requested, you are charged only for leads actually delivered. Payments are processed by Razorpay; LeadStack
              does not store card or UPI credentials.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-foreground">5. Permitted use</h2>
            <p>
              Purchased lead data is for your own legitimate business outreach and pipeline building. You are responsible
              for complying with applicable laws (including telecom, spam, and data-protection rules) when contacting
              businesses. You may not resell, republish, or redistribute purchased lead data as a competing data product
              without LeadStack's written permission.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-foreground">6. No warranties on conversion</h2>
            <p>
              Leads are provided as contact and context data only. LeadStack does not guarantee that a lead will answer,
              convert, or be currently in-market. Contact accuracy issues should be reported to support for review;
              remedies, if any, are handled case by case and are not automated in the product.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-foreground">7. Support</h2>
            <p>
              Contact{" "}
              <a href="mailto:support@equidamai.com" className="text-primary hover:underline">
                support@equidamai.com
              </a>{" "}
              for access, billing, or lead-quality questions.
            </p>
          </section>

          <section>
            <h2 className="mb-2 text-base font-semibold text-foreground">8. Changes</h2>
            <p>
              LeadStack may update these terms or the Marketplace features over time. Continued use after material changes
              constitutes acceptance of the updated terms where permitted by law.
            </p>
          </section>

          <p className="border-t border-border pt-5 text-xs text-muted-foreground">
            These terms describe how the LeadStack operates today. For production commercial use, have
            counsel review and customize them for your jurisdiction.
          </p>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
