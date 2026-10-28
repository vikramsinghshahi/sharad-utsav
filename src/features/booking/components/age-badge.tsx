import type { AgeInfo } from "../state/selectors";

const LABEL = { adult: "Adult", child: "Child", infant: "Under 5" } as const;

// "Adult · 40", "Child · 7", "Under 5 · free": worked out live from the DOB (D1).
export function AgeBadge({ info }: { info: AgeInfo | null }) {
  if (!info) return null;
  const text = info.band === "infant" ? "Under 5 · free" : `${LABEL[info.band]} · ${info.age}`;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm font-medium tabular-nums ${
        info.band === "infant"
          ? "border-success/70 text-success-text"
          : "border-bright-gold/60 text-bright-gold"
      }`}
    >
      {text}
    </span>
  );
}
