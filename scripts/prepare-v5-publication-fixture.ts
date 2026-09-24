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

export async function prepareV5PublicationFixture(root: string): Promise<void> {
  const { artifacts } = await buildV5WorldCompleteArtifacts(state, 31);
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
  for (const item of [
    ...artifacts.documents,
    ...artifacts.index,
    artifacts.root,
    {
      key: `worlds/${V5_FIXTURE_WORLD_ID}/current.json`,
      body: JSON.stringify(pointer)
    }
  ]) {
    const path = resolve(root, item.key);
    await mkdir(resolve(path, ".."), { recursive: true });
    await writeFile(path, item.body);
  }
}
