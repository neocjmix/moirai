/** Offline canonical transformation; no schema, history or live publication writes. */
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type { CanonicalEventReference } from "@moirai/contracts";
import type { LegacyV4RevisionView } from "@moirai/contracts/legacy-v4";
import type { CanonicalState } from "@moirai/contracts/v5";
import {
  assertV5CanonicalState,
  compositeChildCounts
} from "../packages/domain/src/v5.js";
import {
  preservationDigest,
  validatePreservation,
  type PreservationManifest
} from "./ip011-preservation.js";

function canonicalReference(
  ref: CanonicalEventReference
): CanonicalEventReference {
  return ref.kind === "event"
    ? { kind: "event", event_id: ref.event_id }
    : {
        kind: "time_event",
        time_system_ref: { time_system_id: ref.time_system_ref.time_system_id },
        definition_version: ref.definition_version,
        coordinate: ref.coordinate
      };
}
export function rehearseV5Snapshot(
  snapshot: LegacyV4RevisionView,
  manifest: PreservationManifest
) {
  const before = preservationDigest(snapshot);
  const preservation = validatePreservation(snapshot, manifest);
  const patches = new Map(
    manifest.entity_patches.map((p) => [p.id, p.changes])
  );
  const state: CanonicalState = {
    world: {
      ...snapshot.world,
      title: "실제 세계사",
      description:
        "하나의 실제 역사 세계. 현재 관측된 자료는 1380~1615년의 조선과 일본을 중심으로 하며, 이 범위가 World의 지리·시대 경계는 아니다."
    },
    collections: snapshot.canons.map((c) => ({
      ...c,
      description:
        c.slug === "hunminjeongeum-record-and-interpretation"
          ? "문자 창제와 해설서 완성 기록을 구분하고 날짜와 반포 해석을 살펴본다."
          : c.slug === "danjong-deposition-and-downfall"
            ? "1452년 단종 즉위부터 계유정난, 세조 즉위, 복위 시도, 영월 유배와 죽음까지 권력 이동과 후속 탄압을 함께 읽는다."
            : c.description
    })),
    timeSystems: snapshot.timeSystems,
    collectionTimeSystems: snapshot.canonTimeSystems.map((link) => ({
      id: link.id,
      collection_id: link.canon_id,
      time_system_id: link.time_system_id
    })),
    events: snapshot.events.map((e) => ({
      id: e.id,
      world_id: e.world_id,
      slug: e.slug,
      title: e.title,
      summary: patches.get(e.id)?.summary ?? e.summary,
      roles: e.roles,
      attributes: patches.get(e.id)?.attributes ?? e.attributes
    })),
    eventCollectionMemberships: snapshot.eventCanonMemberships.map((m) => ({
      event_id: m.event_id,
      collection_id: m.canon_id
    })),
    relations: snapshot.relations.map((r) => ({
      id: r.id,
      world_id: r.world_id,
      type: r.type,
      source_ref: canonicalReference(r.source_ref),
      target_ref: canonicalReference(r.target_ref),
      direction: r.direction,
      attributes: r.attributes
    })),
    narratives: manifest.owners.map((owner) => owner.target)
  };
  assertV5CanonicalState(state);
  const children = compositeChildCounts(state.relations);
  if (
    snapshot.events.some(
      (event) => (event.kind === "composite") !== children.has(event.id)
    )
  )
    throw new Error("migration_composite_mismatch");
  if (preservationDigest(snapshot) !== before)
    throw new Error("migration_source_mutation");
  return {
    state,
    report: {
      ...preservation,
      world_invariants: "passed",
      source_unchanged: true,
      events: state.events.length,
      collections: state.collections.length,
      relations: state.relations.length,
      memberships: state.eventCollectionMemberships.length,
      derived_composites: children.size,
      target_state_sha256: preservationDigest(state)
    }
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const [snapshotPath, manifestPath] = process.argv.slice(2);
    if (!snapshotPath || !manifestPath) throw new Error("paths required");
    const snapshot = JSON.parse(
      await readFile(snapshotPath, "utf8")
    ) as LegacyV4RevisionView;
    const manifest = JSON.parse(
      await readFile(manifestPath, "utf8")
    ) as PreservationManifest;
    console.log(JSON.stringify(rehearseV5Snapshot(snapshot, manifest).report));
  } catch {
    console.error("IP-011 v5 snapshot rehearsal failed; no data was written.");
    process.exitCode = 1;
  }
}
