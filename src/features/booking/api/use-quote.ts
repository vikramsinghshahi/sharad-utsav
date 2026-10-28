"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ProblemDetails, QuoteResponse } from "@/contracts/responses";
import type { BookingDraft } from "@/domain/booking";
import { requestFingerprint } from "../state/to-request";
import { fetchQuote } from "./client";

export type QuoteState =
  | { status: "idle" }
  // `previous` keeps the last server total on screen (dimmed) instead of flashing it away.
  | { status: "loading"; previous: QuoteResponse | null }
  | { status: "ready"; quote: QuoteResponse; key: string }
  // The draft breaks a rule (422) or names something sold out (409).
  | { status: "invalid"; problem: ProblemDetails; key: string }
  | { status: "error"; network: boolean };

const DEBOUNCE_MS = 300;

// POST /api/events/{slug}/quotes whenever the draft changes: debounced, with the
// previous request aborted, so only the newest draft's numbers are ever shown.
export function useQuote(slug: string, draft: BookingDraft | null) {
  const [state, setState] = useState<QuoteState>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);
  const lastQuote = useRef<QuoteResponse | null>(null);
  const key = draft ? requestFingerprint(draft) : null;
  // The draft object is new on every render; `key` is what identifies its content.
  const latestDraft = useRef(draft);
  useEffect(() => {
    latestDraft.current = draft;
  });

  useEffect(() => {
    const draft = latestDraft.current;
    if (key === null || draft === null) {
      lastQuote.current = null;
      setState({ status: "idle" });
      return;
    }
    setState({ status: "loading", previous: lastQuote.current });
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetchQuote(slug, draft, controller.signal).then((result) => {
        // A newer draft has taken over: this answer is stale.
        if (controller.signal.aborted) return;
        if (result.ok) {
          lastQuote.current = result.data;
          return setState({ status: "ready", quote: result.data, key });
        }
        if (result.kind === "aborted") return;
        lastQuote.current = null;
        if (result.kind === "network") return setState({ status: "error", network: true });
        const { status } = result.problem;
        setState(
          status === 422 || status === 409
            ? { status: "invalid", problem: result.problem, key }
            : { status: "error", network: false },
        );
      });
    }, DEBOUNCE_MS);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [slug, key, attempt]);

  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  // Until the effect catches up with a new draft, an answer for the old one is not current.
  const stale = (state.status === "ready" || state.status === "invalid") && state.key !== key;
  const current: QuoteState = stale ? { status: "loading", previous: lastQuote.current } : state;
  return { state: current, retry };
}
