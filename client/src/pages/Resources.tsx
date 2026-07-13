import { FormEvent, useState } from "react";
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
            {resource.service?.name ?? "General"}
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
    </Card>
  );
}

export function ResourcesPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const qc = useQueryClient();
  const canManage = user?.role === "FOUNDER" || user?.role === "MANAGER";

  const [categoryFilter, setCategoryFilter] = useState<ResourceCategory | "">("");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; title: string } | null>(null);
  const [form, setForm] = useState({ title: "", body: "", category: "MESSAGE" as ResourceCategory, serviceId: "" });

  const { data: resources, isLoading } = useQuery({
    queryKey: ["resources", categoryFilter],
    queryFn: () => listResources({ category: categoryFilter || undefined }),
  });
  const { data: services } = useQuery({ queryKey: ["services"], queryFn: listServices });

  const createMutation = useMutation({
    mutationFn: () => createResource({ ...form, serviceId: form.serviceId || null }),
    onSuccess: () => {
      setForm({ title: "", body: "", category: "MESSAGE", serviceId: "" });
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

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      <div className="space-y-4 lg:col-span-2">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold">Resources</h1>
          <Select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value as ResourceCategory | "")} className="max-w-[220px]">
            <option value="">All categories</option>
            {RESOURCE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {RESOURCE_CATEGORY_LABELS[c]}
              </option>
            ))}
          </Select>
        </div>

        {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
        {!isLoading && resources?.length === 0 && (
          <p className="text-sm text-muted-foreground">No resources yet.</p>
        )}

        <div className="space-y-3">
          {resources?.map((r) => (
            <ResourceCard
              key={r.id}
              resource={r}
              canManage={canManage}
              onDelete={() => setDeleteTarget({ id: r.id, title: r.title })}
            />
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
              <Label>Message / Draft</Label>
              <Textarea
                required
                rows={6}
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                placeholder="Write the message exactly as it should be sent..."
              />
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
