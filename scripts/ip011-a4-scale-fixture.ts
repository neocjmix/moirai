/** Shared synthetic shape for real worker and browser scale acceptance. */
import type { CanonicalState } from "@moirai/contracts/v5";
export function scaleFixture(count: number, density: string): CanonicalState {
  if (
    ![1000, 10000, 100000].includes(count) ||
    !["sparse", "dense", "shared", "large", "sustained"].includes(density)
  )
    throw Error("a4_fixture_shape_invalid");
  const id = (i: number) => `event-${String(i).padStart(6, "0")}`;
  const worldId = "a4-synthetic-world";
  const local = density === "dense" ? 300 : 12;
  const members =
    density === "large" || density === "sustained" ? count : local;
  const coordinate = (i: number) => {
    if (density === "sustained")
      return `${1453 + Math.floor(i / 32)}-01-${String((i % 28) + 1).padStart(2, "0")}T00:00:00.000000000000Z`;
    const year = i < local ? 1453 : 2000 + (Math.floor((i - local) / 366) % 20);
    const day =
      i < local ? (density === "dense" ? 1 : i + 1) : ((i - local) % 28) + 1;
    return `${year}-01-${String(day).padStart(2, "0")}T00:00:00.000000000000Z`;
  };
  const events = Array.from({ length: count }, (_, i) => ({
    id: id(i),
    world_id: worldId,
    slug: null,
    title: id(i),
    summary: null,
    roles: [],
    attributes: {}
  }));
  let state: CanonicalState = {
    world: { id: worldId, slug: "a4", title: "Synthetic", description: null },
    collections: ["a", "b"].map((c) => ({
      id: c,
      world_id: worldId,
      slug: c,
      title: c,
      description: null
    })),
    events,
    eventCollectionMemberships: events.flatMap((event, i) =>
      i < members
        ? [
            { event_id: event.id, collection_id: "a" },
            ...(density === "shared"
              ? [{ event_id: event.id, collection_id: "b" }]
              : [])
          ]
        : []
    ),
    relations: events.map((event, i) => ({
      id: `date-${id(i)}`,
      world_id: worldId,
      type: "coincides" as const,
      direction: "undirected" as const,
      source_ref: { kind: "event" as const, event_id: event.id },
      target_ref: {
        kind: "time_event" as const,
        time_system_ref: { time_system_id: "gregorian" },
        definition_version: "1",
        coordinate: coordinate(i)
      },
      attributes: {}
    })),
    narratives: [
      ...events.map((event) => ({
        id: `n-${event.id}`,
        world_id: worldId,
        scope_type: "event" as const,
        scope_id: event.id,
        locale: "ko",
        title: null,
        body: "Synthetic event",
        public_references: [],
        notes: []
      })),
      ...["a", "b"].map((c) => ({
        id: `n-${c}`,
        world_id: worldId,
        scope_type: "collection" as const,
        scope_id: c,
        locale: "ko",
        title: null,
        body: "Synthetic collection",
        public_references: [],
        notes: []
      }))
    ],
    timeSystems: [
      {
        id: "gregorian",
        world_id: worldId,
        slug: "gregorian",
        title: "Gregorian",
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
    collectionTimeSystems: []
  };

  // Separate sustained-navigation fixture; the four original fixed-gate shapes
  // remain byte-for-byte unchanged. Each neighborhood has points and a hull.
  if (density === "sustained") {
    const relations = state.relations.filter((_, i) => i % 32 !== 0);
    for (let parent = 0; parent + 8 < count; parent += 32) {
      for (let child = parent + 1; child <= parent + 8; child++) {
        relations.push({
          id: `contains-${id(child)}`,
          world_id: worldId,
          type: "contains",
          direction: "directed",
          source_ref: { kind: "event", event_id: id(parent) },
          target_ref: { kind: "event", event_id: id(child) },
          attributes: {}
        });
      }
    }
    state = { ...state, relations };
  }

  const ids = new Map<string, string>();
  const uuid = (group: number, index: number) =>
    `019f5000-1300-7000-${(0x8000 + group).toString(16)}-${index.toString(16).padStart(12, "0")}`;
  ids.set(state.world.id, uuid(0, 1));
  for (const [group, items] of [
    state.events,
    state.narratives,
    state.relations,
    state.collections,
    state.timeSystems,
    state.collectionTimeSystems
  ].entries()) {
    items.forEach((item, index) =>
      ids.set(item.id, uuid(group + 1, index + 1))
    );
  }
  return JSON.parse(
    JSON.stringify(state, (key, value: unknown) =>
      typeof value === "string" &&
      [
        "id",
        "world_id",
        "scope_id",
        "event_id",
        "collection_id",
        "time_system_id"
      ].includes(key)
        ? (ids.get(value) ?? value)
        : value
    )
  ) as CanonicalState;
}
