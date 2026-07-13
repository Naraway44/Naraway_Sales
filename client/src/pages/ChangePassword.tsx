import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { changePassword } from "@/api/auth";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/Button";
import { Input, Label } from "@/components/Input";
import { Card } from "@/components/Card";

export function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const { setSession } = useAuth();
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (newPassword !== confirm) {
      setError("Passwords do not match");
      return;
    }
    setLoading(true);
    try {
      const { token, user } = await changePassword(currentPassword, newPassword);
      setSession(token, user);
      navigate("/leads");
    } catch (err: any) {
      setError(err.response?.data?.error ?? "Could not change password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <Card className="w-full max-w-sm p-8">
        <h1 className="mb-1 text-xl font-semibold text-primary">Set a new password</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          You're using a temporary password. Choose a new one to continue.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <Label>Current (temporary) password</Label>
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required />
          </div>
          <div>
            <Label>New password</Label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8} />
          </div>
          <div>
            <Label>Confirm new password</Label>
            <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} required minLength={8} />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Saving..." : "Save and continue"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
