// A small oil lamp. Lit = a completed step: a gold flame with a soft halo that lights up
// (and then gently flickers, unless reduced motion is on). Current = a gold outline,
// waiting to be lit. Upcoming = a grey outline.
export function DiyaIcon({ lit, current = false }: { lit: boolean; current?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      aria-hidden="true"
      className={`shrink-0 overflow-visible ${lit ? "diya-glow" : ""}`}
    >
      {lit && (
        <ellipse cx="12" cy="8" rx="6.5" ry="7.5" className="diya-flame fill-bright-gold/25" />
      )}
      <path
        d="M12 2.5c1.9 2.4 2.9 4.2 2.9 5.7a2.9 2.9 0 0 1-5.8 0c0-1.5 1-3.3 2.9-5.7Z"
        className={
          lit
            ? "diya-flame fill-bright-gold"
            : current
              ? "fill-bright-gold/10 stroke-bright-gold"
              : "fill-none stroke-white/45"
        }
        strokeWidth="1.2"
      />
      {lit && (
        <path
          d="M12 5.6c.8 1.1 1.2 1.9 1.2 2.6a1.2 1.2 0 0 1-2.4 0c0-.7.4-1.5 1.2-2.6Z"
          className="diya-flame fill-cream"
        />
      )}
      <path
        d="M3.5 14.5h17c-.6 3.6-4 6-8.5 6s-7.9-2.4-8.5-6Z"
        className={lit ? "fill-primary" : current ? "fill-primary/70" : "fill-white/25"}
      />
      <path d="M8 14.5h8" className="stroke-heading/40" strokeWidth="1" />
    </svg>
  );
}
