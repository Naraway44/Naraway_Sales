import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addLeadComment, assignLead, deleteLead, getLead, getLeadActivities, getLeadComments, logCall, routeLeadToService, setLeadPinned, updateLead, CALL_OUTCOMES, CallOutcome } from "@/api/leads";
import { listServices } from "@/api/lookups";
import { listUsers } from "@/api/users";
import { Lead, LeadStatus, Priority, LEAD_STATUSES, PRIORITY_COLORS, STATUS_COLORS, STATUS_LABELS } from "@/api/types";
import { Badge } from "@/components/Badge";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { Input, Label, Select, Textarea } from "@/components/Input";
import { useToast } from "@/components/Toast";
import { useAuth } from "@/lib/auth";
import { getErrorMessage } from "@/lib/errors";

const CALL_OUTCOME_LABELS: Record<CallOutcome, string> = {
  CONNECTED: "Connected",
  NO_ANSWER: "No Answer",
  VOICEMAIL: "Voicemail",
  CALL_BACK_LATER: "Call Back Later",
  WRONG_NUMBER: "Wrong Number",
};

function draftFromLead(l: Lead) {
  return {
    companyName: l.companyName ?? "",
    contactPerson: l.contactPerson ?? "",
    phone: l.phone ?? "",
    email: l.email ?? "",
    website: l.website ?? "",
    industry: l.industry ?? "",
    city: l.city ?? "",
    state: l.state ?? "",
    country: l.country ?? "",
    expectedDealValue: l.expectedDealValue?.toString() ?? "",
    probability: l.probability?.toString() ?? "",
    expectedClosingDate: l.expectedClosingDate?.slice(0, 10) ?? "",
    status: l.status,
    priority: l.priority,
    nextFollowUp: l.nextFollowUp?.slice(0, 10) ?? "",
    notes: l.notes ?? "",
  };
}

export function LeadDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { user } = useAuth();
  const { showToast } = useToast();
  const [comment, setComment] = useState("");
  const [callOutcome, setCallOutcome] = useState<CallOutcome | "">("");
  const [callNote, setCallNote] = useState("");
  const [callFollowUp, setCallFollowUp] = useState("");
  const outcomeNeedsRetry = callOutcome === "NO_ANSWER" || callOutcome === "VOICEMAIL" || callOutcome === "CALL_BACK_LATER";
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [draft, setDraft] = useState(draftFromLead({} as Lead));
  const canManage = user?.role === "FOUNDER" || user?.role === "MANAGER";
  const { data: lead, isLoading, isError, error } = useQuery({ queryKey: ["lead", id], queryFn: () => getLead(id!), enabled: !!id });
  const { data: activities } = useQuery({ queryKey: ["lead-activities", id], queryFn: () => getLeadActivities(id!), enabled: !!id });
  const { data: comments } = useQuery({ queryKey: ["lead-comments", id], queryFn: () => getLeadComments(id!), enabled: !!id });
  const { data: usersData } = useQuery({ queryKey: ["users-all"], queryFn: () => listUsers({ page: 1 }), enabled: canManage });
  const { data: services } = useQuery({ queryKey: ["services"], queryFn: listServices });
  useEffect(() => {
    if (lead) setDraft(draftFromLead(lead));
  }, [lead]);

  const routeMutation = useMutation({
    mutationFn: (targetServiceId: string) => routeLeadToService(id!, targetServiceId),
    onSuccess: (newLead) => {
      qc.invalidateQueries({ queryKey: ["lead", id] });
      showToast(`New opportunity created for ${newLead.service?.name ?? "that service"}.`);
    },
    onError: (mutationError) => showToast(getErrorMessage(mutationError, "Could not route to that service."), "error"),
  });

  const updateMutation = useMutation({
    mutationFn: () =>
      updateLead(id!, {
        ...draft,
        // Optional fields must go as null when cleared, not "" — email in particular fails
        // format validation on an empty string, and null is what "no value" means everywhere
        // else in this schema.
        contactPerson: draft.contactPerson || null,
        phone: draft.phone || null,
        email: draft.email || null,
        website: draft.website || null,
        industry: draft.industry || null,
        city: draft.city || null,
        state: draft.state || null,
        country: draft.country || null,
        nextFollowUp: draft.nextFollowUp || null,
        expectedClosingDate: draft.expectedClosingDate || null,
        expectedDealValue: draft.expectedDealValue === "" ? null : Number(draft.expectedDealValue),
        probability: draft.probability === "" ? null : Number(draft.probability),
      } as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead", id] });
      qc.invalidateQueries({ queryKey: ["lead-activities", id] });
      showToast("Lead changes saved.");
    },
    onError: (mutationError) => showToast(getErrorMessage(mutationError, "Could not save lead changes."), "error"),
  });
  const assignMutation = useMutation({ mutationFn: (ownerId: string) => assignLead(id!, ownerId), onSuccess: () => { qc.invalidateQueries({ queryKey: ["lead", id] }); qc.invalidateQueries({ queryKey: ["lead-activities", id] }); showToast("Lead owner updated."); }, onError: (mutationError) => showToast(getErrorMessage(mutationError, "Could not assign lead."), "error") });
  const commentMutation = useMutation({ mutationFn: (body: string) => addLeadComment(id!, body), onSuccess: () => { setComment(""); qc.invalidateQueries({ queryKey: ["lead-comments", id] }); showToast("Comment added."); }, onError: (mutationError) => showToast(getErrorMessage(mutationError, "Could not add comment."), "error") });
  const deleteMutation = useMutation({ mutationFn: () => deleteLead(id!), onSuccess: () => { showToast("Lead deleted."); navigate("/leads"); }, onError: (mutationError) => showToast(getErrorMessage(mutationError, "Could not delete lead."), "error") });
  const callMutation = useMutation({
    mutationFn: () => logCall(id!, callOutcome as CallOutcome, callNote.trim() || undefined, callFollowUp || undefined),
    onSuccess: () => {
      setCallOutcome("");
      setCallNote("");
      setCallFollowUp("");
      qc.invalidateQueries({ queryKey: ["lead-activities", id] });
      qc.invalidateQueries({ queryKey: ["lead", id] });
      showToast("Call logged.");
    },
    onError: (mutationError) => showToast(getErrorMessage(mutationError, "Could not log call."), "error"),
  });
  const pinMutation = useMutation({
    mutationFn: (pinned: boolean) => setLeadPinned(id!, pinned),
    onSuccess: (_data, pinned) => {
      qc.invalidateQueries({ queryKey: ["lead", id] });
      showToast(pinned ? "Saved for yourself — won't be auto-reassigned for 30 days." : "Unsaved — back in the normal pool.");
    },
    onError: (mutationError) => showToast(getErrorMessage(mutationError, "Could not update."), "error"),
  });

  if (isLoading) return <p className="text-muted-foreground">Loading lead...</p>;
  if (isError || !lead) return <p className="text-destructive">{getErrorMessage(error, "Could not load this lead.")}</p>;
  const savedDraft = draftFromLead(lead);
  const isDirty = (Object.keys(draft) as (keyof typeof draft)[]).some((key) => draft[key] !== savedDraft[key]);
  const isPinned = !!lead.ownerPinnedAt && Date.now() - new Date(lead.ownerPinnedAt).getTime() < 30 * 86_400_000;

  return <div className="grid gap-6 xl:grid-cols-3">
    <div className="space-y-4 xl:col-span-2">
      <Card className="p-4 sm:p-5"><div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><h1 className="text-xl font-semibold">{lead.companyName}</h1><p className="text-sm text-muted-foreground">{lead.contactPerson}</p></div><div className="flex items-center gap-2"><Badge className={STATUS_COLORS[lead.status]}>{STATUS_LABELS[lead.status]}</Badge><Badge className={PRIORITY_COLORS[lead.priority]}>{lead.priority}</Badge>{lead.ownerId === user?.id && (
        <Button variant="secondary" onClick={() => pinMutation.mutate(!isPinned)} disabled={pinMutation.isPending}>
          {isPinned ? "Saved by you" : "Save for myself"}
        </Button>
      )}</div></div>
        <div className="grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <EditField label="Company Name" value={draft.companyName} onChange={(v) => setDraft({ ...draft, companyName: v })} />
          <EditField label="Contact Person" value={draft.contactPerson} onChange={(v) => setDraft({ ...draft, contactPerson: v })} />
          <EditField label="Phone" value={draft.phone} onChange={(v) => setDraft({ ...draft, phone: v })} />
          <EditField label="Email" value={draft.email} onChange={(v) => setDraft({ ...draft, email: v })} type="email" />
          <EditField label="Website" value={draft.website} onChange={(v) => setDraft({ ...draft, website: v })} />
          <EditField label="Industry" value={draft.industry} onChange={(v) => setDraft({ ...draft, industry: v })} />
          <EditField label="City" value={draft.city} onChange={(v) => setDraft({ ...draft, city: v })} />
          <EditField label="State" value={draft.state} onChange={(v) => setDraft({ ...draft, state: v })} />
          <EditField label="Country" value={draft.country} onChange={(v) => setDraft({ ...draft, country: v })} />
          <Field label="Service" value={lead.service?.name} />
          <Field label="Source" value={lead.source?.name} />
          <EditField label="Expected Deal Value" value={draft.expectedDealValue} onChange={(v) => setDraft({ ...draft, expectedDealValue: v })} type="number" />
          <EditField label="Probability (%)" value={draft.probability} onChange={(v) => setDraft({ ...draft, probability: v })} type="number" />
          <EditField label="Expected Closing" value={draft.expectedClosingDate} onChange={(v) => setDraft({ ...draft, expectedClosingDate: v })} type="date" />
        </div>
        <div className="mt-5 grid gap-4 sm:grid-cols-3"><div><Label>Status</Label><Select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as LeadStatus })}>{LEAD_STATUSES.map((item) => <option key={item} value={item}>{STATUS_LABELS[item]}</option>)}</Select></div><div><Label>Priority</Label><Select value={draft.priority} onChange={(event) => setDraft({ ...draft, priority: event.target.value as Priority })}><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option></Select></div><div><Label>Next Follow-up</Label><Input type="date" value={draft.nextFollowUp} onChange={(event) => setDraft({ ...draft, nextFollowUp: event.target.value })}/></div></div>
        <div className="mt-4"><Label>Notes</Label><Textarea rows={4} value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })}/></div>
        <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" disabled={!isDirty || updateMutation.isPending} onClick={() => setDraft(savedDraft)}>Discard</Button><Button disabled={!isDirty || updateMutation.isPending} onClick={() => updateMutation.mutate()}>{updateMutation.isPending ? "Saving..." : "Save changes"}</Button></div>
        {canManage && <div className="mt-5 flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-end"><div className="w-full sm:max-w-xs"><Label>Owner</Label><Select value={lead.ownerId ?? ""} onChange={(event) => event.target.value && assignMutation.mutate(event.target.value)} disabled={assignMutation.isPending}><option value="">Unassigned</option>{usersData?.items.filter((item) => item.role === "EXECUTIVE" && item.isActive).map((item) => <option key={item.id} value={item.id}>{item.name} ({item.employeeId})</option>)}</Select></div><Button variant="destructive" className="sm:ml-auto" onClick={() => setConfirmDelete(true)}>Delete lead</Button></div>}
      </Card>

      {lead.convertedFromLead && (
        <p className="text-xs text-muted-foreground">
          ↳ Routed from{" "}
          <Link to={`/leads/${lead.convertedFromLead.id}`} className="text-primary underline">
            {lead.convertedFromLead.companyName} ({lead.convertedFromLead.service?.name ?? "no service"})
          </Link>
        </p>
      )}

      {(lead.status === "WON" || lead.status === "LOST") && (
        <CrossSellCard lead={lead} services={services} onOffer={(serviceId) => routeMutation.mutate(serviceId)} isPending={routeMutation.isPending} />
      )}

      <Card className="p-4 sm:p-5">
        <h2 className="mb-3 text-sm font-semibold">Log a Call</h2>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Select value={callOutcome} onChange={(event) => setCallOutcome(event.target.value as CallOutcome)} className="sm:max-w-[200px]">
            <option value="">Outcome...</option>
            {CALL_OUTCOMES.map((outcome) => (
              <option key={outcome} value={outcome}>{CALL_OUTCOME_LABELS[outcome]}</option>
            ))}
          </Select>
          <Input placeholder="Optional note" value={callNote} onChange={(event) => setCallNote(event.target.value)} />
          <Button onClick={() => callOutcome && callMutation.mutate()} disabled={!callOutcome || callMutation.isPending}>
            {callMutation.isPending ? "Logging..." : "Log Call"}
          </Button>
        </div>
        {outcomeNeedsRetry && (
          <div className="mt-2">
            <Label>Follow up on (leave blank for tomorrow by default)</Label>
            <Input type="date" value={callFollowUp} onChange={(event) => setCallFollowUp(event.target.value)} className="max-w-[200px]" />
          </div>
        )}
      </Card>
      <Card className="p-4 sm:p-5"><h2 className="mb-3 text-sm font-semibold">Comments</h2><div className="mb-4 space-y-3">{comments?.map((item) => <div key={item.id} className="rounded-md bg-muted/50 p-3 text-sm"><div className="mb-1 flex flex-col gap-1 text-xs text-muted-foreground sm:flex-row sm:justify-between"><span className="font-medium text-foreground">{item.userName} ({item.employeeId})</span><span>{new Date(item.createdAt).toLocaleString()}</span></div>{item.body}</div>)}{comments?.length === 0 && <p className="text-sm text-muted-foreground">No comments yet.</p>}</div><div className="flex flex-col gap-2 sm:flex-row"><Textarea aria-label="New comment" placeholder="Add a comment for the team..." value={comment} onChange={(event) => setComment(event.target.value)} rows={2}/><Button onClick={() => comment.trim() && commentMutation.mutate(comment.trim())} disabled={!comment.trim() || commentMutation.isPending}>{commentMutation.isPending ? "Posting..." : "Post"}</Button></div></Card>
    </div>
    <Card className="h-fit p-4 sm:p-5"><h2 className="mb-3 text-sm font-semibold">Activity Timeline</h2><ol className="space-y-3 border-l border-border pl-4">{activities?.map((item) => <li key={item.id} className="text-sm"><div className="font-medium">{item.action.replace(/_/g, " ")}</div>{item.notes && <div className="text-muted-foreground">{item.notes}</div>}<div className="text-xs text-muted-foreground">{item.user ? `${item.user.name} - ` : ""}{new Date(item.timestamp).toLocaleString()}</div></li>)}{activities?.length === 0 && <li className="text-sm text-muted-foreground">No activity recorded.</li>}</ol></Card>
    <ConfirmDialog open={confirmDelete} title="Delete lead?" description="This permanently removes the lead and its history." confirmLabel={deleteMutation.isPending ? "Deleting..." : "Delete lead"} destructive onCancel={() => setConfirmDelete(false)} onConfirm={() => deleteMutation.mutate()} />
  </div>;
}

function Field({ label, value }: { label: string; value?: string | null }) { return <div><div className="text-xs text-muted-foreground">{label}</div><div className="break-words">{value || "-"}</div></div>; }

function EditField({
  label,
  value,
  onChange,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input type={type} value={value} onChange={(event) => onChange(event.target.value)} />
    </div>
  );
}

const CROSS_SELL_STATUS_COLORS: Record<string, string> = {
  WON: "bg-green-100 text-green-700",
  LOST: "bg-red-100 text-red-700",
};

/**
 * Won → warm cross-sell (they already trust and paid you); Lost → a colder, more
 * speculative retry with a different angle. Shown as a checklist of every other service:
 * untried (offer it), or already offered (linked, color-coded by how that one went). No
 * separate "exhausted" state — once every service has an entry, the checklist just runs
 * out of untried rows on its own, and adding a new service later makes it offerable again
 * everywhere automatically.
 */
function CrossSellCard({
  lead,
  services,
  onOffer,
  isPending,
}: {
  lead: Lead;
  services?: { id: string; name: string }[];
  onOffer: (serviceId: string) => void;
  isPending: boolean;
}) {
  const otherServices = (services ?? []).filter((s) => s.id !== lead.serviceId);
  const declinedCount = (lead.convertedToLeads ?? []).filter((c) => c.status === "LOST").length;

  if (otherServices.length === 0) return null;

  return (
    <Card className="p-4 sm:p-5">
      <h2 className="mb-1 text-sm font-semibold">
        {lead.status === "WON" ? "Cross-Sell Opportunities" : "Try Another Service"}
      </h2>
      <p className="mb-3 text-xs text-muted-foreground">
        {lead.status === "WON"
          ? "This client already trusts and paid you — worth checking if another service fits too."
          : "They said no to this one — doesn't mean they'd say no to everything."}
      </p>
      {declinedCount >= 2 && (
        <p className="mb-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          This client has declined {declinedCount} services already — consider pausing further outreach.
        </p>
      )}
      <div className="space-y-1.5">
        {otherServices.map((service) => {
          const existing = lead.convertedToLeads?.find((c) => c.serviceId === service.id);
          return (
            <div key={service.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
              <span>{service.name}</span>
              {existing ? (
                <Link to={`/leads/${existing.id}`}>
                  <Badge className={CROSS_SELL_STATUS_COLORS[existing.status] ?? "bg-blue-100 text-blue-700"}>
                    {existing.status === "WON" || existing.status === "LOST" ? existing.status : "In Progress"}
                  </Badge>
                </Link>
              ) : (
                <Button variant="secondary" onClick={() => onOffer(service.id)} disabled={isPending}>
                  Offer {service.name}
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </Card>
  );
}
