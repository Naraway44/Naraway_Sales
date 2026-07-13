import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addLeadComment, assignLead, deleteLead, getLead, getLeadActivities, getLeadComments, updateLead } from "@/api/leads";
import { listUsers } from "@/api/users";
import { LEAD_STATUSES, PRIORITY_COLORS, STATUS_COLORS, STATUS_LABELS } from "@/api/types";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Input, Label, Select, Textarea } from "@/components/Input";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";

export function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [comment, setComment] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draft, setDraft] = useState({ status: "NEW", priority: "MEDIUM", nextFollowUp: "", notes: "" });
  const canManage = user?.role === "FOUNDER" || user?.role === "MANAGER";
  const { data: lead, isLoading, isError, error } = useQuery({ queryKey: ["lead", id], queryFn: () => getLead(id!), enabled: !!id });
  const { data: activities } = useQuery({ queryKey: ["lead-activities", id], queryFn: () => getLeadActivities(id!), enabled: !!id });
  const { data: comments } = useQuery({ queryKey: ["lead-comments", id], queryFn: () => getLeadComments(id!), enabled: !!id });
  const { data: usersData } = useQuery({ queryKey: ["users-all"], queryFn: () => listUsers({ page: 1 }), enabled: canManage });
  useEffect(() => { if (lead) setDraft({ status: lead.status, priority: lead.priority, nextFollowUp: lead.nextFollowUp?.slice(0, 10) ?? "", notes: lead.notes ?? "" }); }, [lead]);

  const updateMutation = useMutation({ mutationFn: () => updateLead(id!, { ...draft, nextFollowUp: draft.nextFollowUp || null } as any), onSuccess: () => { qc.invalidateQueries({ queryKey: ["lead", id] }); qc.invalidateQueries({ queryKey: ["lead-activities", id] }); showToast("Lead changes saved."); }, onError: (mutationError) => showToast(getErrorMessage(mutationError, "Could not save lead changes."), "error") });
  const assignMutation = useMutation({ mutationFn: (ownerId: string) => assignLead(id!, ownerId), onSuccess: () => { qc.invalidateQueries({ queryKey: ["lead", id] }); qc.invalidateQueries({ queryKey: ["lead-activities", id] }); showToast("Lead owner updated."); }, onError: (mutationError) => showToast(getErrorMessage(mutationError, "Could not assign lead."), "error") });
  const commentMutation = useMutation({ mutationFn: (body: string) => addLeadComment(id!, body), onSuccess: () => { setComment(""); qc.invalidateQueries({ queryKey: ["lead-comments", id] }); showToast("Comment added."); }, onError: (mutationError) => showToast(getErrorMessage(mutationError, "Could not add comment."), "error") });
  const deleteMutation = useMutation({ mutationFn: () => deleteLead(id!), onSuccess: () => { showToast("Lead deleted."); navigate("/leads"); }, onError: (mutationError) => showToast(getErrorMessage(mutationError, "Could not delete lead."), "error") });

  if (isLoading) return <p className="text-muted-foreground">Loading lead...</p>;
  if (isError || !lead) return <p className="text-destructive">{getErrorMessage(error, "Could not load this lead.")}</p>;
  const isDirty = draft.status !== lead.status || draft.priority !== lead.priority || draft.nextFollowUp !== (lead.nextFollowUp?.slice(0, 10) ?? "") || draft.notes !== (lead.notes ?? "");

  return <div className="grid gap-6 xl:grid-cols-3">
    <div className="space-y-4 xl:col-span-2">
      <Card className="p-4 sm:p-5"><div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="text-xl font-semibold">{lead.companyName}</h1><p className="text-sm text-muted-foreground">{lead.contactPerson}</p></div><div className="flex gap-2"><Badge className={STATUS_COLORS[lead.status]}>{STATUS_LABELS[lead.status]}</Badge><Badge className={PRIORITY_COLORS[lead.priority]}>{lead.priority}</Badge></div></div>
        <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3"><Field label="Phone" value={lead.phone}/><Field label="Email" value={lead.email}/><Field label="Website" value={lead.website}/><Field label="Industry" value={lead.industry}/><Field label="City" value={lead.city}/><Field label="State" value={lead.state}/><Field label="Country" value={lead.country}/><Field label="Service" value={lead.service?.name}/><Field label="Source" value={lead.source?.name}/><Field label="Expected Deal Value" value={lead.expectedDealValue ? `INR ${lead.expectedDealValue}` : undefined}/><Field label="Probability" value={lead.probability !== null && lead.probability !== undefined ? `${lead.probability}%` : undefined}/><Field label="Expected Closing" value={lead.expectedClosingDate ? new Date(lead.expectedClosingDate).toLocaleDateString() : undefined}/></div>
        <div className="mt-5 grid gap-4 sm:grid-cols-3"><div><Label>Status</Label><Select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })}>{LEAD_STATUSES.map((item) => <option key={item} value={item}>{STATUS_LABELS[item]}</option>)}</Select></div><div><Label>Priority</Label><Select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value })}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></Select></div><div><Label>Next Follow-up</Label><Input type="date" value={draft.nextFollowUp} onChange={(event) => setDraft({ ...draft, nextFollowUp: event.target.value })}/></div></div>
        <div className="mt-4"><Label>Notes</Label><Textarea rows={4} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })}/></div>
        <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" disabled={!isDirty || updateMutation.isPending} onClick={() => setDraft({ status: lead.status, priority: lead.priority, nextFollowUp: lead.nextFollowUp?.slice(0, 10) ?? "", notes: lead.notes ?? "" })}>Discard</Button><Button disabled={!isDirty || updateMutation.isPending} onClick={() => updateMutation.mutate()}>{updateMutation.isPending ? "Saving..." : "Save changes"}</Button></div>
        {canManage && <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-end"><div className="w-full sm:max-w-xs"><Label>Owner</Label><Select value={lead.ownerId ?? ""} onChange={(event) => event.target.value && assignMutation.mutate(event.target.value)} disabled={assignMutation.isPending}><option value="">Unassigned</option>{usersData?.items.filter((item) => item.role === "EXECUTIVE" && item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name} ({item.employeeId})</option>)}</Select></div><Button variant="destructive" className="sm:ml-auto" onClick={() => setConfirmDelete(true)}>Delete lead</Button></div>}
      </Card>
      <Card className="p-4 sm:p-5"><h2 className="mb-3 text-sm font-semibold">Comments</h2><div className="mb-4 space-y-3">{comments?.map((item) => <div key={item.id} className="rounded-md bg-muted/50 p-3 text-sm"><div className="mb-1 flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:justify-between"><span className="font-medium text-foreground">{item.user ? `${item.user.name} (${item.user.employeeId})` : "Deleted user"}</span><span>{new Date(item.createdAt).toLocaleString()}</span></div>{item.body}</div>)}{comments?.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}</div><div className="flex flex-col gap-2 sm:flex-row"><Textarea aria-label="New comment" placeholder="Add a comment for the team..." value={comment} onChange={(event) => setComment(event.target.value)} rows={2}/><Button onClick={() => comment.trim() && commentMutation.mutate(comment.trim())} disabled={!comment.trim() || commentMutation.isPending}>{commentMutation.isPending ? "Posting..." : "Post"}</Button></div></Card>
    </div>
    <Card className="h-fit p-4 sm:p-5"><h2 className="mb-3 text-sm font-semibold">Activity Timeline</h2><ol className="space-y-3 border-l border-border pl-4">{activities?.map((item) => <li key={item.id} className="text-sm"><div className="font-medium">{item.action.replace(/_/g, " ")}</div>{item.notes && <div className="text-muted-foreground">{item.notes}</div>}<div className="text-xs text-muted-foreground">{item.user ? `${item.user.name} - ` : ""}{new Date(item.timestamp).toLocaleString()}</div></li>)}{activities?.length === 0 && <li className="text-sm text-muted-foreground">No activity recorded.</li>}</ol></Card>
    <ConfirmDialog open={confirmDelete} title="Delete lead?" description="This permanently removes the lead and its history." confirmLabel={deleteMutation.isPending ? "Deleting..." : "Delete lead"} destructive onCancel={() => setConfirmDelete(false)} onConfirm={() => deleteMutation.mutate()} />
  </div>;
}

function Field({ label, value }: { label: string; value?: string | null }) { return <div><div className="text-xs text-muted-foreground">{label}</div><div className="break-words">{value || "-"}</div></div>; }
