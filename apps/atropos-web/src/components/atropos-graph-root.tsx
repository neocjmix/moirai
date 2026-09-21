"use client";

import { useMemo, useCallback, lazy, Suspense } from "react";
import { presentationNodeId } from "@moirai/graph-presentation";
import { createMoiraiGraphReadLoader } from "../urdr-port/src/moirai-graph-read-loader";
import type { GraphSpatialBootstrap } from "../lib/graph-spatial-bootstrap";
import { selectGraphSpatialBootstrap } from "../lib/graph-spatial-selection";
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
import type { EventDetailResponse } from "../urdr-port/shared/contracts";
import type { GraphShellDrawerStage } from "../urdr-port/src/components/graph-shell-share-state";

export function AtroposGraphRoot({
  initialScreen,
  initialGraphQuery,
  initialReader = DEFAULT_GRAPH_READER,
  catalog,
  entities,
  relations,
  diagnostics,
  completeness,
  spatial,
  initialEventDetail,
  initialDrawerStage,
  demo = false
}: Readonly<{
  initialScreen: AtroposScreenId;
  initialGraphQuery: MoiraiGraphUrlState;
  initialReader?: GraphReaderState;
  catalog: GraphSourceCatalog;
  entities: readonly GraphSearchEntity[];
  relations: readonly GraphRelationMatch[];
  diagnostics: readonly GraphDiagnostic[];
  completeness: MoiraiGraphQueryResult["completeness"];
  spatial: GraphSpatialBootstrap;
  initialEventDetail?: EventDetailResponse;
  initialDrawerStage?: GraphShellDrawerStage;
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
      completeness={completeness}
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
          <MoiraiGraphApp
            initialScreen={initialScreen}
            spatial={spatial}
            {...(initialEventDetail ? { initialEventDetail } : {})}
            {...(initialDrawerStage ? { initialDrawerStage } : {})}
          />
        )}
      </Theme>
    </GraphQueryProvider>
  );
}

const DemoGraphApp = lazy(() => import("./urdr-demo-app"));
function MoiraiGraphApp({
  initialScreen,
  spatial,
  initialEventDetail,
  initialDrawerStage
}: {
  initialScreen: AtroposScreenId;
  spatial: GraphSpatialBootstrap;
  initialEventDetail?: EventDetailResponse;
  initialDrawerStage?: GraphShellDrawerStage;
}) {
  const { state, setState } = useGraphQuery();
  const queryKey = JSON.stringify(state.query);
  const selectedSpatial = useMemo(
    () => selectGraphSpatialBootstrap(spatial, state),
    [queryKey, spatial]
  );
  const loader = useMemo(() => {
    const requestState = {
      version: 1 as const,
      query: JSON.parse(queryKey),
      focus: null
    };
    return createMoiraiGraphReadLoader({
      sources: requestState.query.sources,
      state: requestState,
      workspace: selectedSpatial.workspace,
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
  }, [queryKey, selectedSpatial.workspace]);
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
        const identity = JSON.parse(
          decodeURIComponent(id.slice(id.startsWith("m_event_") ? 8 : 9))
        );
        if (!Array.isArray(identity) || typeof identity[0] !== "string") return;
        const world_id = identity[0];
        const source = state.query.sources.find(
          (candidate) =>
            candidate.world_id === world_id &&
            candidate.canon_ids.length > 0
        );
        if (!source) return;
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
          served_revision: source.served_revision,
          canon_id: source.canon_ids[0]!,
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
      key={selectedSpatial.workspace.buildRevision}
      initialScreen={initialScreen}
      loader={loader}
      initialViewportCenter={selectedSpatial.center}
      externalFocus={focus}
      {...(initialEventDetail ? { initialEventDetail } : {})}
      {...(initialDrawerStage ? { initialDrawerStage } : {})}
      onSelection={onSelection}
    />
  );
}
