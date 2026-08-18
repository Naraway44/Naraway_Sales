import { useState } from "react";
import { bulkAssignLeads, bulkUpdateLeads } from "@/api/leads";
import { LEAD_STATUSES, STATUS_LABELS, User } from "@/api/types";
import { Button } from "@/components/Button";
import { Select } from "@/components/Input";
import { Card } from "@/components/Card";
import { useToast } from "@/components/Toast";
import { getErrorMessage } from "@/lib/errors";

export function BulkAssignBar({
  selectedIds,
  users,
  canAssign,
  onDone,
}: {
  selectedIds: string[];
  users: User[];
  canAssign: boolean;
  onDone: () => void;
}) {
  const { showToast } = useToast();
  const [ownerId, setOwnerId] = useState("");
  const [status, setStatus] = useState("");
  const [priority, setPriority] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleAssign() {
    if (!ownerId) return;
    setLoading(true);
    try {
      await bulkAssignLeads(selectedIds, ownerId);
      showToast(`${selectedIds.length} lead(s) assigned.`);
      onDone();
    } catch (error) {
      showToast(getErrorMessage(error, "Could not assign leads."), "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleUpdate() {
    if (!status && !priority) return;
    setLoading(true);
    try {
      await bulkUpdateLeads(selectedIds, {
        ...(status ? { status: status as typeof LEAD_STATUSES[number] } : {}),
        ...(priority ? { priority: priority as "LOW" | "MEDIUM" | "HIGH" } : {}),
      });
      showToast(`${selectedIds.length} lead(s) updated.`);
      onDone();
    } catch (error) {
      showToast(getErrorMessage(error, "Could not update leads."), "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="sticky top-2 z-20 flex flex-wrap items-center gap-2 border-primary/20 bg-card p-3 shadow-sm">
      <span className="mr-1 text-sm font-medium">{selectedIds.length} selected</span>
      <Select aria-label="Bulk status" value={status} onChange={(e) => setStatus(e.target.value)} className="max-w-[190px]">
        <option value="">Change status...</option>
        {LEAD_STATUSES.map((item) => <option key={item} value={item}>{STATUS_LABELS[item]}</option>)}
      </Select>
      <Select aria-label="Bulk priority" value={priority} onChange={(e) => setPriority(e.target.value)} className="max-w-[165px]">
        <option value="">Change priority...</option>
        <option value="HIGH">High</option><option value="MEDIUM">Medium</option><option value="LOW">Low</option>
      </Select>
      <Button variant="secondary" onClick={handleUpdate} disabled={(!status && !priority) || loading}>
        {loading ? "Updating..." : "Update selected"}
      </Button>
      {canAssign && <>
        <span className="hidden h-6 border-l border-border sm:block" />
        <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="max-w-[220px]">
          <option value="">Assign to...</option>
          {users.filter((u) => u.role === "EXECUTIVE").map((u) => <option key={u.id} value={u.id}>{u.name} ({u.employeeId})</option>)}
        </Select>
        <Button onClick={handleAssign} disabled={!ownerId || loading}>{loading ? "Assigning..." : "Assign"}</Button>
      </>}
    </Card>
  );
}
