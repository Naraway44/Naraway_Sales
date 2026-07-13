import { ReactNode } from "react";
import { Button } from "@/components/Button";
import { Card } from "@/components/Card";

export function ConfirmDialog({ open, title, description, confirmLabel = "Confirm", destructive, onConfirm, onCancel, children }: { open: boolean; title: string; description: string; confirmLabel?: string; destructive?: boolean; onConfirm: () => void; onCancel: () => void; children?: ReactNode }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
      <Card className="w-full max-w-md p-5">
        <h2 id="confirm-title" className="text-lg font-semibold">{title}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{description}</p>
        {children}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onCancel}>Cancel</Button>
          <Button variant={destructive ? "destructive" : "primary"} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </Card>
    </div>
  );
}
