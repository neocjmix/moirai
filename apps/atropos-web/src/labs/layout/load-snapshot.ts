/** Research-only full snapshot loader. Production viewport/render routes never
 * import this module. Its sole storage capability is immutable/public GET. */
import { createHash } from "node:crypto";
import type { PublicTimeSystem, PublicWorld } from "@moirai/contracts";
import type { Collection, Event, Relation } from "@moirai/contracts/v5";
import type { ObjectStore } from "@moirai/publication";
import { readV5ServedRoot, readV5StagedDocument } from "@moirai/publication/v5";
import {
  prepareV5LayoutInput,
  type V5LayoutTemporalInput
} from "@moirai/graph-presentation/server";
import { assertPublicId, readPublicationObject } from "../../lib/publication";
import { snapshotDigestPayload, type LabSnapshot } from "./types";
import { validateLabSnapshot } from "./snapshot-validation";

const hash = (text: string) => createHash("sha256").update(text).digest("hex");
const byId = <T extends { id: string }>(values: T[]) =>
  values.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

interface IndexReference {
  key: string;
  sha256: string;
  first_key: string;
  last_key: string;
}

/** Enumerate authenticated keys so old published snapshots without the newer
 * Event catalog remain usable. Each selected payload is authenticated again by
 * readV5StagedDocument. Whole-world work is confined to this research loader. */
async function documentKeys(
  rootBody: string,
  get: (key: string) => Promise<string | null>
): Promise<string[]> {
  const root = JSON.parse(rootBody) as {
    world_id: string;
    revision: number;
    index_depth: number;
    document_count: number;
    fanout: number;
    entries: IndexReference[];
  };
  const prefix = `worlds/${root.world_id}/revisions/${root.revision}/v5/`;
  if (
    ![32, 128].includes(root.fanout) ||
    !Number.isSafeInteger(root.index_depth) ||
    root.index_depth < 1 ||
    root.index_depth > 16 ||
    !Number.isSafeInteger(root.document_count) ||
    root.document_count < 1
  )
    throw Error("lab_snapshot_index_invalid");
  const keys: string[] = [];
  const visit = async (
    refs: IndexReference[],
    level: number
  ): Promise<void> => {
    if (
      !Array.isArray(refs) ||
      refs.length > root.fanout ||
      refs.some(
        (ref, index) =>
          !ref.key.startsWith(prefix) ||
          !/^[a-f0-9]{64}$/.test(ref.sha256) ||
          ref.first_key > ref.last_key ||
          (index > 0 && refs[index - 1]!.last_key >= ref.first_key)
      )
    )
      throw Error("lab_snapshot_index_invalid");
    for (const ref of refs) {
      if (level < 0) {
        if (ref.key !== ref.first_key || ref.key !== ref.last_key)
          throw Error("lab_snapshot_index_invalid");
        keys.push(ref.key);
        continue;
      }
      if (!ref.key.startsWith(`${prefix}complete/index/${level}/`))
        throw Error("lab_snapshot_index_invalid");
      const body = await get(ref.key);
      if (body === null || hash(body) !== ref.sha256)
        throw Error("lab_snapshot_index_digest_mismatch");
      const node = JSON.parse(body) as {
        world_id: string;
        revision: number;
        kind: string;
        entries: IndexReference[];
      };
      if (
        node.world_id !== root.world_id ||
        node.revision !== root.revision ||
        node.kind !== (level === 0 ? "leaf" : "branch") ||
        node.entries?.[0]?.first_key !== ref.first_key ||
        node.entries.at(-1)?.last_key !== ref.last_key
      )
        throw Error("lab_snapshot_index_invalid");
      await visit(node.entries, level - 1);
    }
  };
  await visit(root.entries, root.index_depth - 1);
  if (keys.length !== root.document_count || new Set(keys).size !== keys.length)
    throw Error("lab_snapshot_index_incomplete");
  return keys;
}

export async function loadLayoutLabSnapshot(
  worldId: string,
  expectedRevision?: number,
  selectedTimeSystemId?: string,
  source: Pick<ObjectStore, "get"> = { get: readPublicationObject }
): Promise<LabSnapshot> {
  assertPublicId(worldId);
  if (selectedTimeSystemId) assertPublicId(selectedTimeSystemId);
  if (
    expectedRevision !== undefined &&
    (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1)
  )
    throw Error("lab_snapshot_revision_invalid");
  const pending = new Map<string, ReturnType<typeof source.get>>();
  const store: Pick<ObjectStore, "get"> = {
    get(key) {
      let result = pending.get(key);
      if (!result) {
        result = source.get(key);
        pending.set(key, result);
      }
      return result;
    }
  };
  // Resolve the mutable pointer exactly once. Every subsequent request uses
  // this authenticated root even if another author advances current.json.
  const { pointer, rootBody } = await readV5ServedRoot(store, worldId);
  const revision = pointer.served_revision;
  if (expectedRevision !== undefined && expectedRevision !== revision)
    throw Error("lab_snapshot_revision_changed");
  const get = async (key: string) => {
    const result = await store.get(key);
    if (result.status !== 200 || result.body === null)
      throw Error("lab_snapshot_object_unavailable");
    return result.body;
  };
  const prefix = `worlds/${worldId}/revisions/${revision}/v5/`;
  const keys = await documentKeys(rootBody, get);
  const read = async <T>(suffix: string): Promise<T> => {
    const body = await readV5StagedDocument(
      rootBody,
      `${prefix}${suffix}`,
      get
    );
    if (body === null) throw Error("lab_snapshot_document_missing");
    const value = JSON.parse(body) as T & {
      world_id: string;
      revision: number;
    };
    if (value.world_id !== worldId || value.revision !== revision)
      throw Error("lab_snapshot_mixed_revision");
    return value;
  };
  const summary = await read<{
    world: PublicWorld;
    event_count: number;
    relation_count: number;
    collection_count: number;
    time_system_count: number;
  }>("content/world.json");
  const temporalSummary = await read<{
    semantic_digest: string;
    position_count: number;
    composite_count: number;
  }>("temporal/world.json");
  const events: Event[] = [];
  const relations: Relation[] = [];
  const systems: PublicTimeSystem[] = [];
  const collections: Collection[] = [];
  const memberCounts = new Map<string, number>();
  const memberships = new Map<string, string[]>();
  const positions: V5LayoutTemporalInput["positions"][number][] = [];
  const composites: { event_id: string }[] = [];
  const suffixes = keys
    .map((key) => key.slice(prefix.length))
    .filter((suffix) =>
      /^(content\/(events\/[^/]+\/detail|relations\/[^/]+|time-systems\/[^/]+|collections\/[^/]+\/(detail|members\/\d+))|temporal\/events\/[^/]+\/(position|composite))\.json$/.test(
        suffix
      )
    );
  // Bound object-store concurrency while allowing complete offline inputs.
  for (let offset = 0; offset < suffixes.length; offset += 8) {
    await Promise.all(
      suffixes.slice(offset, offset + 8).map(async (suffix) => {
        if (/^content\/events\//.test(suffix)) {
          const { event } = await read<{ event: Event }>(suffix);
          if (
            event.world_id !== worldId ||
            suffix !== `content/events/${event.id}/detail.json`
          )
            throw Error("lab_snapshot_event_invalid");
          // Only fields consumed by the adapter are retained.
          events.push({
            id: event.id,
            world_id: worldId,
            title: event.title,
            slug: null,
            summary: null,
            roles: [],
            attributes: {}
          });
        } else if (/^content\/relations\//.test(suffix)) {
          const { relation } = await read<{ relation: Relation }>(suffix);
          if (
            relation.world_id !== worldId ||
            suffix !== `content/relations/${relation.id}.json`
          )
            throw Error("lab_snapshot_relation_invalid");
          relations.push({
            id: relation.id,
            world_id: worldId,
            type: relation.type,
            source_ref: relation.source_ref,
            target_ref: relation.target_ref,
            direction: relation.direction,
            attributes: {}
          });
        } else if (/^content\/time-systems\//.test(suffix)) {
          const { time_system: system } = await read<{
            time_system: PublicTimeSystem;
          }>(suffix);
          if (
            system.world_id !== worldId ||
            suffix !== `content/time-systems/${system.id}.json`
          )
            throw Error("lab_snapshot_time_system_invalid");
          systems.push(system);
        } else if (/^content\/collections\/[^/]+\/detail/.test(suffix)) {
          const { collection, member_count: memberCount } = await read<{
            collection: Collection;
            member_count: number;
          }>(suffix);
          if (
            collection.world_id !== worldId ||
            suffix !== `content/collections/${collection.id}/detail.json`
          )
            throw Error("lab_snapshot_collection_invalid");
          collections.push(collection);
          memberCounts.set(collection.id, memberCount);
        } else if (/^content\/collections\//.test(suffix)) {
          const page = await read<{
            collection_id: string;
            event_ids: string[];
            page: number;
          }>(suffix);
          if (
            suffix !==
            `content/collections/${page.collection_id}/members/${page.page}.json`
          )
            throw Error("lab_snapshot_membership_invalid");
          const ids = memberships.get(page.collection_id) ?? [];
          ids.push(...page.event_ids);
          memberships.set(page.collection_id, ids);
        } else if (suffix.endsWith("/position.json")) {
          const { position } = await read<{
            position: V5LayoutTemporalInput["positions"][number];
          }>(suffix);
          if (suffix !== `temporal/events/${position.event_id}/position.json`)
            throw Error("lab_snapshot_position_invalid");
          positions.push(position);
        } else {
          const { composite } = await read<{ composite: { event_id: string } }>(
            suffix
          );
          if (suffix !== `temporal/events/${composite.event_id}/composite.json`)
            throw Error("lab_snapshot_composite_invalid");
          composites.push({ event_id: composite.event_id });
        }
      })
    );
  }
  const eventIds = new Set(events.map((event) => event.id));
  const childIds = new Map<string, Set<string>>();
  for (const relation of relations) {
    for (const ref of [relation.source_ref, relation.target_ref])
      if (ref.kind === "event" && !eventIds.has(ref.event_id))
        throw Error("lab_snapshot_relation_endpoint_invalid");
    if (
      relation.type === "contains" &&
      relation.source_ref.kind === "event" &&
      relation.target_ref.kind === "event"
    ) {
      const ids =
        childIds.get(relation.source_ref.event_id) ?? new Set<string>();
      ids.add(relation.target_ref.event_id);
      childIds.set(relation.source_ref.event_id, ids);
    }
  }
  if (
    summary.world.id !== worldId ||
    events.length !== summary.event_count ||
    relations.length !== summary.relation_count ||
    collections.length !== summary.collection_count ||
    systems.length !== summary.time_system_count ||
    positions.length !== temporalSummary.position_count ||
    positions.length !== events.length ||
    new Set(positions.map((item) => item.event_id)).size !== events.length ||
    positions.some((item) => !eventIds.has(item.event_id)) ||
    composites.length !== temporalSummary.composite_count ||
    composites.length !== childIds.size ||
    composites.some((item) => !childIds.has(item.event_id))
  )
    throw Error("lab_snapshot_incomplete");
  for (const [id, ids] of memberships)
    if (
      !collections.some((item) => item.id === id) ||
      ids.some((eventId) => !eventIds.has(eventId)) ||
      new Set(ids).size !== ids.length
    )
      throw Error("lab_snapshot_membership_invalid");
  for (const collection of collections)
    if (
      memberCounts.get(collection.id) !==
      (memberships.get(collection.id)?.length ?? 0)
    )
      throw Error("lab_snapshot_membership_incomplete");
  const timeSystemId = selectedTimeSystemId ?? byId(systems)[0]?.id;
  if (!timeSystemId) throw Error("lab_snapshot_time_system_missing");
  const input = prepareV5LayoutInput(
    {
      world: summary.world,
      events: byId(events),
      relations: byId(relations),
      timeSystems: byId(systems),
      collections: byId(collections),
      eventCollectionMemberships: [...memberships].flatMap(
        ([collection_id, ids]) =>
          ids.map((event_id) => ({ event_id, collection_id }))
      )
    },
    {
      world_id: worldId,
      source_revision: revision,
      semantic_digest: temporalSummary.semantic_digest,
      positions: positions.sort((a, b) => a.event_id.localeCompare(b.event_id)),
      composites: composites.sort((a, b) =>
        a.event_id.localeCompare(b.event_id)
      )
    },
    timeSystemId
  );
  const payload = {
    input,
    events: events.map((event) => ({
      id: event.id,
      title: event.title,
      childIds: [...(childIds.get(event.id) ?? [])].sort(),
      collectionIds: collections
        .filter((collection) =>
          memberships.get(collection.id)?.includes(event.id)
        )
        .map((collection) => collection.id)
        .sort()
    })),
    relations: relations.flatMap((relation) =>
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
    ),
    collections: byId(collections).map((collection) => ({
      id: collection.id,
      title: collection.title,
      eventIds: [...(memberships.get(collection.id) ?? [])].sort()
    }))
  };
  return validateLabSnapshot({
    formatVersion: "layout-lab-snapshot/1",
    worldId,
    worldTitle: summary.world.title,
    sourceRevision: revision,
    servedRevision: revision,
    timeSystemId,
    sourceRootDigest: pointer.manifest_sha256,
    inputDigest: hash(snapshotDigestPayload(payload)),
    ...payload
  });
}
