"use client";

import { cn } from "@/lib/utils";
import { forwardRef } from "react";

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, label, error, id, options, placeholder, ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={id}
            className="block text-sm font-medium text-[var(--text-secondary)]"
          >
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={id}
          className={cn(
            "w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2",
            "text-sm",
            props.value ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]",
            "transition-theme focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none",
            "cursor-pointer appearance-none",
            error && "border-red-500",
            className
          )}
          {...props}
        >
          {placeholder && (
            <option value="" className="text-[var(--text-muted)]">
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }
);
Select.displayName = "Select";
