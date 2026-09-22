/** Read-only rehearsal through validation -> publication -> query -> layout. */
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import {
  resolveCreateOperations,
  validateCandidateChangeSet
} from "@moirai/domain";
import type { CreateChangeSet, ChangePlan } from "@moirai/contracts";
import type { CanonicalRevisionView } from "@moirai/projections";
import { buildPublicationArtifacts } from "@moirai/publication";
import { queryFromPublicationDocuments } from "../../packages/graph-query/src/index.js";
import { projectPresentationInput } from "../../packages/graph-presentation/src/index.js";
import { layoutPresentationScope } from "../../packages/graph-presentation/src/semantic-layout.js";

const [snapshotPath, directory] = process.argv.slice(2);
if (!snapshotPath || !directory)
  throw Error("Usage: snapshot.json evidence-directory");
const original = JSON.parse(
  readFileSync(snapshotPath, "utf8")
) as CanonicalRevisionView;
const state = structuredClone(original);
const japan = "01a0c8c3-544c-756a-968c-0a5bb38452ea";
const warnings = [];
for (const index of [1, 2]) {
  const plan = JSON.parse(
    readFileSync(`${directory}/plan-0${index}.json`, "utf8")
  ) as ChangePlan;
  const input: CreateChangeSet = {
    ...plan,
    actor: "ip010-read-only-rehearsal"
  };
  const resolved = resolveCreateOperations(input, () => {
    throw Error("Explicit IDs required");
  });
  warnings.push(
    ...validateCandidateChangeSet(input, resolved.operations, state)
  );
  // Rehearsal only; real production writes use the authenticated atomic Live API.
  for (const op of plan.operations) {
    if (op.kind === "update" && op.entity_type === "event") {
      const e = state.events.find((e) => e.id === op.value.event_id)!;
      Object.assign(e, { attributes: op.value.attributes });
    } else if (op.kind === "update" && op.entity_type === "world")
      Object.assign(state.world, op.value);
    else if (
      op.kind === "remove" &&
      op.entity_type === "relation_canon_membership"
    ) {
      const r = state.relations.find((r) => r.id === op.value.relation_id)!;
      Object.assign(r, {
        canon_memberships: r.canon_memberships.filter(
          (c) => c !== op.value.canon_id
        )
      });
      Object.assign(state, {
        relationCanonMemberships: state.relationCanonMemberships.filter(
          (m) =>
            !(
              m.relation_id === op.value.relation_id &&
              m.canon_id === op.value.canon_id
            )
        )
      });
    } else if (op.kind === "withdraw" && op.entity_type === "relation") {
      Object.assign(state, {
        relations: state.relations.filter((r) => r.id !== op.value.relation_id),
        relationCanonMemberships: state.relationCanonMemberships.filter(
          (m) => m.relation_id !== op.value.relation_id
        )
      });
    } else if (op.kind === "create" && op.entity_type === "relation") {
      Object.assign(state, {
        relations: [
          ...state.relations,
          { id: op.entity_id, ...op.value, canon_memberships: [] }
        ]
      });
    } else if (
      op.kind === "add" &&
      op.entity_type === "event_canon_membership"
    ) {
      const e = state.events.find((e) => e.id === op.value.event_id)!;
      Object.assign(e, {
        canon_memberships: [...e.canon_memberships, op.value.canon_id]
      });
      Object.assign(state, {
        eventCanonMemberships: [...state.eventCanonMemberships, op.value]
      });
    } else if (
      op.kind === "add" &&
      op.entity_type === "relation_canon_membership"
    ) {
      const r = state.relations.find((r) => r.id === op.value.relation_id)!;
      Object.assign(r, {
        canon_memberships: [...r.canon_memberships, op.value.canon_id]
      });
      Object.assign(state, {
        relationCanonMemberships: [...state.relationCanonMemberships, op.value]
      });
    } else throw Error("Unexpected correction operation");
  }
}
assert.equal(state.events.length, original.events.length);
const omitMemberships = <T extends { canon_memberships: readonly string[] }>(
  e: T
) => {
  const { canon_memberships, ...rest } = e;
  void canon_memberships;
  return rest;
};
for (const before of original.events.filter(
  (e) => !e.slug?.startsWith("japan-")
)) {
  assert.deepEqual(
    omitMemberships(state.events.find((e) => e.id === before.id)!),
    omitMemberships(before)
  );
}
for (const before of original.relations.filter(
  (r) => !r.canon_memberships.includes(japan)
)) {
  assert.deepEqual(
    omitMemberships(state.relations.find((r) => r.id === before.id)!),
    omitMemberships(before)
  );
}
const publication = buildPublicationArtifacts(
  state,
  30,
  "2026-09-22T00:00:00Z"
);
const result = queryFromPublicationDocuments(
  publication.manifestBody,
  publication.documents
)!;
const input = projectPresentationInput(result);
const scope = input.scopes.find((s) => s.source.canon_id === japan)!;
const layout = layoutPresentationScope(input, scope);
assert.deepEqual(layout.unplaced, []);
const events = scope.nodes
  .filter((n) => n.reference.kind === "event")
  .map((n) => {
    const entity = layout.chartPlane.entities.find((e) => e.eventId === n.id)!;
    return {
      id: n.reference.kind === "event" ? n.reference.event_id : "",
      title: n.label,
      geometry: entity.geometryKind,
      y: entity.geometryKind === "point" ? entity.position.y : null
    };
  });
const ordered = [
  "japan-muromachi-fall",
  "japan-nagashino",
  "japan-honnoji",
  "japan-yamazaki-hideyoshi",
  "japan-osaka-castle",
  "japan-sword-hunt",
  "japan-odawara-unification",
  "imjin-busan",
  "imjin-hideyoshi",
  "japan-sekigahara",
  "japan-tokugawa-shogunate",
  "japan-osaka-siege"
];
const points = ordered.map((slug) => {
  const e = state.events.find((e) => e.slug === slug)!;
  return { slug, y: events.find((n) => n.id === e.id)!.y! };
});
for (let i = 1; i < points.length; i++)
  assert(points[i]!.y > points[i - 1]!.y, JSON.stringify(points));
writeFileSync(
  `${directory}/rehearsal.json`,
  JSON.stringify(
    {
      revision: 30,
      unchanged_existing_event_facts: true,
      unchanged_existing_relation_facts: true,
      event_count: state.events.length,
      warnings,
      unplaced: layout.unplaced,
      events,
      chronology: points
    },
    null,
    2
  ) + "\n"
);
writeFileSync("/tmp/moirai-corrected.json", JSON.stringify(state));
console.log(
  JSON.stringify({
    events: events.length,
    unplaced: layout.unplaced,
    warnings: warnings.length,
    chronology: points
  })
);
