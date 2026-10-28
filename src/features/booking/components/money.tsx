import { formatMoney } from "../format";

// Every amount on screen goes through here: integer cents from the server, printed as USD.
export function Money({ cents, className = "" }: { cents: number; className?: string }) {
  return <span className={`tabular-nums lining-nums ${className}`}>{formatMoney(cents)}</span>;
}
