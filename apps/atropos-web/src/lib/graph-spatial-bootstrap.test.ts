import { describe, expect, it } from "vitest";
import type { MoiraiGraphUrlState } from "@moirai/contracts";
import { presentationScopeKey } from "@moirai/graph-presentation";
import {
  selectGraphSpatialBootstrap,
  type GraphSpatialBootstrap
} from "./graph-spatial-bootstrap";

const worldId = "01995c2a-7b00-7000-8000-000000000101";
const source = (canon_id: string) => ({
  world_id: worldId,
  served_revision: 7,
  canon_id
});
const first = source("019f5b00-0000-7000-8000-000000000002");
const second = source("01a0c40a-a761-73d7-a8d2-fb4cddb6fd57");
const firstId = presentationScopeKey(first);
const secondId = presentationScopeKey(second);

describe("selectGraphSpatialBootstrap", () => {
  it("drops stale graph-shell Canons and recenters after source changes", () => {
    const spatial = {
      workspace: {
        navigationScopes: [
          {
            canonId: firstId,
            widthHint: 1800,
            bounds: { minX: 0, maxX: 100, minY: 1000, maxY: 1200 },
            ready: true
          },
          {
            canonId: secondId,
            widthHint: 1800,
            bounds: { minX: 20, maxX: 220, minY: 2000, maxY: 2400 },
            ready: true
          }
        ],
        menuItems: [],
        tabs: [
          {
            id: "frame",
            label: "Frame",
            description: "Frame",
            availableCanonIds: [firstId, secondId],
            defaultEnabledCanonIds: [firstId, secondId],
            timeSystemId: "time",
            compatibilityKey: "frame"
          }
        ],
        canons: [
          {
            id: firstId,
            label: "First",
            worldId,
            worldLabel: "World",
            timeSystemId: "time",
            timeSystemLabel: "Time",
            compatibilityKey: "frame"
          },
          {
            id: secondId,
            label: "Second",
            worldId,
            worldLabel: "World",
            timeSystemId: "time",
            timeSystemLabel: "Time",
            compatibilityKey: "frame"
          }
        ],
        defaultTabId: "frame",
        buildRevision: JSON.stringify([first, second])
      },
      center: { x: 50, y: 1100 }
    } as GraphSpatialBootstrap;
    const state = {
      query: {
        sources: [
          {
            world_id: worldId,
            served_revision: 7,
            canon_ids: [second.canon_id],
            time_systems: []
          }
        ]
      }
    } as unknown as MoiraiGraphUrlState;

    const selected = selectGraphSpatialBootstrap(spatial, state);

    expect(
      selected.workspace.navigationScopes?.map((scope) => scope.canonId)
    ).toEqual([secondId]);
    expect(selected.workspace.tabs[0]?.availableCanonIds).toEqual([secondId]);
    expect(selected.workspace.tabs[0]?.defaultEnabledCanonIds).toEqual([
      secondId
    ]);
    expect(selected.workspace.canons.map((canon) => canon.id)).toEqual([
      secondId
    ]);
    expect(selected.center).toEqual({ x: 120, y: 2200 });
    expect(selected.workspace.buildRevision).toBe(JSON.stringify([second]));
  });
});
