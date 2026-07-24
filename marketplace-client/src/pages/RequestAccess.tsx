import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { submitAccessRequest } from "@/api/accessRequests";

export function RequestAccessPage() {
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await submitAccessRequest({
        name,
        company: company || undefined,
        email,
        phone: phone || undefined,
        message: message || undefined,
      });
      setSubmitted(true);
    } catch {
      setError("Something went wrong submitting your request — please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Link to="/" className="text-sm font-semibold tracking-tight text-muted-foreground">
            Naraway <span className="text-primary">Lead Marketplace</span>
          </Link>
        </div>

        {submitted ? (
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-6 text-center">
            <h1 className="mb-1 text-lg font-semibold text-primary">Request received</h1>
            <p className="text-sm text-muted-foreground">
              Naraway will review your request and reach out with login details if approved.
            </p>
            <Link to="/login" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">
              Already have an account? Log in
            </Link>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h1 className="mb-1 text-lg font-semibold">Request Access</h1>
            <p className="mb-5 text-sm text-muted-foreground">
              Tell us a bit about you and your business. Naraway reviews every request before granting access.
            </p>

            <label className="mb-1 block text-xs font-medium text-muted-foreground">Name</label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mb-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />

            <label className="mb-1 block text-xs font-medium text-muted-foreground">Company</label>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="mb-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />

            <label className="mb-1 block text-xs font-medium text-muted-foreground">Email</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mb-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />

            <label className="mb-1 block text-xs font-medium text-muted-foreground">Phone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="mb-3 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />

            <label className="mb-1 block text-xs font-medium text-muted-foreground">What are you looking for? (optional)</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              className="mb-4 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
            />

            {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground shadow-sm transition hover:opacity-90 disabled:opacity-60"
            >
              {submitting ? "Submitting..." : "Submit Request"}
            </button>

            <p className="mt-4 text-center text-xs text-muted-foreground">
              Already have an account?{" "}
              <Link to="/login" className="font-medium text-primary hover:underline">
                Log in
              </Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
