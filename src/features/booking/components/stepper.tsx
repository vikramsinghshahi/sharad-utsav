import { STEP_TITLES, STEPS, type Step } from "../state/types";
import { DiyaIcon } from "./diya-icon";

interface Props {
  current: Step;
  onGo: (step: Step) => void;
}

// Completed steps light up as diyas as the family moves through the flow.
// Earlier steps are buttons (go back); later ones are plain text.
export function Stepper({ current, onGo }: Props) {
  const currentIndex = STEPS.indexOf(current);

  return (
    <nav aria-label="Booking progress" className="no-print">
      {/* Phone: one line, plus a row of lamps as the progress bar. */}
      <div className="lg:hidden">
        <ol className="flex items-center gap-1.5" aria-hidden="true">
          {STEPS.map((step, index) => (
            <li key={step} className="flex flex-1 items-center gap-1.5">
              <span
                className={`h-0.5 flex-1 rounded-full ${index <= currentIndex ? "bg-bright-gold" : "bg-white/20"}`}
              />
              <DiyaIcon lit={index < currentIndex} current={index === currentIndex} />
            </li>
          ))}
        </ol>
      </div>

      {/* Desktop: the full horizontal stepper. */}
      <ol className="hidden items-stretch gap-2 lg:flex">
        {STEPS.map((step, index) => {
          const done = index < currentIndex;
          const isCurrent = index === currentIndex;
          const label = (
            <>
              <DiyaIcon lit={done} current={isCurrent} />
              <span className="flex flex-col text-left leading-tight">
                <span className="text-xs text-white/70">Step {index + 1}</span>
                <span className={isCurrent ? "font-semibold text-white" : "text-white/85"}>
                  {STEP_TITLES[step]}
                </span>
              </span>
            </>
          );
          return (
            <li
              key={step}
              className={`flex-1 border-b-2 pb-3 ${isCurrent ? "border-bright-gold" : done ? "border-primary/60" : "border-white/15"}`}
            >
              {done ? (
                <button
                  type="button"
                  onClick={() => onGo(step)}
                  className="flex items-center gap-3 rounded-md text-sm transition-colors hover:text-bright-gold"
                >
                  {label}
                  <span className="sr-only">(completed, go back)</span>
                </button>
              ) : (
                <span
                  className="flex items-center gap-3 text-sm"
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
