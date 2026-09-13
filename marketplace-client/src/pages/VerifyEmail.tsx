import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { verifyEmail } from "@/api/buyerAuth";
import { PublicFooter, PublicHeader } from "@/components/PublicChrome";

export function VerifyEmailPage() {
  const [status, setStatus] = useState<"verifying" | "success" | "error">("verifying");

  useEffect(() => {
    const token = new URLSearchParams(window.location.search).get("token");
    if (!token) {
      setStatus("error");
      return;
    }
    verifyEmail(token)
      .then(() => setStatus("success"))
      .catch(() => setStatus("error"));
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <div className="relative pb-4 pt-4">
        <PublicHeader />
      </div>
      <div className="flex flex-1 items-center justify-center p-4 pt-20">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 text-center shadow-sm">
          {status === "verifying" && <p className="text-sm text-muted-foreground">Verifying your email...</p>}
          {status === "success" && (
            <>
              <h1 className="mb-1 text-lg font-semibold text-primary">Email verified</h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                You're all set. You can now check out and buy leads.
              </p>
            </>
          )}
          {status === "error" && (
            <>
              <h1 className="mb-1 text-lg font-semibold">Link expired or invalid</h1>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Log in and request a new verification email from your account.
              </p>
            </>
          )}
          <Link to="/catalog" className="mt-5 inline-block text-sm font-medium text-primary hover:underline">
            Go to LeadStack
          </Link>
        </div>
      </div>
      <PublicFooter />
    </div>
  );
}
