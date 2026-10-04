/** Server-side synthetic input for the isolated research route. This module
 * only prepares immutable in-memory records; it never publishes or writes. */
import { createHash } from "node:crypto";
import type { CanonicalState, Relation } from "@moirai/contracts/v5";
import { projectV5WorldTemporal } from "@moirai/projections";
import { prepareV5LayoutInput } from "@moirai/graph-presentation/server";
import { snapshotDigestPayload, type LabSnapshot } from "./types";

export const SYNTHETIC_LAB_WORLD_ID = "00000000-0000-4000-8000-00000000a013";
export const SYNTHETIC_LAB_REVISION = 1;
export const SYNTHETIC_LAB_TIME_SYSTEM_ID =
  "00000000-0000-4000-8000-00000000b013";

/** These are authored scenario groups, not inferred containment or membership. */
export const SYNTHETIC_LAB_SCENARIOS = [
  {
    id: "dense",
    title: "Dense / 160 Events",
    eventIds: ["dense-process", "shared", "dense-000", "dense-159"]
  },
  {
    id: "nested-overlap",
    title: "Nested / overlapping Composites",
    eventIds: ["inner-process", "outer-process", "overlap-process", "shared"]
  },
  {
    id: "short-span",
    title: "Two-day process",
    eventIds: ["inner-process", "short-a", "short-b"]
  },
  {
    id: "long-span",
    title: "550-year span / offscreen child",
    eventIds: ["long-process", "long-before", "outer-process", "far-child"]
  },
  {
    id: "sparse",
    title: "Sparse / shared membership",
    eventIds: ["sparse-process", "sparse", "far-child", "shared"]
  }
] as const;

function freeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function time(year: number, month = 1, day = 1) {
  return {
    kind: "time_event" as const,
    time_system_ref: { time_system_id: SYNTHETIC_LAB_TIME_SYSTEM_ID },
    definition_version: "1",
    coordinate: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T00:00:00.000000000000Z`
  };
}

/** All names and facts are synthetic; the real-history World is never a target. */
export function createSyntheticLabState(): CanonicalState {
  const worldId = SYNTHETIC_LAB_WORLD_ID;
  const dense = Array.from({ length: 160 }, (_, index) => ({
    id: `dense-${String(index).padStart(3, "0")}`,
    title: `Dense Event ${index + 1}`
  }));
  const named = [
    ["long-process", "Long process · 1400–1950"],
    ["outer-process", "Outer process · offscreen child"],
    ["inner-process", "Inner process · two days"],
    ["overlap-process", "Overlapping process · shared children"],
    ["dense-process", "Dense process · 160 Events"],
    ["sparse-process", "Sparse process · 1660–1950"],
    ["long-before", "Early boundary · 1400"],
    ["long-after", "Late boundary · 1800"],
    ["shared", "Shared Event · in two Collections"],
    ["short-a", "Short process first day"],
    ["short-b", "Short process second day"],
    ["sparse", "Sparse Event · 1660"],
    ["far-child", "Distant child · 1950"],
    ["unplaced", "Undated Event · remains unplaced"]
  ].map(([id, title]) => ({ id: id!, title: title! }));
  const events = [...named, ...dense].map(({ id, title }) => ({
    id,
    world_id: worldId,
    slug: null,
    title,
    summary: "Synthetic Layout Lab regression fixture; not a historical fact.",
    roles: [],
    attributes: {}
  }));
  const relation = (
    type: "contains" | "causes" | "precedes",
    source: string,
    target: string
  ): Relation => ({
    id: `${type}:${source}:${target}`,
    world_id: worldId,
    type,
    direction: "directed",
    source_ref: { kind: "event", event_id: source },
    target_ref: { kind: "event", event_id: target },
    attributes: {}
  });
  const contains = (parent: string, children: readonly string[]) =>
    children.map((child) => relation("contains", parent, child));
  const dated = (id: string, year: number, month = 1, day = 1): Relation => ({
    id: `date:${id}`,
    world_id: worldId,
    type: "coincides",
    direction: "undirected",
    source_ref: { kind: "event", event_id: id },
    target_ref: time(year, month, day),
    attributes: {}
  });
  const collections = [
    { id: "lab-primary", title: "Primary process" },
    { id: "lab-overlap", title: "Overlapping selection" },
    { id: "lab-sparse", title: "Sparse / long-span selection" }
  ].map(({ id, title }) => ({
    id,
    world_id: worldId,
    slug: id,
    title,
    description: "Synthetic selection; membership does not define layout."
  }));
  const memberships = [
    ...[
      "outer-process",
      "inner-process",
      "dense-process",
      "shared",
      "short-a",
      "short-b",
      ...dense.map(({ id }) => id)
    ].map((event_id) => ({
      event_id,
      collection_id: "lab-primary"
    })),
    ...[
      "overlap-process",
      "shared",
      "dense-000",
      "dense-040",
      "dense-080",
      "sparse"
    ].map((event_id) => ({
      event_id,
      collection_id: "lab-overlap"
    })),
    ...[
      "long-process",
      "sparse-process",
      "long-before",
      "long-after",
      "sparse",
      "far-child",
      "unplaced"
    ].map((event_id) => ({
      event_id,
      collection_id: "lab-sparse"
    }))
  ];
  return freeze({
    world: {
      id: worldId,
      slug: "layout-lab-pathological-fixture",
      title: "Synthetic · nested / overlap / dense / long span",
      description: "Immutable research fixture. No production World is changed."
    },
    collections,
    events,
    eventCollectionMemberships: memberships,
    relations: [
      ...contains("long-process", [
        "long-before",
        "outer-process",
        "long-after"
      ]),
      ...contains("outer-process", [
        "inner-process",
        "dense-process",
        "far-child"
      ]),
      ...contains("inner-process", ["short-a", "short-b", "shared"]),
      ...contains("overlap-process", [
        "shared",
        "dense-000",
        "dense-040",
        "dense-080",
        "sparse"
      ]),
      ...contains("dense-process", [...dense.map(({ id }) => id), "shared"]),
      ...contains("sparse-process", ["sparse", "far-child"]),
      ...dense.map(({ id }, index) => dated(id, 1592, 5, 1 + (index % 8))),
      dated("long-before", 1400),
      dated("long-after", 1800),
      dated("shared", 1592, 5, 1),
      dated("short-a", 1592, 5, 1),
      dated("short-b", 1592, 5, 2),
      dated("sparse", 1660),
      dated("far-child", 1950),
      relation("precedes", "short-a", "short-b"),
      relation("causes", "shared", "short-b"),
      ...dense
        .slice(0, 20)
        .map(({ id }, index) => relation("causes", id, dense[index + 1]!.id))
    ],
    narratives: [
      ...events.map(({ id }) => ({
        scope_type: "event" as const,
        scope_id: id
      })),
      ...collections.map(({ id }) => ({
        scope_type: "collection" as const,
        scope_id: id
      }))
    ].map((scope) => ({
      ...scope,
      id: `narrative:${scope.scope_id}`,
      world_id: worldId,
      locale: "en",
      title: null,
      body: "Synthetic Layout Lab regression fixture; not a historical claim.",
      public_references: [],
      notes: []
    })),
    timeSystems: [
      {
        id: SYNTHETIC_LAB_TIME_SYSTEM_ID,
        world_id: worldId,
        slug: "lab-gregorian",
        title: "Gregorian (synthetic)",
        kind: "calendar",
        definition_version: "1",
        definition: {
          coordinate_codec: "yyyy-iso-fields-fraction12-z-v1",
          calendar: "proleptic-gregorian",
          timezone: "UTC",
          fractional_digits: 12,
          leap_second_policy: "reject",
          interval_policy: "half-open",
          capabilities: [
            "canonicalize",
            "equality",
            "compare",
            "boundary",
            "difference"
          ]
        }
      }
    ],
    collectionTimeSystems: collections.map(({ id }) => ({
      id: `collection-time-system:${id}`,
      collection_id: id,
      time_system_id: SYNTHETIC_LAB_TIME_SYSTEM_ID
    }))
  });
}

export function createSyntheticLabSnapshot(): LabSnapshot {
  const state = createSyntheticLabState();
  const temporal = projectV5WorldTemporal(state, SYNTHETIC_LAB_REVISION);
  const input = prepareV5LayoutInput(
    state,
    temporal,
    SYNTHETIC_LAB_TIME_SYSTEM_ID
  );
  const relations = state.relations
    .flatMap((relation) =>
      relation.source_ref.kind === "event" &&
      relation.target_ref.kind === "event"
        ? [
            {
              id: relation.id,
              sourceId: relation.source_ref.event_id,
              targetId: relation.target_ref.event_id,
              type: relation.type
            }
          ]
        : []
    )
    .sort((a, b) => a.id.localeCompare(b.id));
  const events = state.events
    .map((event) => ({
      id: event.id,
      title: event.title,
      childIds: relations
        .filter(
          (relation) =>
            relation.type === "contains" && relation.sourceId === event.id
        )
        .map((relation) => relation.targetId)
        .sort(),
      collectionIds: state.eventCollectionMemberships
        .filter((membership) => membership.event_id === event.id)
        .map((membership) => membership.collection_id)
        .sort()
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const collections = state.collections
    .map((collection) => ({
      id: collection.id,
      title: collection.title,
      eventIds: state.eventCollectionMemberships
        .filter((membership) => membership.collection_id === collection.id)
        .map((membership) => membership.event_id)
        .sort()
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const payload = { input, events, relations, collections };
  return freeze({
    formatVersion: "layout-lab-snapshot/1",
    worldId: state.world.id,
    worldTitle: state.world.title,
    sourceRevision: SYNTHETIC_LAB_REVISION,
    servedRevision: SYNTHETIC_LAB_REVISION,
    timeSystemId: SYNTHETIC_LAB_TIME_SYSTEM_ID,
    sourceRootDigest: createHash("sha256")
      .update(JSON.stringify(state))
      .digest("hex"),
    inputDigest: createHash("sha256")
      .update(snapshotDigestPayload(payload))
      .digest("hex"),
    ...payload
  });
}
