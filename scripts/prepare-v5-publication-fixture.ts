/** Browser-only complete v5 fixture. Never sourced from live canonical data
 * and never uploaded to the operational Publication store. */
import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import type {
  CanonicalState,
  V5PublicationPointer
} from "@moirai/contracts/v5";
import { buildV5WorldCompleteArtifacts } from "@moirai/graph-presentation/server";
import { backfillV5RenderGeneration } from "../apps/lachesis-worker/src/render-backfill.js";

export const V5_FIXTURE_WORLD_ID = "019f3b00-0000-7000-8000-000000000a01";
const joseon = "019f3b00-0000-7000-8000-000000000a02";
const japan = "019f3b00-0000-7000-8000-000000000a03";
const war = "019f3b00-0000-7000-8000-000000000a11";
const battle = "019f3b00-0000-7000-8000-000000000a12";
const unplaced = "019f3b00-0000-7000-8000-000000000a13";
const calendar = "019f3b00-0000-7000-8000-000000000a21";
export const V5_FIXTURE_IDS = {
  joseon,
  japan,
  war,
  battle,
  unplaced,
  calendar
};

export const V5_CONTINUITY_COMPOSITE_ID =
  "019f3b00-0000-7000-8000-000000000b01";

/** The ordinary fixture's one-child Composite has no spatial extent. Only the
 * compiler/4 continuity fixture adds this explicitly synthetic authored group
 * so real Publication data can cross hull/point and spatial-level boundaries.
 * These records are generated in the local fixture directory, never authored
 * into a canonical service or copied into the normal mobile fixture.
 */
function withContinuityGroup(source: CanonicalState): CanonicalState {
  const cloned = structuredClone(source);
  const result = {
    ...cloned,
    events: [...cloned.events],
    eventCollectionMemberships: [...cloned.eventCollectionMemberships],
    relations: [...cloned.relations],
    narratives: [...cloned.narratives]
  };
  const ids = [
    V5_CONTINUITY_COMPOSITE_ID,
    ...[2, 3, 4, 5].map(
      (index) => `019f3b00-0000-7000-8000-000000000b0${index}`
    )
  ];
  for (const [index, id] of ids.entries()) {
    result.events.push({
      ...source.events[0]!,
      id,
      title: index === 0 ? "합성 연속성 영역" : `합성 연속성 지점 ${index}`
    });
    result.eventCollectionMemberships.push({
      event_id: id,
      collection_id: joseon
    });
    result.narratives.push({
      ...source.narratives[0]!,
      id: `019f3b00-0000-7000-8000-000000000b3${index}`,
      scope_id: id,
      body: `합성 연속성 검증용 서술 ${index}`
    });
  }
  for (const [index, id] of ids.slice(1).entries()) {
    // Three nearby lanes form the tracked narrow hull; the fourth nearby
    // Event remains independent context connected by the authored relations.
    if (index !== 2)
      result.relations.push({
        ...source.relations[0]!,
        id: `019f3b00-0000-7000-8000-000000000b1${index}`,
        source_ref: { kind: "event", event_id: ids[0]! },
        target_ref: { kind: "event", event_id: id }
      });
    result.relations.push({
      ...source.relations[1]!,
      id: `019f3b00-0000-7000-8000-000000000b2${index}`,
      source_ref: { kind: "event", event_id: id },
      target_ref: {
        kind: "time_event",
        time_system_ref: { time_system_id: calendar },
        definition_version: "1",
        coordinate: `${[1590, 1592, 1592, 1594][index]}-01-01T00:00:00.000000000000Z`
      }
    });
  }
  for (let from = 1; from < ids.length; from++) {
    for (let to = from + 1; to < ids.length; to++) {
      result.relations.push({
        ...source.relations[0]!,
        id: `019f3b00-0000-7000-8000-000000000f${from}${to}`,
        type: "causes",
        source_ref: { kind: "event", event_id: ids[from]! },
        target_ref: { kind: "event", event_id: ids[to]! }
      });
    }
  }
  // Distant synthetic context gives the navigation boundary room for L0 ±
  // scale changes. The close group itself remains small enough to become a
  // point. Coincident distant peers also establish a real X layout extent.
  for (let index = 0; index < 49; index++) {
    const id = `019f3b00-0000-7000-8000-${(0xc00 + index).toString(16).padStart(12, "0")}`;
    result.events.push({
      ...source.events[0]!,
      id,
      title: `합성 먼 맥락 ${index}`
    });
    result.eventCollectionMemberships.push({
      event_id: id,
      collection_id: joseon
    });
    result.narratives.push({
      ...source.narratives[0]!,
      id: `019f3b00-0000-7000-8000-${(0xd00 + index).toString(16).padStart(12, "0")}`,
      scope_id: id,
      body: `합성 먼 맥락 서술 ${index}`
    });
    result.relations.push({
      ...source.relations[1]!,
      id: `019f3b00-0000-7000-8000-${(0xe00 + index).toString(16).padStart(12, "0")}`,
      source_ref: { kind: "event", event_id: id },
      target_ref: {
        kind: "time_event",
        time_system_ref: { time_system_id: calendar },
        definition_version: "1",
        coordinate: `${index < 48 ? 1500 : 1700}-01-01T00:00:00.000000000000Z`
      }
    });
  }
  return result;
}

const state: CanonicalState = {
  world: {
    id: V5_FIXTURE_WORLD_ID,
    slug: "actual-history-fixture",
    title: "실제 세계사",
    description: null
  },
  collections: [
    {
      id: joseon,
      world_id: V5_FIXTURE_WORLD_ID,
      slug: "joseon",
      title: "조선사",
      description: null
    },
    {
      id: japan,
      world_id: V5_FIXTURE_WORLD_ID,
      slug: "japan",
      title: "일본사",
      description: null
    }
  ],
  events: [
    {
      id: war,
      world_id: V5_FIXTURE_WORLD_ID,
      slug: null,
      title: "임진왜란",
      summary: null,
      roles: [],
      attributes: {}
    },
    {
      id: battle,
      world_id: V5_FIXTURE_WORLD_ID,
      slug: null,
      title: "공유된 전투",
      summary: null,
      roles: [],
      attributes: {}
    },
    {
      id: unplaced,
      world_id: V5_FIXTURE_WORLD_ID,
      slug: null,
      title: "연대 미상 기록",
      summary: null,
      roles: [],
      attributes: {}
    }
  ],
  eventCollectionMemberships: [
    { event_id: war, collection_id: joseon },
    { event_id: battle, collection_id: joseon },
    { event_id: battle, collection_id: japan },
    { event_id: unplaced, collection_id: japan }
  ],
  relations: [
    {
      id: "019f3b00-0000-7000-8000-000000000a31",
      world_id: V5_FIXTURE_WORLD_ID,
      type: "contains",
      direction: "directed",
      source_ref: { kind: "event", event_id: war },
      target_ref: { kind: "event", event_id: battle },
      attributes: {}
    },
    {
      id: "019f3b00-0000-7000-8000-000000000a32",
      world_id: V5_FIXTURE_WORLD_ID,
      type: "coincides",
      direction: "undirected",
      source_ref: { kind: "event", event_id: battle },
      target_ref: {
        kind: "time_event",
        time_system_ref: { time_system_id: calendar },
        definition_version: "1",
        coordinate: "1592-04-13T00:00:00.000000000000Z"
      },
      attributes: {}
    }
  ],
  narratives: [
    ...[
      [war, "임진왜란 서사"],
      [battle, "공유된 전투 서사"],
      [unplaced, "연대 미상 사건 서사"]
    ].map(([id, body], index) => ({
      id: `019f3b00-0000-7000-8000-000000000a4${index + 1}`,
      world_id: V5_FIXTURE_WORLD_ID,
      scope_type: "event" as const,
      scope_id: id!,
      locale: "ko",
      title: null,
      body: body!,
      public_references: [],
      notes: []
    })),
    ...[
      [joseon, "조선사 컬렉션 서사"],
      [japan, "일본사 컬렉션 서사"]
    ].map(([id, body], index) => ({
      id: `019f3b00-0000-7000-8000-000000000a5${index + 1}`,
      world_id: V5_FIXTURE_WORLD_ID,
      scope_type: "collection" as const,
      scope_id: id!,
      locale: "ko",
      title: null,
      body: body!,
      public_references: [],
      notes: []
    }))
  ],
  timeSystems: [
    {
      id: calendar,
      world_id: V5_FIXTURE_WORLD_ID,
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

export async function prepareV5PublicationFixture(
  root: string,
  options: { renderPublication?: boolean } = {}
): Promise<void> {
  const fixtureState = options.renderPublication
    ? withContinuityGroup(state)
    : state;
  const { artifacts } = await buildV5WorldCompleteArtifacts(
    fixtureState,
    31,
    undefined,
    options
  );
  const pointer: V5PublicationPointer = {
    format_version: "v5-publication/1",
    world_id: V5_FIXTURE_WORLD_ID,
    current_revision: 31,
    served_revision: 31,
    publication_target_revision: 31,
    projection_status: "ready",
    manifest_key: artifacts.root.key,
    manifest_sha256: createHash("sha256")
      .update(artifacts.root.body)
      .digest("hex"),
    generated_at: "2026-09-24T00:00:00.000Z"
  };
  const objects = new Map(
    [
      ...artifacts.documents,
      ...artifacts.index,
      artifacts.root,
      {
        key: `worlds/${V5_FIXTURE_WORLD_ID}/current.json`,
        body: JSON.stringify(pointer)
      }
    ].map((item) => [item.key, item.body])
  );
  if (options.renderPublication) {
    // Exercise the worker's actual generation/pointer publication, not merely
    // embedded render documents (which the normal browser reader ignores).
    const etag = (body: string) =>
      createHash("sha256").update(body).digest("hex");
    await backfillV5RenderGeneration({
      state: fixtureState,
      revision: 31,
      store: {
        get: async (key) => {
          const body = objects.get(key);
          return {
            status: body === undefined ? 404 : 200,
            body: body ?? null,
            etag: body === undefined ? null : etag(body)
          };
        },
        put: async (key, body, policy) => {
          const previous = objects.get(key);
          if (
            (previous !== undefined &&
              (policy?.immutable || policy?.ifNoneMatch)) ||
            (policy?.ifMatch &&
              (previous === undefined || etag(previous) !== policy.ifMatch))
          )
            return {
              status: 412,
              etag: previous === undefined ? null : etag(previous)
            };
          objects.set(key, body);
          return { status: 201, etag: etag(body) };
        }
      }
    });
  }
  for (const [key, body] of objects) {
    const path = resolve(root, key);
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, body);
  }
}
