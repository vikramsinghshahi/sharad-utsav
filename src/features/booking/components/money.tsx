"use client";

import { useMoney } from "./event-context";

// Every amount on screen goes through here: integer cents from the server, printed in
// the event's currency.
export function Money({ cents, className = "" }: { cents: number; className?: string }) {
  const formatMoney = useMoney();
  return <span className={`tabular-nums lining-nums ${className}`}>{formatMoney(cents)}</span>;
}
