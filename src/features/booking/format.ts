// The booking UI's formatting entry point. Dates and money come from the shared
// contracts formatter (the API's messages use the same one).
export {
  dayParts,
  formatDateRange,
  formatDay,
  formatDays,
  formatLongDate,
  formatMoney,
} from "@/contracts/format";

/** "14:59" style countdown */
export function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** "15 minutes" from a duration in ms */
export function formatMinutes(ms: number): string {
  const minutes = Math.round(ms / 60_000);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}
