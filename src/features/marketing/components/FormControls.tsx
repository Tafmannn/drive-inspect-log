import type { ReactNode, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { fieldInputClass } from "./formHelpers";

interface FieldShellProps {
  id: string;
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}

/** Label + control + accessible error/hint wiring for a single field. */
export function FieldShell({ id, label, required, error, hint, children, className }: FieldShellProps) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      <label htmlFor={id} className="text-sm font-medium text-marketing-text">
        {label}
        {required && (
          <span className="ml-0.5 text-destructive" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {children}
      {hint && (
        <p id={hintId} className="text-xs text-marketing-text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

interface SelectFieldOption {
  value: string;
  label: string;
}

export function NativeSelect({
  options,
  placeholder,
  className,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & {
  options: SelectFieldOption[];
  placeholder?: string;
}) {
  return (
    <select className={cn(fieldInputClass, "appearance-none", className)} {...props}>
      {placeholder && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
