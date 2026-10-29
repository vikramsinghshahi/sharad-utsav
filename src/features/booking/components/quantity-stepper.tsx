interface Props {
  id: string;
  label: string;
  value: number;
  max: number;
  onChange: (value: number) => void;
  describedBy?: string;
}

// − [n] + with a typed fallback, clamped to 0…max.
export function QuantityStepper({ id, label, value, max, onChange, describedBy }: Props) {
  const set = (next: number) => onChange(Math.min(max, Math.max(0, Math.floor(next))));
  const button =
    "flex size-11 items-center justify-center rounded-xl border border-line-strong text-xl hover:border-bright-gold disabled:cursor-not-allowed disabled:opacity-50";
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        className={button}
        onClick={() => set(value - 1)}
        disabled={value <= 0}
        aria-label={`One fewer: ${label}`}
      >
        −
      </button>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={max}
        value={value}
        aria-label={label}
        aria-describedby={describedBy}
        onChange={(event) => set(Number(event.target.value || 0))}
        className="h-11 w-16 rounded-xl border border-line-strong bg-white/5 text-center text-lg tabular-nums"
      />
      <button
        type="button"
        className={button}
        onClick={() => set(value + 1)}
        disabled={value >= max}
        aria-label={`One more: ${label}`}
      >
        +
      </button>
    </div>
  );
}
