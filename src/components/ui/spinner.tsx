export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={`animate-spin h-8 w-8 text-accent ${className || ""}`} viewBox="0 0 100 100" fill="none">
      <path d="M50 15L15 85h70L50 15z" fill="currentColor" opacity="0.3" />
      <path d="M50 15L15 85h70L50 15z" fill="currentColor" className="animate-pulse" />
    </svg>
  );
}
