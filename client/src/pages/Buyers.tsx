import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createBuyer, listBuyers } from "@/api/buyers";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input, Label } from "@/components/Input";
import { useToast } from "@/components/Toast";
import { getErrorMessage } from "@/lib/errors";

export function BuyersPage() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const { data: buyers, isLoading } = useQuery({ queryKey: ["buyers"], queryFn: listBuyers });
  const [name, setName] = useState("");
  const [company, setCompany] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [lastTempPassword, setLastTempPassword] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: () => createBuyer({ name, company: company || undefined, email, phone: phone || undefined }),
    onSuccess: (result) => {
      showToast("Buyer account created");
      setLastTempPassword(result.tempPassword);
      setName("");
      setCompany("");
      setEmail("");
      setPhone("");
      qc.invalidateQueries({ queryKey: ["buyers"] });
    },
    onError: (err: unknown) => showToast(getErrorMessage(err), "error"),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    createMutation.mutate();
  }

  return (
    <div className="p-4 sm:p-6">
      <h1 className="mb-4 text-lg font-semibold">Marketplace Buyers</h1>

      <Card className="mb-6 p-4 sm:p-5">
        <h2 className="mb-3 text-sm font-semibold">Create Buyer Account</h2>
        <form onSubmit={onSubmit} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <Label>Name</Label>
            <Input required value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <Label>Company</Label>
            <Input value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <Label>Phone</Label>
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Creating..." : "Create Buyer"}
            </Button>
          </div>
        </form>
        {lastTempPassword && (
          <p className="mt-3 rounded-md bg-muted p-3 text-sm">
            Temporary password (share this with the buyer, it won't be shown again): <strong>{lastTempPassword}</strong>
          </p>
        )}
      </Card>

      <Card className="p-4 sm:p-5">
        <h2 className="mb-3 text-sm font-semibold">All Buyers</h2>
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="py-1.5 pr-3">Name</th>
                  <th className="py-1.5 pr-3">Company</th>
                  <th className="py-1.5 pr-3">Email</th>
                  <th className="py-1.5 pr-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {(buyers ?? []).map((buyer) => (
                  <tr key={buyer.id} className="border-t border-border">
                    <td className="py-1.5 pr-3">{buyer.name}</td>
                    <td className="py-1.5 pr-3">{buyer.company ?? "-"}</td>
                    <td className="py-1.5 pr-3">{buyer.email}</td>
                    <td className="py-1.5 pr-3">{buyer.isActive ? "Active" : "Inactive"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
