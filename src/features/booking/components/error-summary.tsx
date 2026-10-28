"use client";

import { useEffect, useRef } from "react";

export interface SummaryItem {
  fieldId: string;
  message: string;
  // An optional one-click fix shown next to the message.
  fixLabel?: string;
  onFix?: () => void;
}

// Shown at the top of a step after "Next" finds problems. Each link moves focus to its field.
interface Props {
  items: readonly SummaryItem[];
  // Lets the flow switch steps when a problem lives on another step. Returns true if it did.
  onSelect?: (item: SummaryItem) => boolean;
}

export function ErrorSummary({ items, onSelect }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const count = items.length;

  useEffect(() => {
    if (count > 0) ref.current?.focus();
  }, [count]);

  if (count === 0) return null;

  const focusField = (fieldId: string) => {
    const element = document.getElementById(fieldId);
    if (!element) return;
    element.scrollIntoView({ block: "center" });
    element.focus({ preventScroll: true });
  };

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      aria-labelledby="error-summary-title"
      className="rise-in rounded-2xl border border-error bg-error/10 p-4"
    >
      <h3 id="error-summary-title" className="font-semibold text-white">
        {count === 1 ? "One thing needs attention" : `${count} things need attention`}
      </h3>
      <ul className="mt-2 space-y-1.5 text-sm">
        {items.map((item, index) => (
          <li
            key={`${item.fieldId}-${index}`}
            className="flex flex-wrap items-center gap-x-3 gap-y-1"
          >
            <a
              href={`#${item.fieldId}`}
              onClick={(event) => {
                event.preventDefault();
                if (!onSelect?.(item)) focusField(item.fieldId);
              }}
              className="text-error-text underline underline-offset-2 hover:text-white"
            >
              {item.message}
            </a>
            {item.fixLabel && item.onFix && (
              <button
                type="button"
                onClick={item.onFix}
                className="min-h-11 rounded-lg border border-line-strong px-3 py-1.5 font-medium text-white hover:border-bright-gold hover:text-bright-gold"
              >
                {item.fixLabel}
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
