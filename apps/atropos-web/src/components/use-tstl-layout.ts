"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { createTstlExperimentClient } from "../lib/tstl-experiment-client";
import type { TstlExperimentArtifact } from "../lib/tstl-experiment-types";
import {
  DEFAULT_ORGANIC_PARAMETERS,
  buildOrganicSurfaces,
  normalizeOrganicParameters,
  type OrganicSurfaceParameters,
  type OrganicSurfaceResult
} from "../lib/organic-surface";
import {
  organicExperimentGeometry,
  organicReproduction,
  parseOrganicReproduction,
  restoreOrganicReproduction,
  ORGANIC_VIEW_KEYS,
  type FrozenTstlBaseline,
  type OrganicDisplay,
  type OrganicReproduction
} from "../lib/organic-experiment";
import {
  parseTstlLayoutChoice,
  TSTL_LAYOUT_QUERY,
  tstlLayoutAvailable,
  tstlLayoutStorageKey,
  type TstlLayoutChoice
} from "../lib/tstl-layout-preference";

type OrganicState = {
  baseline: FrozenTstlBaseline;
  parameters: OrganicSurfaceParameters;
  display: OrganicDisplay;
  result: OrganicSurfaceResult | null;
  error: string | null;
  busy: boolean;
};
const initialOrganic = (): OrganicState => ({
  baseline: "anchored",
  parameters: { ...DEFAULT_ORGANIC_PARAMETERS },
  display: "padded",
  result: null,
  error: null,
  busy: false
});

export function useTstlLayout(
  scope: { worldId: string; revision: number; timeSystemId: string },
  client: ReturnType<typeof createTstlExperimentClient>
) {
  const available = tstlLayoutAvailable(scope);
  const storageKey = tstlLayoutStorageKey(scope.worldId);
  const [mode, setMode] = useState<TstlLayoutChoice>("current");
  const modeRef = useRef<TstlLayoutChoice>("current");
  const [pending, setPending] = useState<TstlLayoutChoice | null>(null);
  const [failed, setFailed] = useState(false);
  const [artifact, setArtifact] = useState<TstlExperimentArtifact | null>(null);
  const [organic, setOrganic] = useState<OrganicState>(initialOrganic);
  const organicRef = useRef(organic);
  const [organicVersion, setOrganicVersion] = useState(0);
  const ticket = useRef(0);
  const updateOrganic = useCallback((next: OrganicState) => {
    organicRef.current = next;
    setOrganic(next);
  }, []);
  const persistOrganic = useCallback(
    (next: OrganicState) => {
      const repro = organicReproduction(
        next.baseline,
        next.parameters,
        next.display,
        window.location.search
      );
      const json = JSON.stringify(repro);
      try {
        window.localStorage.setItem(`${storageKey}:organic`, json);
      } catch {
        /* Optional browser-local preference. */
      }
      const url = new URL(window.location.href);
      url.searchParams.set("organic", JSON.stringify({ ...repro, view: {} }));
      window.history.replaceState(window.history.state, "", url);
    },
    [storageKey]
  );
  const computeOrganic = useCallback(
    async (next: OrganicState, request: number) => {
      // Keep the committed parameters paired with the displayed result until
      // the replacement succeeds; failed attempts must not corrupt replay.
      updateOrganic({ ...organicRef.current, busy: true, error: null });
      // Give the browser a chance to paint the explicit recomputation state.
      await new Promise<void>((resolve) => setTimeout(resolve, 30));
      const frozen = await client.primitives(next.baseline);
      if (ticket.current !== request) return null;
      const result = buildOrganicSurfaces({
        primitives: frozen,
        parameters: next.parameters
      });
      if (ticket.current !== request) return null;
      const geometry = organicExperimentGeometry(frozen, result, next.display);
      const version = client.setOrganic(
        geometry.candidate,
        geometry.primitives
      );
      const complete = {
        ...next,
        parameters: result.parameters,
        result,
        error: null,
        busy: false
      };
      updateOrganic(complete);
      setOrganicVersion(version);
      const source = await client.load();
      setArtifact({ ...source, organic: geometry.candidate });
      return complete;
    },
    [client, updateOrganic]
  );

  const choose = useCallback(
    async (next: TstlLayoutChoice, persist = true) => {
      const request = ++ticket.current;
      if (!available && next !== "current") return;
      setFailed(false);
      setPending(next === "current" ? null : next);
      try {
        if (next === "organic" && persist && modeRef.current === "current")
          throw Error("organic_select_pinned_baseline_first");
        const loaded = next === "current" ? null : await client.load();
        if (ticket.current !== request) return;
        if (next === "organic") {
          let state = organicRef.current;
          if (persist) {
            const previous = modeRef.current;
            state = {
              ...state,
              baseline:
                previous === "organic" || previous === "current"
                  ? state.baseline
                  : previous
            };
          } else {
            let stored: string | null = null;
            try {
              stored = window.localStorage.getItem(`${storageKey}:organic`);
            } catch {
              /* Optional preference. */
            }
            const repro = restoreOrganicReproduction(
              window.location.search,
              stored
            );
            state = {
              ...state,
              baseline: repro.baseline,
              parameters: repro.parameters,
              display: repro.display
            };
          }
          const complete = await computeOrganic(state, request);
          if (!complete) return;
          persistOrganic(complete);
        } else {
          updateOrganic({ ...organicRef.current, busy: false });
          if (loaded) setArtifact(loaded);
        }
        if (ticket.current !== request) return;
        modeRef.current = next;
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
      } catch (error) {
        if (ticket.current !== request) return;
        setPending(null);
        setFailed(true);
        updateOrganic({
          ...organicRef.current,
          busy: false,
          error:
            error instanceof Error
              ? error.message
              : "organic_computation_failed"
        });
      }
    },
    [
      available,
      client,
      storageKey,
      computeOrganic,
      persistOrganic,
      updateOrganic
    ]
  );
  const recomputeOrganic = useCallback(
    async (parameters: OrganicSurfaceParameters) => {
      const request = ++ticket.current;
      try {
        const complete = await computeOrganic(
          {
            ...organicRef.current,
            parameters: normalizeOrganicParameters(parameters)
          },
          request
        );
        if (complete) persistOrganic(complete);
      } catch (error) {
        if (ticket.current === request)
          updateOrganic({
            ...organicRef.current,
            busy: false,
            error:
              error instanceof Error
                ? error.message
                : "organic_computation_failed"
          });
      }
    },
    [computeOrganic, persistOrganic, updateOrganic]
  );
  const setOrganicDisplay = useCallback(
    async (display: OrganicDisplay) => {
      const current = organicRef.current;
      if (!current.result || current.busy) return;
      const request = ++ticket.current;
      const frozen = await client.primitives(current.baseline);
      if (ticket.current !== request) return;
      const geometry = organicExperimentGeometry(
        frozen,
        current.result,
        display
      );
      setOrganicVersion(
        client.setOrganic(geometry.candidate, geometry.primitives)
      );
      const next = { ...current, display };
      updateOrganic(next);
      persistOrganic(next);
      setArtifact({ ...(await client.load()), organic: geometry.candidate });
    },
    [client, persistOrganic, updateOrganic]
  );
  const exportOrganic = useCallback(() => {
    const current = organicRef.current;
    return JSON.stringify(
      organicReproduction(
        current.baseline,
        current.parameters,
        current.display,
        window.location.search
      )
    );
  }, []);
  const importOrganic = useCallback(async (json: string) => {
    const repro: OrganicReproduction = parseOrganicReproduction(json);
    const url = new URL(window.location.href);
    for (const key of ORGANIC_VIEW_KEYS) url.searchParams.delete(key);
    for (const [key, value] of Object.entries(repro.view))
      url.searchParams.set(key, value);
    url.searchParams.set(TSTL_LAYOUT_QUERY, "organic");
    url.searchParams.set("organic", JSON.stringify({ ...repro, view: {} }));
    // Re-enter through the existing shell URL restore contract, including its
    // camera and Collection selection, without inventing a second camera API.
    window.location.assign(url);
  }, []);

  useEffect(() => {
    modeRef.current = "current";
    setMode("current");
    setPending(null);
    setFailed(false);
    setArtifact(null);
    updateOrganic(initialOrganic());
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
  }, [available, choose, storageKey, updateOrganic]);

  return {
    mode: available ? mode : ("current" as const),
    pending,
    failed,
    available,
    artifact: available ? artifact : null,
    choose,
    organic,
    organicVersion,
    recomputeOrganic,
    setOrganicDisplay,
    exportOrganic,
    importOrganic
  };
}
