"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";

function VerifyContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const [status, setStatus] = useState<"loading" | "error">("loading");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      return;
    }
    window.location.href = `/api/auth/verify-magic-link?token=${token}`;
  }, [token]);

  if (status === "error") {
    return (
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Invalid Link</h1>
        <p className="text-[var(--text-secondary)]">This link is invalid or has expired.</p>
        <a href="/login" className="text-accent hover:underline">Go to login</a>
      </div>
    );
  }

  return (
    <div className="text-center space-y-4">
      <div className="h-8 w-8 mx-auto animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
      <p className="text-[var(--text-secondary)]">Verifying your access...</p>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[var(--bg-primary)]">
      <Suspense fallback={
        <div className="text-center space-y-4">
          <div className="h-8 w-8 mx-auto animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
          <p className="text-[var(--text-secondary)]">Loading...</p>
        </div>
      }>
        <VerifyContent />
      </Suspense>
    </div>
  );
}
