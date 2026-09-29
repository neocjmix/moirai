"use client";
import { useMemo } from "react";
import { Theme } from "@radix-ui/themes";
import { App } from "../urdr-port/src/App";
import { createV5GraphReadLoader } from "../lib/v5-graph-read-loader";
import type { GraphShellWorkspaceShell } from "../urdr-port/shared/contracts";
import { GraphQueryProvider, useGraphQuery } from "./graph-query-context";
import {
  createDefaultGraphUrlState,
  type GraphSourceCatalog
} from "../lib/moirai-graph-source-query";
import type { AtroposScreenId } from "../lib/atropos-screen-registry";

import type { CollectionDiscoveryConfig } from "../lib/collection-discovery-config";

export interface V5AtroposBootstrap {
  discovery?: CollectionDiscoveryConfig;
  worldId: string;
  revision: number;
  timeSystemId: string;
  catalog: GraphSourceCatalog;
  workspace: GraphShellWorkspaceShell;
  center: { x: number; y: number } | null;
  eventId?: string;
  readPage?: number;
  fullEvent?: boolean;
  collectionIds?: string[];
  renderEnabled?: boolean;
  screen?: AtroposScreenId;
}

export function V5AtroposRoot(props: V5AtroposBootstrap) {
  const state = useMemo(() => {
    const state = createDefaultGraphUrlState(props.catalog);
    return {
      ...state,
      query: {
        ...state.query,
        sources: state.query.sources.map((source) => ({
          ...source,
          canon_ids: props.collectionIds ?? source.canon_ids
        }))
      },
      focus: props.eventId
        ? {
            kind: "event" as const,
            world_id: props.worldId,
            served_revision: props.revision,
            canon_id:
              props.collectionIds?.[0] ??
              props.catalog.worlds[0]?.canons[0]?.id ??
              props.worldId,
            event_ref: { kind: "event" as const, event_id: props.eventId }
          }
        : null
    };
  }, [
    props.catalog,
    props.collectionIds,
    props.eventId,
    props.worldId,
    props.revision
  ]);
  return (
    <GraphQueryProvider
      initialState={state}
      catalog={props.catalog}
      entities={[]}
      relations={[]}
      diagnostics={[]}
      completeness="complete"
      v5
    >
      <Theme
        accentColor="gray"
        appearance="light"
        grayColor="sage"
        radius="large"
        scaling="100%"
      >
        <V5GraphApp {...props} />
      </Theme>
    </GraphQueryProvider>
  );
}

function V5GraphApp(props: V5AtroposBootstrap) {
  const { state, setState } = useGraphQuery();
  const selection = JSON.stringify({
    collections: state.query.sources
      .flatMap((source) => source.canon_ids)
      .sort(),
    relationTypes: state.query.relation_filter.types
  });
  const loader = useMemo(
    () =>
      createV5GraphReadLoader({
        worldId: props.worldId,
        revision: props.revision,
        timeSystemId: props.timeSystemId,
        workspace: props.workspace,
        readPage: props.readPage,
        collectionIds: JSON.parse(selection).collections,
        relationTypes: JSON.parse(selection).relationTypes,
        ...(props.renderEnabled
          ? {
              renderTiles: {
                worldId: props.worldId,
                revision: props.revision,
                timeSystemId: props.timeSystemId,
                collectionIds: JSON.parse(selection).collections
              }
            }
          : {})
      }),
    [
      props.worldId,
      props.revision,
      props.timeSystemId,
      props.workspace,
      props.readPage,
      props.renderEnabled,
      selection
    ]
  );
  const focus =
    state.focus?.kind === "event" && state.focus.event_ref.kind === "event"
      ? state.focus.event_ref.event_id
      : null;
  return (
    <App
      {...(props.discovery ? { discovery: props.discovery } : {})}
      preserveWorkspaceOnLoaderChange
      initialScreen={props.screen ?? "graph"}
      initialDrawerStage={props.fullEvent ? "full" : "peek"}
      loader={loader}
      initialViewportCenter={props.center}
      externalFocus={focus ? { id: focus, label: focus } : null}
      onSelection={(id) =>
        setState((current) => ({
          ...current,
          focus: id
            ? {
                kind: "event",
                world_id: props.worldId,
                served_revision: props.revision,
                canon_id:
                  current.query.sources[0]?.canon_ids[0] ??
                  props.catalog.worlds[0]?.canons[0]?.id ??
                  props.worldId,
                event_ref: { kind: "event", event_id: id }
              }
            : null
        }))
      }
    />
  );
}
