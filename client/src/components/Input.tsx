import { InputHTMLAttributes, forwardRef, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const fieldClasses =
  "w-full rounded-md border border-border bg-card px-3 py-1.5 text-sm outline-none focus:ring-2 focus:ring-primary/40";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input ref={ref} className={cn(fieldClasses, className)} {...props} />
  )
);
Input.displayName = "Input";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className, children, ...props }, ref) => (
    <select ref={ref} className={cn(fieldClasses, className)} {...props}>
      {children}
    </select>
  )
);
Select.displayName = "Select";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea ref={ref} className={cn(fieldClasses, "resize-y", className)} {...props} />
  )
);
Textarea.displayName = "Textarea";

export function Label({ children }: { children: React.ReactNode }) {
  return <label className="mb-1 block text-xs font-medium text-muted-foreground">{children}</label>;
}
