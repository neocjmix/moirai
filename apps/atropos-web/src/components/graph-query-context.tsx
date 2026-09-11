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
import { useRouter } from "next/navigation";

import type { MoiraiGraphUrlState } from "@moirai/contracts";

import {
  buildGraphUrlSearch,
  createDefaultGraphUrlState,
  parseGraphUrlState,
  type GraphDiagnostic,
  type GraphRelationMatch,
  type GraphSearchEntity,
  type GraphSourceCatalog
} from "../lib/moirai-graph-source-query";

type GraphQueryContextValue = {
  readonly state: MoiraiGraphUrlState;
  readonly setState: Dispatch<SetStateAction<MoiraiGraphUrlState>>;
  readonly catalog: GraphSourceCatalog;
  readonly entities: readonly GraphSearchEntity[];
  readonly relations: readonly GraphRelationMatch[];
  readonly diagnostics: readonly GraphDiagnostic[];
};

const GraphQueryContext = createContext<GraphQueryContextValue | null>(null);

export function GraphQueryProvider({
  children,
  initialState,
  catalog,
  entities,
  relations,
  diagnostics
}: Readonly<{
  children: ReactNode;
  initialState: MoiraiGraphUrlState;
  catalog: GraphSourceCatalog;
  entities: readonly GraphSearchEntity[];
  relations: readonly GraphRelationMatch[];
  diagnostics: readonly GraphDiagnostic[];
}>) {
  const [state, setState] = useState(initialState);
  const router = useRouter();

  useEffect(() => setState(initialState), [initialState]);

  const restoreFromLocation = useCallback(() => {
    setState(
      parseGraphUrlState(window.location.search, catalog) ??
        createDefaultGraphUrlState(catalog)
    );
  }, [catalog]);

  useEffect(() => {
    window.addEventListener("popstate", restoreFromLocation);
    return () => window.removeEventListener("popstate", restoreFromLocation);
  }, [restoreFromLocation]);

  useEffect(() => {
    const nextSearch = buildGraphUrlSearch(window.location.search, state);
    if (nextSearch !== window.location.search) {
      router.replace(
        `${window.location.pathname}${nextSearch}${window.location.hash}`,
        { scroll: false }
      );
    }
  }, [router, state]);

  const value = useMemo(
    () => ({ state, setState, catalog, entities, relations, diagnostics }),
    [catalog, diagnostics, entities, relations, state]
  );
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
