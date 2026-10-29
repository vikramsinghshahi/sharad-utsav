import type { AgeInfo } from "../state/selectors";
import { BAND_LABEL } from "./age-labels";

// "Adult · 40", "Child · 7", "Under 5 · free": worked out live from the DOB (D1).
export function AgeBadge({ info }: { info: AgeInfo | null }) {
  if (!info) return null;
  const text =
    info.band === "infant"
      ? `${BAND_LABEL.infant} · free`
      : `${BAND_LABEL[info.band]} · ${info.age}`;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-sm font-medium tabular-nums ${
        info.band === "infant"
          ? "border-success/70 text-success-text"
          : "border-bright-gold/60 text-gold-ink"
      }`}
    >
      {text}
    </span>
  );
}
