"use client";

import { useMemo, useCallback, lazy, Suspense } from "react";
import { presentationNodeId } from "@moirai/graph-presentation";
import { createMoiraiGraphReadLoader } from "../urdr-port/src/moirai-graph-read-loader";
import type { GraphSpatialBootstrap } from "../lib/graph-spatial-bootstrap";
import {
  DEFAULT_GRAPH_READER,
  type GraphReaderState
} from "../lib/event-reading-navigation";
import { Theme } from "@radix-ui/themes";

import type {
  MoiraiGraphQueryResult,
  MoiraiGraphUrlState
} from "@moirai/contracts";

import type { AtroposScreenId } from "../lib/atropos-screen-registry";
import { App } from "../urdr-port/src/App";
import { GraphQueryProvider, useGraphQuery } from "./graph-query-context";
import type {
  GraphDiagnostic,
  GraphRelationMatch,
  GraphSearchEntity,
  GraphSourceCatalog
} from "../lib/moirai-graph-source-query";

export function AtroposGraphRoot({
  initialScreen,
  initialGraphQuery,
  initialReader = DEFAULT_GRAPH_READER,
  catalog,
  entities,
  relations,
  diagnostics,
  result,
  spatial,
  demo = false
}: Readonly<{
  initialScreen: AtroposScreenId;
  initialGraphQuery: MoiraiGraphUrlState;
  initialReader?: GraphReaderState;
  catalog: GraphSourceCatalog;
  entities: readonly GraphSearchEntity[];
  relations: readonly GraphRelationMatch[];
  diagnostics: readonly GraphDiagnostic[];
  result: MoiraiGraphQueryResult;
  spatial: GraphSpatialBootstrap;
  demo?: boolean;
}>) {
  return (
    <GraphQueryProvider
      catalog={catalog}
      diagnostics={diagnostics}
      entities={entities}
      initialState={initialGraphQuery}
      initialReader={initialReader}
      relations={relations}
      result={result}
    >
      <Theme
        accentColor="gray"
        appearance="light"
        grayColor="sage"
        radius="large"
        scaling="100%"
      >
        {demo ? (
          <Suspense fallback={null}>
            <DemoGraphApp initialScreen={initialScreen} />
          </Suspense>
        ) : (
          <MoiraiGraphApp initialScreen={initialScreen} spatial={spatial} />
        )}
      </Theme>
    </GraphQueryProvider>
  );
}

const DemoGraphApp = lazy(() => import("./urdr-demo-app"));
function MoiraiGraphApp({
  initialScreen,
  spatial
}: {
  initialScreen: AtroposScreenId;
  spatial: GraphSpatialBootstrap;
}) {
  const { state, setState } = useGraphQuery();
  const queryKey = JSON.stringify(state.query);
  const loader = useMemo(() => {
    const requestState = {
      version: 1 as const,
      query: JSON.parse(queryKey),
      focus: null
    };
    return createMoiraiGraphReadLoader({
      sources: requestState.query.sources,
      state: requestState,
      workspace: spatial.workspace,
      maxEntities: Math.min(2500, requestState.query.budget.max_entities),
      loadEventDetail: async (_locale, id) => {
        const response = await fetch("/graph/detail", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ state: requestState, id })
        });
        if (!response.ok) throw Error("selected_detail_unavailable");
        return response.json();
      }
    });
  }, [queryKey, spatial.workspace]);
  const focus =
    state.focus?.kind === "event"
      ? {
          id: presentationNodeId(state.focus, state.focus.event_ref),
          label:
            state.focus.event_ref.kind === "event"
              ? state.focus.event_ref.event_id
              : "Time Event"
        }
      : null;
  const onSelection = useCallback(
    (id: string | null) => {
      if (!id) {
        setState((current) =>
          current.focus ? { ...current, focus: null } : current
        );
        return;
      }
      if (!id.startsWith("m_event_") && !id.startsWith("t_anchor_")) return;
      try {
        const [scopeKey, identityKey] = JSON.parse(
          decodeURIComponent(id.slice(id.startsWith("m_event_") ? 8 : 9))
        );
        const [world_id, served_revision, canon_id] = JSON.parse(
          decodeURIComponent(scopeKey)
        );
        const identity = JSON.parse(decodeURIComponent(identityKey));
        if (
          !state.query.sources.some(
            (s) =>
              s.world_id === world_id &&
              s.served_revision === served_revision &&
              s.canon_ids.includes(canon_id)
          )
        )
          return;
        const event_ref =
          identity[1] === "event"
            ? { kind: "event" as const, event_id: identity[2] }
            : {
                kind: "time_event" as const,
                time_system_ref: { time_system_id: identity[2] },
                definition_version: identity[3],
                coordinate: identity[4]
              };
        const next = {
          kind: "event" as const,
          world_id,
          served_revision,
          canon_id,
          event_ref
        };
        setState((current) =>
          JSON.stringify(current.focus) === JSON.stringify(next)
            ? current
            : { ...current, focus: next }
        );
      } catch {
        return;
      }
    },
    [setState, state.query.sources]
  );
  return (
    <App
      initialScreen={initialScreen}
      loader={loader}
      initialViewportCenter={spatial.center}
      externalFocus={focus}
      onSelection={onSelection}
    />
  );
}
