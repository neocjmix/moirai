"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction
} from "react";

import type { MoiraiGraphUrlState } from "@moirai/contracts";

import {
  buildGraphUrlSearch,
  createDefaultGraphUrlState,
  parseGraphUrlState
} from "../lib/moirai-graph-source-query";

type GraphQueryContextValue = {
  readonly state: MoiraiGraphUrlState;
  readonly setState: Dispatch<SetStateAction<MoiraiGraphUrlState>>;
};

const GraphQueryContext = createContext<GraphQueryContextValue | null>(null);

export function GraphQueryProvider({
  children,
  initialState
}: Readonly<{
  children: ReactNode;
  initialState: MoiraiGraphUrlState;
}>) {
  const [state, setState] = useState(initialState);

  const restoreFromLocation = useCallback(() => {
    setState(
      parseGraphUrlState(window.location.search) ?? createDefaultGraphUrlState()
    );
  }, []);

  useEffect(() => {
    window.addEventListener("popstate", restoreFromLocation);
    return () => window.removeEventListener("popstate", restoreFromLocation);
  }, [restoreFromLocation]);

  useEffect(() => {
    const nextSearch = buildGraphUrlSearch(window.location.search, state);
    if (nextSearch !== window.location.search) {
      window.history.replaceState(
        window.history.state,
        "",
        `${window.location.pathname}${nextSearch}${window.location.hash}`
      );
    }
  }, [state]);

  const value = useMemo(() => ({ state, setState }), [state]);
  return (
    <GraphQueryContext.Provider value={value}>
      {children}
    </GraphQueryContext.Provider>
  );
}

export function useGraphQuery() {
  const value = useContext(GraphQueryContext);
  if (!value) {
    throw new Error("useGraphQuery must be used inside GraphQueryProvider");
  }
  return value;
}
