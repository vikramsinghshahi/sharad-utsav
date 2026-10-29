"use client";

import { useState, type Dispatch } from "react";
import type { QuoteResponse } from "@/contracts/responses";
import { formatLongDate } from "../format";
import { fieldIds } from "../state/field-targets";
import type { Action } from "../state/types";
import { Callout } from "./callout";
import { input, label, quietButton, secondaryButton } from "./styles";
import { useMoney } from "./event-context";

interface Props {
  applied: string;
  outcome: QuoteResponse["promo"] | null;
  checking: boolean;
  dispatch: Dispatch<Action>;
}

type Outcome = QuoteResponse["promo"];

// What the server said about the code, in plain words (SPEC §5.5). Never blocks continuing.
function describe(
  outcome: Outcome,
  formatMoney: (cents: number) => string,
): { tone: "success" | "info"; text: string } | null {
  switch (outcome.status) {
    case "none":
      return null;
    case "applied":
      return {
        tone: "success",
        text:
          outcome.kind === "free_child_entry"
            ? `${outcome.code} applied — child tickets are now free (you save ${formatMoney(outcome.discountCents)}).`
            : `${outcome.code} applied — you save ${formatMoney(outcome.discountCents)}.`,
      };
    case "not_applicable":
      return {
        tone: "info",
        text:
          outcome.reason === "no_child_tickets"
            ? "This code is for child tickets — your booking has none."
            : "There's nothing in this booking for this code to discount.",
      };
    case "expired":
      return { tone: "info", text: `This code expired on ${formatLongDate(outcome.validTo)}.` };
    case "not_yet_valid":
      return {
        tone: "info",
        text: `This code can be used from ${formatLongDate(outcome.validFrom)}.`,
      };
    case "exhausted":
      return { tone: "info", text: "This code has reached its usage limit." };
    case "unknown":
      return { tone: "info", text: "We don't recognise that code." };
  }
}

export function PromoForm({ applied, outcome, checking, dispatch }: Props) {
  const [text, setText] = useState(applied);
  const formatMoney = useMoney();
  const message = applied !== "" && outcome && !checking ? describe(outcome, formatMoney) : null;
  const resultId = `${fieldIds.promo}-result`;

  return (
    <form
      className="space-y-2"
      onSubmit={(event) => {
        event.preventDefault();
        dispatch({ type: "SET_PROMO", code: text });
      }}
    >
      <label htmlFor={fieldIds.promo} className={label}>
        Promo code <span className="font-normal text-ink/70">(optional)</span>
      </label>
      <div className="flex gap-2">
        <input
          id={fieldIds.promo}
          className={`${input} uppercase`}
          value={text}
          maxLength={40}
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          aria-describedby={message ? resultId : undefined}
          onChange={(event) => setText(event.target.value)}
        />
        <button type="submit" className={secondaryButton} disabled={text.trim() === ""}>
          Apply
        </button>
      </div>
      <div id={resultId} aria-live="polite">
        {checking && applied !== "" && <p className="text-sm text-ink/75">Checking code…</p>}
        {message && (
          <Callout tone={message.tone}>
            <div className="flex items-center justify-between gap-3">
              <span className={`flex-1 ${message.tone === "success" ? "text-success-text" : ""}`}>
                {message.text}
              </span>
              <button
                type="button"
                className={`${quietButton} -my-2 -mr-2 shrink-0 whitespace-nowrap`}
                onClick={() => {
                  setText("");
                  dispatch({ type: "SET_PROMO", code: "" });
                }}
              >
                Remove code
              </button>
            </div>
          </Callout>
        )}
      </div>
    </form>
  );
}
