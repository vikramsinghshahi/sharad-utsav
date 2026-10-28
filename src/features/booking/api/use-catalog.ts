"use client";

import { useCallback, useEffect, useState } from "react";
import type { CatalogResponse } from "@/contracts/responses";
import { fetchCatalog } from "./client";

export type CatalogState =
  | { status: "loading" }
  | { status: "ready"; catalog: CatalogResponse }
  | { status: "not_found" }
  | { status: "error"; network: boolean };

// GET /api/events/{slug}: products, days and live stock. Reloadable (after a
// sold-out conflict, or when the connection comes back).
export function useCatalog(slug: string) {
  const [state, setState] = useState<CatalogState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void fetchCatalog(slug, controller.signal).then((result) => {
      if (controller.signal.aborted) return;
      if (result.ok) return setState({ status: "ready", catalog: result.data });
      if (result.kind === "aborted") return;
      if (result.kind === "problem" && result.problem.status === 404) {
        return setState({ status: "not_found" });
      }
      // Keep showing the catalog we have if a background reload fails.
      setState((current) =>
        current.status === "ready"
          ? current
          : { status: "error", network: result.kind === "network" },
      );
    });
    return () => controller.abort();
  }, [slug, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);
  return { state, reload };
}
