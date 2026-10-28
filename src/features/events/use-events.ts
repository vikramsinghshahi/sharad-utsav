"use client";

import { useCallback, useEffect, useState } from "react";
import type { EventListResponse } from "@/contracts/responses";
import { apiRequest } from "@/lib/api-client";

export type EventsState =
  | { status: "loading" }
  | { status: "ready"; events: EventListResponse["events"] }
  | { status: "error"; network: boolean };

// GET /api/events: whatever events the organisers have set up, earliest first.
export function useEvents() {
  const [state, setState] = useState<EventsState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void apiRequest<EventListResponse>("/api/events", {
      signal: controller.signal,
      cache: "no-store",
    }).then((result) => {
      if (controller.signal.aborted || (!result.ok && result.kind === "aborted")) return;
      setState(
        result.ok
          ? { status: "ready", events: result.data.events }
          : { status: "error", network: result.kind === "network" },
      );
    });
    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);
  return { state, retry };
}
