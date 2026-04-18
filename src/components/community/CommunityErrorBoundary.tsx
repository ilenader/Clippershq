"use client";

import { Component, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

export class CommunityErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(err: any) {
    console.error("[COMMUNITY] Unhandled render error:", err);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
          <AlertCircle className="h-10 w-10 text-red-400 mb-3 opacity-80" />
          <p className="text-sm text-[var(--text-primary)] font-medium mb-1">Something went wrong</p>
          <p className="text-xs text-[var(--text-muted)] max-w-xs">
            A part of the community view crashed unexpectedly. Your other pages are unaffected.
          </p>
          <button
            onClick={() => this.setState({ hasError: false })}
            className="mt-4 px-4 py-2 rounded-lg bg-accent text-white text-sm font-medium hover:bg-accent/85 transition-colors"
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
