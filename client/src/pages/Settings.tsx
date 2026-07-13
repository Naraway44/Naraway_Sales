import { FormEvent, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createAssignmentRule,
  createLeadSource,
  createService,
  createTeam,
  deleteAssignmentRule,
  listAssignmentRules,
  listLeadSources,
  listServices,
  listTeams,
} from "@/api/lookups";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";
import { Input, Select } from "@/components/Input";

function LookupEditor({
  title,
  items,
  onCreate,
}: {
  title: string;
  items: { id: string; name: string }[] | undefined;
  onCreate: (name: string) => Promise<unknown>;
}) {
  const [value, setValue] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!value.trim()) return;
    await onCreate(value.trim());
    setValue("");
  }

  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      <ul className="mb-3 space-y-1 text-sm">
        {items?.map((i) => (
          <li key={i.id} className="rounded-md bg-muted/50 px-2 py-1">
            {i.name}
          </li>
        ))}
      </ul>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <Input placeholder={`New ${title.toLowerCase()}...`} value={value} onChange={(e) => setValue(e.target.value)} />
        <Button type="submit">Add</Button>
      </form>
    </Card>
  );
}

export function SettingsPage() {
  const qc = useQueryClient();
  const { data: teams } = useQuery({ queryKey: ["teams"], queryFn: listTeams });
  const { data: services } = useQuery({ queryKey: ["services"], queryFn: listServices });
  const { data: sources } = useQuery({ queryKey: ["lead-sources"], queryFn: listLeadSources });
  const { data: rules } = useQuery({ queryKey: ["assignment-rules"], queryFn: listAssignmentRules });

  const [ruleServiceId, setRuleServiceId] = useState("");
  const [ruleTeamId, setRuleTeamId] = useState("");

  const teamMutation = useMutation({
    mutationFn: createTeam,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["teams"] }),
  });
  const serviceMutation = useMutation({
    mutationFn: createService,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["services"] }),
  });
  const sourceMutation = useMutation({
    mutationFn: createLeadSource,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["lead-sources"] }),
  });
  const ruleMutation = useMutation({
    mutationFn: () => createAssignmentRule(ruleServiceId, ruleTeamId),
    onSuccess: () => {
      setRuleServiceId("");
      setRuleTeamId("");
      qc.invalidateQueries({ queryKey: ["assignment-rules"] });
    },
  });
  const deleteRuleMutation = useMutation({
    mutationFn: deleteAssignmentRule,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["assignment-rules"] }),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Settings</h1>
      <div className="grid grid-cols-3 gap-6">
        <LookupEditor title="Teams" items={teams} onCreate={(n) => teamMutation.mutateAsync(n)} />
        <LookupEditor title="Services" items={services} onCreate={(n) => serviceMutation.mutateAsync(n)} />
        <LookupEditor title="Lead Sources" items={sources} onCreate={(n) => sourceMutation.mutateAsync(n)} />
      </div>

      <Card className="p-5">
        <h2 className="mb-3 text-sm font-semibold">Service → Team Assignment Rules</h2>
        <p className="mb-3 text-xs text-muted-foreground">
          When a lead's service matches a rule, it auto-routes to that team (round robin among active executives).
        </p>
        <ul className="mb-3 space-y-1 text-sm">
          {rules?.map((r) => (
            <li key={r.id} className="flex items-center justify-between rounded-md bg-muted/50 px-2 py-1">
              <span>
                {r.service.name} → {r.team.name}
              </span>
              <button
                onClick={() => deleteRuleMutation.mutate(r.id)}
                className="text-xs text-muted-foreground hover:text-destructive"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <Select value={ruleServiceId} onChange={(e) => setRuleServiceId(e.target.value)}>
            <option value="">Service...</option>
            {services?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
          <Select value={ruleTeamId} onChange={(e) => setRuleTeamId(e.target.value)}>
            <option value="">Team...</option>
            {teams?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          <Button
            disabled={!ruleServiceId || !ruleTeamId}
            onClick={() => ruleMutation.mutate()}
          >
            Add Rule
          </Button>
        </div>
      </Card>
    </div>
  );
}
