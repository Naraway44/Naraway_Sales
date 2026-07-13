import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { createLead } from "@/api/leads";
import { listLeadSources, listServices } from "@/api/lookups";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input, Label, Select } from "@/components/Input";

export function NewLeadPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    companyName: "",
    contactPerson: "",
    phone: "",
    email: "",
    city: "",
    state: "",
    serviceId: "",
    sourceId: "",
  });
  const [loading, setLoading] = useState(false);

  const { data: services } = useQuery({ queryKey: ["services"], queryFn: listServices });
  const { data: sources } = useQuery({ queryKey: ["lead-sources"], queryFn: listLeadSources });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const lead = await createLead({
        ...form,
        serviceId: form.serviceId || undefined,
        sourceId: form.sourceId || undefined,
      } as any);
      navigate(`/leads/${lead.id}`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="mx-auto max-w-xl p-6">
      <h1 className="mb-4 text-lg font-semibold">New Lead</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <Label>Company Name</Label>
          <Input required value={form.companyName} onChange={(e) => setForm({ ...form, companyName: e.target.value })} />
        </div>
        <div>
          <Label>Contact Person</Label>
          <Input required value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Phone</Label>
            <Input required value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
          </div>
          <div>
            <Label>Email</Label>
            <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>City</Label>
            <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          </div>
          <div>
            <Label>State</Label>
            <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Service Interested</Label>
            <Select value={form.serviceId} onChange={(e) => setForm({ ...form, serviceId: e.target.value })}>
              <option value="">Select...</option>
              {services?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Lead Source</Label>
            <Select value={form.sourceId} onChange={(e) => setForm({ ...form, sourceId: e.target.value })}>
              <option value="">Select...</option>
              {sources?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => navigate("/leads")}>
            Cancel
          </Button>
          <Button type="submit" disabled={loading}>
            {loading ? "Creating..." : "Create Lead"}
          </Button>
        </div>
      </form>
    </Card>
  );
}
