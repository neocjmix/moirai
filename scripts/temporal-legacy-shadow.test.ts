import { readFileSync } from "node:fs";
import type {
  PublicCanon,
  PublicCanonTimeSystem,
  PublicEvent,
  PublicRelation,
  PublicTemporalPlacement,
  PublicTimeSystem,
  PublicTimelineItem,
  PublicWorld
} from "../packages/contracts/src/index.js";
import {
  shadowLegacyTemporalState,
  TemporalAdapterRegistry
} from "../packages/domain/src/index.js";
import { projectTimeline } from "../packages/projections/src/index.js";
import { expect, it } from "vitest";

interface ShadowEvidence {
  readonly source: {
    readonly canon_id: string;
    readonly source_revision: number;
  };
  readonly world: PublicWorld;
  readonly canons: readonly PublicCanon[];
  readonly time_systems: readonly PublicTimeSystem[];
  readonly canon_time_systems: readonly PublicCanonTimeSystem[];
  readonly events: readonly PublicEvent[];
  readonly temporal_placements: readonly PublicTemporalPlacement[];
  readonly relations: readonly PublicRelation[];
  readonly expected: {
    readonly classification_counts: Readonly<
      Record<"lossless" | "ambiguous" | "unsupported" | "conflicting", number>
    >;
    readonly ambiguous_placement_ids: readonly string[];
    readonly solver: {
      readonly valid: boolean;
      readonly exact_coordinates_by_event: Readonly<Record<string, string>>;
    };
    readonly legacy_timeline: {
      readonly algorithm_version: string;
      readonly item_count: number;
      readonly authored_coordinate_count: number;
      readonly interval_items: readonly Pick<
        PublicTimelineItem,
        "event_id" | "range_start" | "range_end" | "display_label"
      >[];
    };
  };
}

function readEvidence(): ShadowEvidence {
  return JSON.parse(
    readFileSync(
      new URL(
        "../docs/implementation/evidence/temporal-shadow-clotho-synthetic-r29.json",
        import.meta.url
      ),
      "utf8"
    )
  ) as ShadowEvidence;
}

it("compares the legacy Timeline and relational solver from the same immutable source revision", () => {
  const evidence = readEvidence();
  const legacy = projectTimeline(
    {
      world: evidence.world,
      canons: evidence.canons,
      timeSystems: evidence.time_systems,
      canonTimeSystems: evidence.canon_time_systems,
      events: evidence.events,
      temporalPlacements: evidence.temporal_placements,
      relations: evidence.relations,
      narratives: []
    },
    evidence.source.source_revision,
    {
      canonId: evidence.source.canon_id,
      timeSystemId: evidence.time_systems[0]!.id
    }
  );
  const relational = shadowLegacyTemporalState(
    {
      temporalPlacements: evidence.temporal_placements,
      timeSystems: evidence.time_systems,
      relations: evidence.relations
    },
    new TemporalAdapterRegistry()
  );

  expect(legacy.algorithm_version).toBe(
    evidence.expected.legacy_timeline.algorithm_version
  );
  expect(legacy.items).toHaveLength(
    evidence.expected.legacy_timeline.item_count
  );
  expect(
    legacy.items.filter((item) => item.placement_kind === "authored_coordinate")
  ).toHaveLength(evidence.expected.legacy_timeline.authored_coordinate_count);
  const intervalIds = new Set(evidence.expected.ambiguous_placement_ids);
  expect(
    legacy.items
      .filter((item) =>
        evidence.temporal_placements.some(
          (placement) =>
            intervalIds.has(placement.id) &&
            placement.event_id === item.event_id
        )
      )
      .map((item) => ({
        event_id: item.event_id,
        range_start: item.range_start,
        range_end: item.range_end,
        display_label: item.display_label
      }))
      .sort((left, right) => left.event_id.localeCompare(right.event_id))
  ).toEqual(
    [...evidence.expected.legacy_timeline.interval_items].sort((left, right) =>
      left.event_id.localeCompare(right.event_id)
    )
  );

  const counts = {
    lossless: 0,
    ambiguous: 0,
    unsupported: 0,
    conflicting: 0
  };
  for (const read of relational.reads) counts[read.classification] += 1;
  expect(counts).toEqual(evidence.expected.classification_counts);
  expect(relational.solver.valid).toBe(evidence.expected.solver.valid);
  expect(
    Object.fromEntries(
      relational.solver.projections.flatMap((projection) =>
        projection.kind === "exact"
          ? [[projection.event_id, projection.time_event.coordinate]]
          : []
      )
    )
  ).toEqual(evidence.expected.solver.exact_coordinates_by_event);
});
