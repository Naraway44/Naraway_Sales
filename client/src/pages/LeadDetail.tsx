import { useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  addLeadComment,
  assignLead,
  deleteLead,
  getLead,
  getLeadActivities,
  getLeadComments,
  updateLead,
} from "@/api/leads";
import { listUsers } from "@/api/users";
import { LEAD_STATUSES, PRIORITY_COLORS, STATUS_COLORS, STATUS_LABELS } from "@/api/types";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input, Label, Select, Textarea } from "@/components/Input";
import { useAuth } from "@/lib/auth";

export function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [comment, setComment] = useState("");

  const canManage = user?.role === "FOUNDER" || user?.role === "MANAGER";

  const { data: lead } = useQuery({ queryKey: ["lead", id], queryFn: () => getLead(id!), enabled: !!id });
  const { data: activities } = useQuery({
    queryKey: ["lead-activities", id],
    queryFn: () => getLeadActivities(id!),
    enabled: !!id,
  });
  const { data: comments } = useQuery({
    queryKey: ["lead-comments", id],
    queryFn: () => getLeadComments(id!),
    enabled: !!id,
  });
  const { data: usersData } = useQuery({
    queryKey: ["users-all"],
    queryFn: () => listUsers({ page: 1 }),
    enabled: canManage,
  });

  const updateMutation = useMutation({
    mutationFn: (input: Partial<typeof lead>) => updateLead(id!, input as any),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead", id] }),
  });

  const assignMutation = useMutation({
    mutationFn: (ownerId: string) => assignLead(id!, ownerId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead", id] });
      qc.invalidateQueries({ queryKey: ["lead-activities", id] });
    },
  });

  const commentMutation = useMutation({
    mutationFn: (body: string) => addLeadComment(id!, body),
    onSuccess: () => {
      setComment("");
      qc.invalidateQueries({ queryKey: ["lead-comments", id] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteLead(id!),
    onSuccess: () => navigate("/leads"),
  });

  if (!lead) return <p className="text-muted-foreground">Loading...</p>;

  return (
    <div className="grid grid-cols-3 gap-6">
      <div className="col-span-2 space-y-4">
        <Card className="p-5">
          <div className="mb-4 flex items-start justify-between">
            <div>
              <h1 className="text-xl font-semibold">{lead.companyName}</h1>
              <p className="text-sm text-muted-foreground">{lead.contactPerson}</p>
            </div>
            <div className="flex gap-2">
              <Badge className={STATUS_COLORS[lead.status]}>{STATUS_LABELS[lead.status]}</Badge>
              <Badge className={PRIORITY_COLORS[lead.priority]}>{lead.priority}</Badge>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <Field label="Phone" value={lead.phone} />
            <Field label="Email" value={lead.email} />
            <Field label="Website" value={lead.website} />
            <Field label="Industry" value={lead.industry} />
            <Field label="City" value={lead.city} />
            <Field label="State" value={lead.state} />
            <Field label="Country" value={lead.country} />
            <Field label="Service" value={lead.service?.name} />
            <Field label="Source" value={lead.source?.name} />
            <Field
              label="Expected Deal Value"
              value={lead.expectedDealValue ? `₹${lead.expectedDealValue}` : undefined}
            />
            <Field label="Probability" value={lead.probability ? `${lead.probability}%` : undefined} />
            <Field
              label="Expected Closing"
              value={lead.expectedClosingDate ? new Date(lead.expectedClosingDate).toLocaleDateString() : undefined}
            />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-4">
            <div>
              <Label>Status</Label>
              <Select
                value={lead.status}
                onChange={(e) => updateMutation.mutate({ status: e.target.value as any })}
              >
                {LEAD_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABELS[s]}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label>Next Follow-up</Label>
              <Input
                type="date"
                defaultValue={lead.nextFollowUp?.slice(0, 10) ?? ""}
                onBlur={(e) => updateMutation.mutate({ nextFollowUp: e.target.value as any })}
              />
            </div>
          </div>

          <div className="mt-4">
            <Label>Notes</Label>
            <Textarea
              defaultValue={lead.notes ?? ""}
              rows={3}
              onBlur={(e) => updateMutation.mutate({ notes: e.target.value })}
            />
          </div>

          {canManage && (
            <div className="mt-4 flex items-center gap-3 border-t border-border pt-4">
              <Label>
                <span className="sr-only">Owner</span>
              </Label>
              <span className="text-sm text-muted-foreground">Owner:</span>
              <Select
                value={lead.ownerId ?? ""}
                onChange={(e) => assignMutation.mutate(e.target.value)}
                className="max-w-[240px]"
              >
                <option value="">Unassigned</option>
                {usersData?.items
                  .filter((u) => u.role === "EXECUTIVE")
                  .map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.employeeId})
                    </option>
                  ))}
              </Select>
              <Button
                variant="destructive"
                className="ml-auto"
                onClick={() => {
                  if (confirm("Delete this lead permanently?")) deleteMutation.mutate();
                }}
              >
                Delete Lead
              </Button>
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold">Comments</h2>
          <div className="mb-4 space-y-3">
            {comments?.map((c) => (
              <div key={c.id} className="rounded-md bg-muted/50 p-3 text-sm">
                <div className="mb-1 flex justify-between text-xs text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {c.user.name} ({c.user.employeeId})
                  </span>
                  <span>{new Date(c.createdAt).toLocaleString()}</span>
                </div>
                {c.body}
              </div>
            ))}
            {comments?.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}
          </div>
          <div className="flex gap-2">
            <Textarea
              placeholder="Add a comment for the team..."
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={2}
            />
            <Button
              onClick={() => comment.trim() && commentMutation.mutate(comment.trim())}
              disabled={!comment.trim() || commentMutation.isPending}
            >
              Post
            </Button>
          </div>
        </Card>
      </div>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold">Activity Timeline</h2>
        <ol className="space-y-3 border-l border-border pl-4">
          {activities?.map((a) => (
            <li key={a.id} className="text-sm">
              <div className="font-medium">{a.action.replace(/_/g, " ")}</div>
              {a.notes && <div className="text-muted-foreground">{a.notes}</div>}
              <div className="text-xs text-muted-foreground">
                {a.user ? `${a.user.name} · ` : ""}
                {new Date(a.timestamp).toLocaleString()}
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div>{value || "—"}</div>
    </div>
  );
}
