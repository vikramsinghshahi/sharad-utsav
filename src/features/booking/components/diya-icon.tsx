// A small oil lamp. Lit = a completed step in the stepper; unlit = still to come.
export function DiyaIcon({ lit, current = false }: { lit: boolean; current?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" className="shrink-0">
      {lit && <ellipse cx="12" cy="8" rx="6" ry="7" className="fill-bright-gold/15" />}
      <path
        d="M12 2.5c1.9 2.4 2.9 4.2 2.9 5.7a2.9 2.9 0 0 1-5.8 0c0-1.5 1-3.3 2.9-5.7Z"
        className={
          lit
            ? "diya-flame fill-bright-gold"
            : current
              ? "fill-none stroke-bright-gold"
              : "fill-none stroke-white/40"
        }
        strokeWidth="1.2"
      />
      <path
        d="M3.5 14.5h17c-.6 3.6-4 6-8.5 6s-7.9-2.4-8.5-6Z"
        className={lit || current ? "fill-primary" : "fill-white/30"}
      />
      <path d="M8 14.5h8" className="stroke-heading/40" strokeWidth="1" />
    </svg>
  );
}
