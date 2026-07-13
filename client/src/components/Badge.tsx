import { cn } from "@/lib/utils";

export function Badge({ className, children }: { className?: string; children: React.ReactNode }) {
  return <span className={cn("status-badge", className)}>{children}</span>;
}
