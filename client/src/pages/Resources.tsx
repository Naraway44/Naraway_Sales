import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createResource,
  deleteResource,
  listResources,
  RESOURCE_CATEGORIES,
  RESOURCE_CATEGORY_LABELS,
  Resource,
  ResourceCategory,
} from "@/api/resources";
import { listServices } from "@/api/lookups";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input, Label, Select, Textarea } from "@/components/Input";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";

// Rendered as their own fixed pinned cards on the page, not filterable/browsable categories.
const PINNED_CATEGORIES = ["PAYMENT_INFO", "COMPANY_OVERVIEW"];

// Top-level clusters a rep actually thinks in — "I need a pitch," "I need to mail
// something," "I need a quick message" — rather than one flat list of every category.
// null means "no filter" (show everything not pinned).
const TABS: { key: string; label: string; categories: ResourceCategory[] | null }[] = [
  { key: "ALL", label: "All", categories: null },
  { key: "PITCHES", label: "Pitches", categories: ["CALL_SCRIPT", "OBJECTION_HANDLING"] },
  { key: "MAILS", label: "Mails", categories: ["EMAIL"] },
  { key: "MESSAGES", label: "Messages", categories: ["WHATSAPP", "SMS"] },
  { key: "REFERENCE", label: "Reference", categories: ["FAQ", "PRICING"] },
];

function CopyButton({ text }: { text: string }) {
  const { showToast } = useToast();
  return (
    <Button
      variant="secondary"
      onClick={() => {
        navigator.clipboard.writeText(text);
        showToast("Copied to clipboard.");
      }}
    >
      Copy
    </Button>
  );
}

function ResourceCard({ resource, canManage, onDelete }: { resource: Resource; canManage: boolean; onDelete: () => void }) {
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div>
          <h3 className="font-medium">{resource.title}</h3>
          <p className="text-xs text-muted-foreground">
            {RESOURCE_CATEGORY_LABELS[resource.category]}
            {resource.createdBy && ` · Added by ${resource.createdBy.name}`}
          </p>
        </div>
        <div className="flex shrink-0 gap-2">
          <CopyButton text={resource.body} />
          {canManage && (
            <button onClick={onDelete} className="text-xs text-muted-foreground hover:text-destructive">
              Delete
            </button>
          )}
        </div>
      </div>
      <p className="whitespace-pre-wrap text-sm text-foreground">{resource.body}</p>
      {resource.fileUrl && (
        <a
          href={resource.fileUrl}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-xs text-primary underline"
        >
          Open attached file →
        </a>
      )}
    </Card>
  );
}

export function ResourcesPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const qc = useQueryClient();
  const canManage = user?.role === "FOUNDER" || user?.role === "MANAGER";

  const [activeTab, setActiveTab] = useState("ALL");
  const [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [form, setForm] = useState({
    title: "",
    body: "",
    category: "CALL_SCRIPT" as ResourceCategory,
    serviceId: "",
    fileUrl: "",
  });

  // Fetched once, unfiltered — tabs and search both slice this client-side, since a resource
  // library this size doesn't need a round-trip per tab click.
  const { data: resources, isLoading } = useQuery({
    queryKey: ["resources"],
    queryFn: () => listResources({}),
  });
  const { data: paymentInfo } = useQuery({
    queryKey: ["resources", "PAYMENT_INFO"],
    queryFn: () => listResources({ category: "PAYMENT_INFO" }),
  });
  const { data: companyOverview } = useQuery({
    queryKey: ["resources", "COMPANY_OVERVIEW"],
    queryFn: () => listResources({ category: "COMPANY_OVERVIEW" }),
  });
  const { data: services } = useQuery({ queryKey: ["services"], queryFn: listServices });
  const [overviewExpanded, setOverviewExpanded] = useState(false);

  // Everything shown/searched in the main list excludes the pinned cards — those live in
  // their own fixed spots, not mixed into the searchable pile.
  const browsable = useMemo(
    () => resources?.filter((r) => !PINNED_CATEGORIES.includes(r.category)) ?? [],
    [resources]
  );

  const tabbed = useMemo(() => {
    const tab = TABS.find((t) => t.key === activeTab);
    if (!tab?.categories) return browsable;
    return browsable.filter((r) => tab.categories!.includes(r.category));
  }, [browsable, activeTab]);

  const filtered = useMemo(() => {
    if (!search.trim()) return tabbed;
    const q = search.trim().toLowerCase();
    return tabbed.filter((r) => r.title.toLowerCase().includes(q) || r.body.toLowerCase().includes(q));
  }, [tabbed, search]);

  // Clustered by service ("General" for anything not tied to one) so a rep pitching a
  // specific service sees everything relevant to that pitch grouped together, instead of
  // hunting through one long flat list.
  const grouped = useMemo(() => {
    const groups = new Map<string, Resource[]>();
    for (const r of filtered) {
      const key = r.service?.name ?? "General";
      groups.set(key, [...(groups.get(key) ?? []), r]);
    }
    return [...groups.entries()].sort(([a], [b]) => (a === "General" ? 1 : b === "General" ? -1 : a.localeCompare(b)));
  }, [filtered]);

  const createMutation = useMutation({
    mutationFn: () =>
      createResource({ ...form, serviceId: form.serviceId || null, fileUrl: form.fileUrl.trim() || null }),
    onSuccess: () => {
      setForm({ title: "", body: "", category: "CALL_SCRIPT", serviceId: "", fileUrl: "" });
      qc.invalidateQueries({ queryKey: ["resources"] });
      showToast("Resource added.");
    },
    onError: (err) => showToast(getErrorMessage(err, "Could not add resource."), "error"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteResource(id),
    onSuccess: () => {
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ["resources"] });
      showToast("Resource deleted.");
    },
    onError: (err) => showToast(getErrorMessage(err, "Could not delete resource."), "error"),
  });

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    createMutation.mutate();
  }

  const payment = paymentInfo?.[0] ?? null;
  const overview = companyOverview?.[0] ?? null;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <h1 className="text-xl font-semibold">Resources</h1>

        {overview && (
          <Card className="border-primary/30 bg-primary/5 p-4">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-semibold">{overview.title}</h3>
              <div className="flex gap-2">
                <CopyButton text={overview.body} />
                <button
                  onClick={() => setOverviewExpanded((v) => !v)}
                  className="text-xs text-primary underline"
                >
                  {overviewExpanded ? "Show less" : "Show more"}
                </button>
                {canManage && (
                  <button
                    onClick={() => setDeleteTarget({ id: overview.id, title: overview.title })}
                    className="text-xs text-muted-foreground hover:text-destructive"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
            <p
              className={`whitespace-pre-wrap text-sm text-foreground ${overviewExpanded ? "" : "line-clamp-4"}`}
            >
              {overview.body}
            </p>
          </Card>
        )}

        {payment && (
          <Card className="border-amber-300 bg-amber-50 p-4">
            <div className="mb-1 flex items-center justify-between">
              <h3 className="text-sm font-semibold text-amber-800">Payment & Bank Details</h3>
              <div className="flex gap-2">
                <CopyButton text={payment.body} />
                {canManage && (
                  <button
                    onClick={() => setDeleteTarget({ id: payment.id, title: payment.title })}
                    className="text-xs text-amber-800 hover:text-destructive"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
            <p className="whitespace-pre-wrap text-sm text-amber-900">{payment.body}</p>
          </Card>
        )}

        <div className="flex flex-wrap gap-1.5">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                activeTab === tab.key ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-border"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <Input
          placeholder="Search resources..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {!isLoading && filtered.length === 0 && (
          <p className="text-sm text-muted-foreground">No resources match.</p>
        )}

        <div className="space-y-6">
          {grouped.map(([groupName, items]) => (
            <div key={groupName}>
              <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{groupName}</h2>
              <div className="space-y-3">
                {items.map((r) => (
                  <ResourceCard
                    key={r.id}
                    resource={r}
                    canManage={canManage}
                    onDelete={() => setDeleteTarget({ id: r.id, title: r.title })}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {canManage && (
        <Card className="h-fit p-5">
          <h2 className="mb-3 text-sm font-semibold">Add Resource</h2>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <Label>Title</Label>
              <Input required value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </div>
            <div>
              <Label>Category</Label>
              <Select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as ResourceCategory })}>
                {RESOURCE_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {RESOURCE_CATEGORY_LABELS[c]}
                  </option>
                ))}
                <option value="PAYMENT_INFO">{RESOURCE_CATEGORY_LABELS.PAYMENT_INFO} (pinned card)</option>
                <option value="COMPANY_OVERVIEW">{RESOURCE_CATEGORY_LABELS.COMPANY_OVERVIEW} (pinned card)</option>
              </Select>
            </div>
            <div>
              <Label>Service (optional)</Label>
              <Select value={form.serviceId} onChange={(e) => setForm({ ...form, serviceId: e.target.value })}>
                <option value="">General (any service)</option>
                {services?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Content</Label>
              <Textarea
                required
                rows={6}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="Write it exactly as it should be sent or shared..."
              />
            </div>
            <div>
              <Label>File Link (optional)</Label>
              <Input
                type="url"
                placeholder="https://drive.google.com/..."
                value={form.fileUrl}
                onChange={(e) => setForm({ ...form, fileUrl: e.target.value })}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                Upload the file to Drive/Dropbox first, then paste the share link here.
              </p>
            </div>
            <Button type="submit" className="w-full" disabled={createMutation.isPending}>
              {createMutation.isPending ? "Adding..." : "Add Resource"}
            </Button>
          </form>
        </Card>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete this resource?"
        description={`"${deleteTarget?.title}" will be removed for everyone. This cannot be undone.`}
        confirmLabel={deleteMutation.isPending ? "Deleting..." : "Delete"}
        destructive
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && deleteMutation.mutate(deleteTarget.id)}
      />
    </div>
  );
}
