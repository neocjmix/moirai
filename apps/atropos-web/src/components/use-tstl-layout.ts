"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { createTstlExperimentClient } from "../lib/tstl-experiment-client";
import {
  parseTstlLayoutChoice,
  TSTL_LAYOUT_QUERY,
  tstlLayoutAvailable,
  tstlLayoutStorageKey,
  type TstlLayoutChoice
} from "../lib/tstl-layout-preference";

export function useTstlLayout(
  scope: { worldId: string; revision: number; timeSystemId: string },
  client: ReturnType<typeof createTstlExperimentClient>
) {
  const available = tstlLayoutAvailable(scope);
  const storageKey = tstlLayoutStorageKey(scope.worldId);
  const [mode, setMode] = useState<TstlLayoutChoice>("current");
  const [pending, setPending] = useState<TstlLayoutChoice | null>(null);
  const [failed, setFailed] = useState(false);
  const ticket = useRef(0);

  const choose = useCallback(
    async (next: TstlLayoutChoice, persist = true) => {
      const request = ++ticket.current;
      if (!available && next !== "current") return;
      setFailed(false);
      setPending(next === "current" ? null : next);
      try {
        if (next !== "current") await client.load();
        if (ticket.current !== request) return;
        setMode(next);
        setPending(null);
        if (persist) {
          try {
            window.localStorage.setItem(storageKey, next);
          } catch {
            /* Private browsing may deny storage. */
          }
          const url = new URL(window.location.href);
          url.searchParams.set(TSTL_LAYOUT_QUERY, next);
          window.history.replaceState(window.history.state, "", url);
        }
      } catch {
        if (ticket.current !== request) return;
        setPending(null);
        setFailed(true);
      }
    },
    [available, client, storageKey]
  );

  useEffect(() => {
    setMode("current");
    setPending(null);
    setFailed(false);
    const restore = () => {
      let stored: string | null = null;
      try {
        stored = window.localStorage.getItem(storageKey);
      } catch {
        /* Optional preference. */
      }
      const choice =
        parseTstlLayoutChoice(
          new URL(window.location.href).searchParams.get(TSTL_LAYOUT_QUERY)
        ) ??
        parseTstlLayoutChoice(stored) ??
        "current";
      void choose(available ? choice : "current", false);
    };
    restore();
    window.addEventListener("popstate", restore);
    return () => {
      ticket.current++;
      window.removeEventListener("popstate", restore);
    };
  }, [available, choose, storageKey]);

  return {
    mode: available ? mode : ("current" as const),
    pending,
    failed,
    available,
    choose
  };
}
