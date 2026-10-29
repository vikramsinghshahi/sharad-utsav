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
  // Bumped each time the user is blocked (e.g. presses "Next" again), so focus returns
  // to the summary even when its contents haven't changed.
  focusRequest?: number;
  // Where focus goes after a one-click fix removes the field it was about.
  fallbackFocusId: string;
}

export function ErrorSummary({ items, onSelect, focusRequest = 0, fallbackFocusId }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const count = items.length;

  useEffect(() => {
    if (count > 0) ref.current?.focus();
  }, [count, focusRequest]);

  if (count === 0) return null;

  const focusField = (fieldId: string): boolean => {
    const element = document.getElementById(fieldId);
    if (!element) return false;
    element.scrollIntoView({ block: "center" });
    element.focus({ preventScroll: true });
    return true;
  };

  // After a fix the summary (and maybe the field) disappears; keep focus somewhere useful.
  const applyFix = (item: SummaryItem) => {
    item.onFix?.();
    requestAnimationFrame(() => {
      if (!focusField(item.fieldId)) focusField(fallbackFocusId);
    });
  };

  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      aria-labelledby="error-summary-title"
      className="rise-in rounded-2xl border border-error bg-error/10 p-4"
    >
      <h3 id="error-summary-title" className="font-semibold text-ink">
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
              className="text-error-text underline underline-offset-2 hover:text-ink"
            >
              {item.message}
            </a>
            {item.fixLabel && item.onFix && (
              <button
                type="button"
                onClick={() => applyFix(item)}
                className="min-h-11 rounded-lg border border-line-strong px-3 py-1.5 font-medium text-ink hover:border-gold-ink hover:text-gold-ink"
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
