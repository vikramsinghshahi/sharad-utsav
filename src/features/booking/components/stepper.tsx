import { STEP_TITLES, STEPS, type Step } from "../state/types";
import { DiyaIcon } from "@/components/diya-icon";

interface Props {
  current: Step;
  furthest: Step; // any step up to here can be revisited, backwards or forwards
  onGo: (step: Step) => void;
}

// Completed steps light up as diyas as the family moves through the flow.
// Every step already reached is a button, so nobody is ever stuck on a step.
export function Stepper({ current, furthest, onGo }: Props) {
  const currentIndex = STEPS.indexOf(current);
  const furthestIndex = Math.max(currentIndex, STEPS.indexOf(furthest));
  const goLabel = (index: number) =>
    index < currentIndex ? "(completed, go back)" : "(go to this step)";

  return (
    <nav aria-label="Booking progress" className="no-print">
      {/* Phone: one line, plus a row of lamps as the progress bar. */}
      <div className="lg:hidden">
        <ol className="flex items-center gap-1">
          {STEPS.map((step, index) => {
            const lamp = <DiyaIcon lit={index < currentIndex} current={index === currentIndex} />;
            const reachable = index <= furthestIndex && index !== currentIndex;
            return (
              <li key={step} className="flex flex-1 items-center gap-1">
                <span
                  aria-hidden="true"
                  className={`h-0.5 flex-1 rounded-full ${index <= currentIndex ? "bg-bright-gold" : "bg-white/20"}`}
                />
                {reachable ? (
                  <button
                    type="button"
                    onClick={() => onGo(step)}
                    className="-m-2.5 flex size-11 items-center justify-center rounded-full"
                  >
                    {lamp}
                    <span className="sr-only">
                      Step {index + 1}: {STEP_TITLES[step]} {goLabel(index)}
                    </span>
                  </button>
                ) : (
                  <span aria-current={index === currentIndex ? "step" : undefined}>
                    {lamp}
                    <span className="sr-only">
                      Step {index + 1}: {STEP_TITLES[step]}
                    </span>
                  </span>
                )}
              </li>
            );
          })}
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
              {index <= furthestIndex && !isCurrent ? (
                <button
                  type="button"
                  onClick={() => onGo(step)}
                  className="flex items-center gap-3 rounded-md text-sm transition-colors hover:text-bright-gold"
                >
                  {label}
                  <span className="sr-only">{goLabel(index)}</span>
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
