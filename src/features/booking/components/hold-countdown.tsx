"use client";

import { useEffect, useRef, useState } from "react";
import { formatCountdown } from "../format";

interface Props {
  expiresAt: string;
  onExpire: () => void;
}

// mm:ss until the hold (HOLD_DURATION_MS) ends (S3). Calls onExpire once at zero.
export function HoldCountdown({ expiresAt, onExpire }: Props) {
  const deadline = Date.parse(expiresAt);
  const [now, setNow] = useState(() => Date.now());
  const fired = useRef(false);
  const remaining = deadline - now;

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (remaining <= 0 && !fired.current) {
      fired.current = true;
      onExpire();
    }
  }, [remaining, onExpire]);

  const urgent = remaining < 2 * 60 * 1000;
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-xl border p-3 ${urgent ? "border-gold-ink bg-bright-gold/10" : "border-line bg-surface"}`}
    >
      <p className="text-sm">
        Your places are held for
        <span className="sr-only"> {formatCountdown(remaining)} (minutes:seconds)</span>
      </p>
      <p
        aria-hidden="true"
        className="font-serif text-3xl font-semibold tabular-nums lining-nums text-gold-ink"
      >
        {formatCountdown(remaining)}
      </p>
    </div>
  );
}
