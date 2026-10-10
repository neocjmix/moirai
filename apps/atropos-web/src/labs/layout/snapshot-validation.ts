import { z } from "zod";
import type { LabSnapshot } from "./types";

const id = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]*$/)
  .refine(
    (value) => !["__proto__", "prototype", "constructor"].includes(value)
  );
const title = z.string().max(16_384);
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const revision = z.number().int().min(1).max(Number.MAX_SAFE_INTEGER);
const ids = z.array(id).max(100_000);
const finite = z.number().finite();
const schema = z
  .object({
    formatVersion: z.literal("layout-lab-snapshot/1"),
    worldId: id,
    worldTitle: title,
    sourceRevision: revision,
    servedRevision: revision,
    timeSystemId: id,
    sourceRootDigest: digest,
    inputDigest: digest,
    input: z
      .object({
        formatVersion: z.literal("layout-input/1"),
        worldId: id,
        revision,
        timeSystemId: id,
        temporalDigest: digest,
        dataset: z
          .object({
            events: z
              .array(
                z
                  .object({
                    id,
                    canonId: id,
                    title,
                    type: z.enum(["instant", "composite"])
                  })
                  .strict()
              )
              .max(100_000),
            // The v1 World adapter deliberately has no Collection-specific layout,
            // fallback anchors, editorial controls or structural legacy link path.
            canons: z.array(z.never()).max(0),
            timeSystems: z.array(z.never()).max(0),
            structuralLinks: z.array(z.never()).max(0),
            semanticLinks: z
              .array(
                z
                  .object({
                    id,
                    type: z.enum(["contains", "causes"]),
                    fromId: id,
                    toId: id
                  })
                  .strict()
              )
              .max(500_000)
          })
          .strict(),
        board: z
          .object({
            axis: z
              .object({
                startYear: finite,
                endYear: finite,
                compatibilityKey: z.string().min(1).max(256),
                timeSystemId: id
              })
              .strict()
          })
          .strict(),
        explicitExtents: z
          .array(
            z.object({ eventId: id, minYear: finite, maxYear: finite }).strict()
          )
          .max(100_000),
        temporalConstraints: z
          .array(
            z
              .object({
                beforeId: id,
                afterId: id,
                source: id,
                minGapYears: finite.nonnegative()
              })
              .strict()
          )
          .max(500_000),
        visibleEventIds: ids,
        incidence: z
          .object({
            formatVersion: z.literal("collection-incidence/1"),
            events: z
              .array(
                z.object({ id, childIds: ids, collectionIds: ids }).strict()
              )
              .max(100_000),
            collections: z
              .array(z.object({ id, eventIds: ids }).strict())
              .max(100_000),
            relations: z
              .array(
                z
                  .object({
                    id,
                    sourceId: id,
                    targetId: id,
                    type: z.string().min(1).max(64)
                  })
                  .strict()
              )
              .max(500_000)
          })
          .strict()
          .optional()
      })
      .strict(),
    events: z
      .array(
        z.object({ id, title, childIds: ids, collectionIds: ids }).strict()
      )
      .max(100_000),
    collections: z
      .array(z.object({ id, title, eventIds: ids }).strict())
      .max(100_000),
    relations: z
      .array(
        z
          .object({
            id,
            sourceId: id,
            targetId: id,
            type: z.string().min(1).max(64)
          })
          .strict()
      )
      .max(500_000)
  })
  .strict();

function requireInvariant(condition: boolean): asserts condition {
  if (!condition) throw Error("lab_snapshot_semantics_invalid");
}
function unique(values: readonly string[]): Set<string> {
  const result = new Set(values);
  requireInvariant(result.size === values.length);
  return result;
}
function same(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return (
    left.size === right.size && [...left].every((value) => right.has(value))
  );
}
const pair = (left: string, right: string) => JSON.stringify([left, right]);

/** Structural/schema validation for imported public research inputs. It does
 * not claim imported provenance is authentic. The caller separately verifies
 * SHA-256 over snapshotDigestPayload before freezing and using this object. */
export function validateLabSnapshot(value: unknown): LabSnapshot {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw Error("lab_snapshot_schema_invalid");
  const snapshot = parsed.data;
  const { input } = snapshot;
  if (input.incidence) {
    const meta = input.incidence;
    const sorted = <T extends { id: string }>(values: readonly T[]) =>
      [...values].sort((a, b) => a.id.localeCompare(b.id));
    const eventData = (values: typeof meta.events) =>
      sorted(values).map(({ id, childIds, collectionIds }) => ({
        id,
        childIds: [...childIds].sort(),
        collectionIds: [...collectionIds].sort()
      }));
    const collectionData = (values: typeof meta.collections) =>
      sorted(values).map(({ id, eventIds }) => ({
        id,
        eventIds: [...eventIds].sort()
      }));
    const relationData = (values: typeof meta.relations) =>
      sorted(values).map(({ id, type, sourceId, targetId }) => ({
        id,
        type,
        sourceId,
        targetId
      }));
    requireInvariant(
      JSON.stringify(eventData(meta.events)) ===
        JSON.stringify(eventData(snapshot.events))
    );
    requireInvariant(
      JSON.stringify(collectionData(meta.collections)) ===
        JSON.stringify(collectionData(snapshot.collections))
    );
    requireInvariant(
      JSON.stringify(relationData(meta.relations)) ===
        JSON.stringify(relationData(snapshot.relations))
    );
  }
  requireInvariant(
    snapshot.worldId === input.worldId &&
      snapshot.sourceRevision === input.revision &&
      snapshot.servedRevision === snapshot.sourceRevision &&
      snapshot.timeSystemId === input.timeSystemId &&
      input.board.axis.timeSystemId === snapshot.timeSystemId &&
      input.board.axis.startYear <= input.board.axis.endYear
  );
  requireInvariant(
    snapshot.events.reduce(
      (count, event) =>
        count + event.childIds.length + event.collectionIds.length,
      0
    ) +
      snapshot.collections.reduce(
        (count, collection) => count + collection.eventIds.length,
        0
      ) <=
      500_000
  );
  const eventIds = unique(snapshot.events.map((event) => event.id));
  const collectionIds = unique(
    snapshot.collections.map((collection) => collection.id)
  );
  const metadata = new Map(snapshot.events.map((event) => [event.id, event]));
  requireInvariant(
    same(eventIds, unique(input.dataset.events.map((event) => event.id)))
  );
  unique(snapshot.relations.map((relation) => relation.id));
  unique(input.dataset.semanticLinks.map((link) => link.id));
  unique(input.temporalConstraints.map((constraint) => constraint.source));
  const children = new Map<string, Set<string>>();
  const parents = new Map<string, Set<string>>();
  const causes = new Map<string, string>();
  const temporal = new Map<
    string,
    { beforeId: string; afterId: string; minGapYears: number }
  >();
  for (const relation of snapshot.relations) {
    requireInvariant(
      eventIds.has(relation.sourceId) && eventIds.has(relation.targetId)
    );
    if (relation.type === "contains") {
      requireInvariant(relation.sourceId !== relation.targetId);
      const members = children.get(relation.sourceId) ?? new Set<string>();
      members.add(relation.targetId);
      children.set(relation.sourceId, members);
      const ancestors = parents.get(relation.targetId) ?? new Set<string>();
      ancestors.add(relation.sourceId);
      parents.set(relation.targetId, ancestors);
    } else if (relation.type === "causes") {
      causes.set(relation.id, pair(relation.sourceId, relation.targetId));
    }
    if (["precedes", "not_after", "coincides"].includes(relation.type))
      temporal.set(relation.id, {
        beforeId: relation.sourceId,
        afterId: relation.targetId,
        minGapYears: relation.type === "precedes" ? 0.001 : 0
      });
  }
  const expectedLinks = new Map<string, string>();
  for (const [parent, members] of children)
    for (const child of members)
      expectedLinks.set(
        `contains:${parent}:${child}`,
        `contains:${pair(parent, child)}`
      );
  for (const [relationId, endpoints] of causes) {
    requireInvariant(!expectedLinks.has(relationId));
    expectedLinks.set(relationId, `causes:${endpoints}`);
  }
  requireInvariant(expectedLinks.size === input.dataset.semanticLinks.length);
  for (const link of input.dataset.semanticLinks)
    requireInvariant(
      expectedLinks.get(link.id) ===
        `${link.type}:${pair(link.fromId, link.toId)}`
    );
  requireInvariant(temporal.size === input.temporalConstraints.length);
  for (const constraint of input.temporalConstraints) {
    const expected = temporal.get(constraint.source);
    requireInvariant(
      expected?.beforeId === constraint.beforeId &&
        expected.afterId === constraint.afterId &&
        expected.minGapYears === constraint.minGapYears
    );
  }
  for (const event of input.dataset.events) {
    const meta = metadata.get(event.id)!;
    requireInvariant(
      event.canonId === snapshot.worldId &&
        event.title === meta.title &&
        event.type === (children.has(event.id) ? "composite" : "instant")
    );
    requireInvariant(
      same(unique(meta.childIds), children.get(event.id) ?? new Set())
    );
    for (const collectionId of unique(meta.collectionIds))
      requireInvariant(collectionIds.has(collectionId));
  }
  const selectedBy = new Map<string, Set<string>>();
  for (const collection of snapshot.collections)
    for (const eventId of unique(collection.eventIds)) {
      requireInvariant(eventIds.has(eventId));
      const selections = selectedBy.get(eventId) ?? new Set<string>();
      selections.add(collection.id);
      selectedBy.set(eventId, selections);
    }
  for (const event of snapshot.events)
    requireInvariant(
      same(new Set(event.collectionIds), selectedBy.get(event.id) ?? new Set())
    );
  // Kahn traversal rejects cycles without recursive stack growth. Authored
  // overlap (several parents) remains valid and retains shared Event identity.
  const degree = new Map(
    [...eventIds].map((eventId) => [eventId, parents.get(eventId)?.size ?? 0])
  );
  const queue = [...eventIds].filter((eventId) => degree.get(eventId) === 0);
  for (let index = 0; index < queue.length; index++)
    for (const child of children.get(queue[index]!) ?? []) {
      const next = degree.get(child)! - 1;
      degree.set(child, next);
      if (next === 0) queue.push(child);
    }
  requireInvariant(queue.length === eventIds.size);
  const visible = unique(input.explicitExtents.map((extent) => extent.eventId));
  for (const extent of input.explicitExtents)
    requireInvariant(
      eventIds.has(extent.eventId) && extent.minYear <= extent.maxYear
    );
  const visibleQueue = [...visible];
  for (let index = 0; index < visibleQueue.length; index++)
    for (const parent of parents.get(visibleQueue[index]!) ?? [])
      if (!visible.has(parent)) {
        visible.add(parent);
        visibleQueue.push(parent);
      }
  requireInvariant(same(visible, unique(input.visibleEventIds)));
  // Preserve original JSON key/array ordering: changing it here would alter
  // the bytes the export signed and the caller is about to digest.
  return value as LabSnapshot;
}
