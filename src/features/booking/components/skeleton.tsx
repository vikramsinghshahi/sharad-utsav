// Placeholder blocks while the catalog or a quote loads (no flashing totals).
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`block animate-pulse rounded-md bg-white/10 ${className}`}
    />
  );
}
