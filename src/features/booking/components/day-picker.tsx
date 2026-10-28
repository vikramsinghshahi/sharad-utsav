import { dayParts, formatDay } from "../format";

export interface DayOption {
  date: string;
  disabled: boolean;
  note?: string; // why it's disabled, or a hint like "2 left"
}

interface Props {
  id?: string;
  legend: string;
  options: readonly DayOption[];
  selected: readonly string[];
  onToggle: (date: string) => void;
  describedBy?: string;
  invalid?: boolean;
}

// Day chips are real toggle buttons (aria-pressed), so they work with a keyboard and screen reader.
export function DayPicker({
  id,
  legend,
  options,
  selected,
  onToggle,
  describedBy,
  invalid,
}: Props) {
  return (
    <fieldset
      id={id}
      tabIndex={-1}
      aria-describedby={describedBy}
      aria-invalid={invalid || undefined}
    >
      <legend className="mb-2 text-sm text-white/80">{legend}</legend>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => {
          const on = selected.includes(option.date);
          const { weekday, day } = dayParts(option.date);
          return (
            <button
              key={option.date}
              type="button"
              aria-pressed={on}
              disabled={option.disabled && !on}
              onClick={() => onToggle(option.date)}
              aria-label={`${formatDay(option.date)}${option.note ? `, ${option.note}` : ""}`}
              className={`flex min-h-11 min-w-14 flex-col items-center justify-center rounded-xl border px-3 py-1.5 leading-tight transition-colors ${
                on
                  ? "border-bright-gold bg-bright-gold text-heading"
                  : "border-line-strong text-white hover:border-bright-gold"
              } disabled:cursor-not-allowed disabled:border-white/15 disabled:text-white/50 disabled:line-through`}
            >
              <span className="text-xs">{weekday}</span>
              <span className="text-base font-semibold tabular-nums">{day}</span>
              {option.note && <span className="text-[0.7rem] no-underline">{option.note}</span>}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
