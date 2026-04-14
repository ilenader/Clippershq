"use client";

import { cn } from "@/lib/utils";
import { forwardRef } from "react";
import { Loader2 } from "lucide-react";
import { hapticLight } from "@/lib/haptics";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "outline";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  icon?: React.ReactNode;
}

const variantStyles: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-white hover:bg-accent-hover active:bg-accent-hover/90 shadow-sm",
  secondary:
    "bg-[var(--bg-input)] text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-color)]",
  ghost:
    "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-input)]",
  danger:
    "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-sm",
  outline:
    "border border-[var(--border-color)] text-[var(--text-primary)] hover:bg-[var(--bg-input)] hover:border-accent/40",
};

const sizeStyles: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-[13px] rounded-lg",
  md: "px-5 py-2.5 text-sm rounded-xl",
  lg: "px-7 py-3 text-[15px] rounded-xl",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", loading, icon, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "relative overflow-hidden inline-flex items-center justify-center gap-2 font-medium whitespace-nowrap transition-all duration-150",
          "active:scale-[0.97] disabled:opacity-50 disabled:cursor-not-allowed",
          "cursor-pointer",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        disabled={disabled || loading}
        {...props}
        onClick={(e) => {
          hapticLight();
          const rect = e.currentTarget.getBoundingClientRect();
          const rippleSize = Math.max(rect.width, rect.height) * 2;
          const span = document.createElement("span");
          span.className = "ripple-effect";
          span.style.width = rippleSize + "px";
          span.style.height = rippleSize + "px";
          span.style.left = (e.clientX - rect.left - rippleSize / 2) + "px";
          span.style.top = (e.clientY - rect.top - rippleSize / 2) + "px";
          e.currentTarget.appendChild(span);
          setTimeout(() => span.remove(), 600);
          if (props.onClick) props.onClick(e);
        }}
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
        {children}
      </button>
    );
  }
);
Button.displayName = "Button";
