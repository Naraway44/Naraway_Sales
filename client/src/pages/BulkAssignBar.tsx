import { useState } from "react";
import { bulkAssignLeads } from "@/api/leads";
import { User } from "@/api/types";
import { Button } from "@/components/Button";
import { Select } from "@/components/Input";
import { Card } from "@/components/Card";

export function BulkAssignBar({
  selectedIds,
  users,
  onDone,
}: {
  selectedIds: string[];
  users: User[];
  onDone: () => void;
}) {
  const [ownerId, setOwnerId] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleAssign() {
    if (!ownerId) return;
    setLoading(true);
    try {
      await bulkAssignLeads(selectedIds, ownerId);
      onDone();
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="flex items-center gap-3 p-3">
      <span className="text-sm font-medium">{selectedIds.length} selected</span>
      <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="max-w-[220px]">
        <option value="">Assign to...</option>
        {users
          .filter((u) => u.role === "EXECUTIVE")
          .map((u) => (
            <option key={u.id} value={u.id}>
              {u.name} ({u.employeeId})
            </option>
          ))}
      </Select>
      <Button onClick={handleAssign} disabled={!ownerId || loading}>
        {loading ? "Assigning..." : "Assign"}
      </Button>
    </Card>
  );
}
