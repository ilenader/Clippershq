"use client";

export function SplashScreen({ fading }: { fading?: boolean }) {
  return (
    <div className={`fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[var(--bg-primary)] ${fading ? "animate-splashOut" : ""}`}>
      <svg viewBox="0 0 100 100" className="h-16 w-16 text-accent mb-4 animate-fadeIn">
        <path d="M50 15L15 85h70L50 15z" fill="currentColor" />
      </svg>
      <p className="text-xl font-bold tracking-tight animate-fadeIn">
        <span className="text-[var(--text-primary)]">CLIPPERS </span>
        <span className="text-accent">HQ</span>
      </p>
    </div>
  );
}
