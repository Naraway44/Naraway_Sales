import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "destructive";

const variantClasses: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground hover:opacity-90",
  secondary: "bg-muted text-foreground hover:bg-border",
  ghost: "hover:bg-muted",
  destructive: "bg-destructive text-destructive-foreground hover:opacity-90",
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export const Button = forwardRef<HTMLButtonElement, Props>(
  ({ className, variant = "primary", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  )
);
Button.displayName = "Button";
