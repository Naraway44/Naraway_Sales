import { FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/auth";

export function LoginPage() {
  const { buyer, login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (buyer) return <Navigate to="/catalog" replace />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/catalog");
    } catch {
      setError("Invalid email or password");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-lg border border-border bg-card p-6 shadow-sm">
        <h1 className="mb-1 text-lg font-semibold">Naraway Lead Marketplace</h1>
        <p className="mb-5 text-sm text-muted-foreground">Sign in with the account Naraway created for you.</p>

        <label className="mb-1 block text-xs font-medium text-muted-foreground">Email</label>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-3 w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        />

        <label className="mb-1 block text-xs font-medium text-muted-foreground">Password</label>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40"
        />

        {error && <p className="mb-3 text-sm text-destructive">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60"
        >
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </div>
  );
}
