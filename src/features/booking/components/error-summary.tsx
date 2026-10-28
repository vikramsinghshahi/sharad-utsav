"use client";

import { useEffect, useRef } from "react";

export interface SummaryItem {
  fieldId: string;
  message: string;
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
          <li key={`${item.fieldId}-${index}`}>
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
          </li>
        ))}
      </ul>
    </div>
  );
}
