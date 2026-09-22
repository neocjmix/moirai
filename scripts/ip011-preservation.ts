/** Offline, read-only verification. This module never opens a DB or publishes. */
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import type {
  LegacyV4RevisionView,
  PublicNarrative
} from "@moirai/contracts/legacy-v4";

type Reference = PublicNarrative["public_references"][number];
interface TargetNarrative {
  id: string;
  world_id: string;
  scope_type: "event" | "collection";
  scope_id: string;
  locale: string;
  title: string;
  body: string;
  public_references: Reference[];
  notes: {
    title: string | null;
    body: string;
    public_references: Reference[];
  }[];
}
export interface PreservationManifest {
  format: "moirai-ip011-preservation/1";
  status: string;
  world_id: string;
  source_revision: number;
  source_snapshot_sha256: string;
  owners: {
    owner_id: string;
    owner_type: "event" | "collection";
    source_owner_sha256: string;
    source_narratives: {
      record: PublicNarrative;
      sha256: string;
      disposition:
        "retain_identity" | "embed_note_and_retire" | "merge_body_and_retire";
    }[];
    target: TargetNarrative;
    target_sha256: string;
  }[];
  identity_mapping: Record<
    "events" | "canons" | "relations",
    { old_id: string; new_id: string }[]
  >;
  membership_preservation: LegacyV4RevisionView["eventCanonMemberships"];
  retired_relation_applicability: LegacyV4RevisionView["relationCanonMemberships"];
  entity_patches: {
    entity_type: "event";
    id: string;
    before_sha256: string;
    changes: { summary: string; attributes: Record<string, unknown> };
    reason: string;
  }[];
}

export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`)
      .join(",")}}`;
  }
  const result = JSON.stringify(value);
  if (result === undefined) throw new Error("unsupported preservation value");
  return result;
}
export function preservationDigest(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value)).digest("hex");
}
function requireMatch(condition: unknown, code: string): asserts condition {
  if (!condition) throw new Error(`preservation:${code}`);
}
function sameSet(actual: string[], expected: string[], code: string): void {
  requireMatch(
    new Set(actual).size === actual.length &&
      canonicalJson([...actual].sort()) === canonicalJson([...expected].sort()),
    code
  );
}

export function validatePreservation(
  snapshot: LegacyV4RevisionView,
  manifest: PreservationManifest
) {
  requireMatch(manifest.format === "moirai-ip011-preservation/1", "format");
  requireMatch(
    manifest.source_revision === 30 && manifest.world_id === snapshot.world.id,
    "scope"
  );
  requireMatch(
    preservationDigest(snapshot) === manifest.source_snapshot_sha256,
    "snapshot_drift"
  );
  const owners = new Map<
    string,
    {
      kind: "event" | "collection";
      record:
        | LegacyV4RevisionView["events"][number]
        | LegacyV4RevisionView["canons"][number];
    }
  >([
    ...snapshot.events.map(
      (e) => [e.id, { kind: "event", record: e }] as const
    ),
    ...snapshot.canons.map(
      (c) => [c.id, { kind: "collection", record: c }] as const
    )
  ]);
  sameSet(
    manifest.owners.map((o) => o.owner_id),
    [...owners.keys()],
    "owner_coverage"
  );
  const sources = new Map(snapshot.narratives.map((n) => [n.id, n]));
  sameSet(
    manifest.owners.flatMap((o) => o.source_narratives.map((n) => n.record.id)),
    [...sources.keys()],
    "source_coverage"
  );
  const targetIds = manifest.owners.map((o) => o.target.id);
  requireMatch(
    new Set(targetIds).size === targetIds.length,
    "target_identity_collision"
  );
  let created = 0;
  let retired = 0;
  let notes = 0;
  for (const entry of manifest.owners) {
    const owner = owners.get(entry.owner_id)!;
    const target = entry.target;
    requireMatch(
      entry.owner_type === owner.kind &&
        preservationDigest(owner.record) === entry.source_owner_sha256,
      "owner_drift"
    );
    requireMatch(
      target.scope_id === entry.owner_id &&
        target.scope_type === entry.owner_type &&
        target.world_id === manifest.world_id,
      "target_owner"
    );
    requireMatch(
      target.locale === "ko" &&
        target.body.trim().length > 0 &&
        target.title.trim().length > 0,
      "target_content"
    );
    requireMatch(
      !("canon_id" in target) && !("kind" in target),
      "legacy_target_scope"
    );
    requireMatch(
      /^[\da-f]{8}-[\da-f]{4}-7[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/.test(
        target.id
      ),
      "target_uuidv7"
    );
    requireMatch(
      preservationDigest(target) === entry.target_sha256,
      "target_drift"
    );
    const retained = entry.source_narratives.filter(
      (n) => n.disposition === "retain_identity"
    );
    requireMatch(
      retained.length === (entry.source_narratives.length ? 1 : 0),
      "retained_identity_count"
    );
    if (retained.length)
      requireMatch(retained[0]!.record.id === target.id, "retained_identity");
    else {
      requireMatch(!sources.has(target.id), "new_identity_collision");
      created++;
    }
    const expectedNotes = entry.source_narratives.filter(
      (n) => n.record.kind === "annotation"
    );
    requireMatch(target.notes.length === expectedNotes.length, "note_coverage");
    notes += target.notes.length;
    for (const [i, note] of target.notes.entries()) {
      requireMatch(
        note.body.trim().length > 0 &&
          canonicalJson(note.public_references) ===
            canonicalJson(expectedNotes[i]!.record.public_references),
        "note_references"
      );
    }
    const targetRefs = new Set(
      [
        ...target.public_references,
        ...target.notes.flatMap((n) => n.public_references)
      ].map(canonicalJson)
    );
    for (const source of entry.source_narratives) {
      const original = sources.get(source.record.id)!;
      requireMatch(
        preservationDigest(original) === source.sha256 &&
          preservationDigest(source.record) === source.sha256,
        "source_drift"
      );
      requireMatch(
        original.scope_id === entry.owner_id &&
          original.scope_type ===
            (entry.owner_type === "collection" ? "canon" : "event") &&
          original.locale === "ko",
        "source_owner_locale"
      );
      for (const ref of original.public_references)
        requireMatch(targetRefs.has(canonicalJson(ref)), "lost_reference");
      if (source.disposition !== "retain_identity") {
        requireMatch(
          source.disposition ===
            (original.kind === "annotation"
              ? "embed_note_and_retire"
              : "merge_body_and_retire"),
          "source_disposition"
        );
        requireMatch(
          !targetIds.includes(original.id),
          "retired_identity_reused"
        );
        retired++;
      }
    }
  }
  for (const key of ["events", "canons", "relations"] as const) {
    const mapping = manifest.identity_mapping[key];
    sameSet(
      mapping.map((m) => m.old_id),
      snapshot[key].map((e) => e.id),
      "identity_coverage"
    );
    requireMatch(
      mapping.every((m) => m.old_id === m.new_id),
      "unreviewed_rekey"
    );
  }
  requireMatch(
    canonicalJson(manifest.membership_preservation) ===
      canonicalJson(snapshot.eventCanonMemberships),
    "membership_drift"
  );
  requireMatch(
    canonicalJson(manifest.retired_relation_applicability) ===
      canonicalJson(snapshot.relationCanonMemberships),
    "relation_provenance_drift"
  );
  requireMatch(
    new Set(manifest.entity_patches.map((p) => p.id)).size ===
      manifest.entity_patches.length,
    "duplicate_patch"
  );
  for (const patch of manifest.entity_patches) {
    const event = snapshot.events.find((e) => e.id === patch.id);
    requireMatch(
      event &&
        patch.entity_type === "event" &&
        preservationDigest(event) === patch.before_sha256,
      "patch_drift"
    );
    const attributes = { ...event.attributes };
    delete attributes.curation;
    requireMatch(
      canonicalJson(attributes) === canonicalJson(patch.changes.attributes) &&
        patch.changes.summary.trim().length > 0,
      "patch_scope"
    );
  }
  return {
    source_revision: 30,
    owners: owners.size,
    source_narratives: sources.size,
    target_narratives: targetIds.length,
    created,
    retired,
    notes,
    metadata_patches: manifest.entity_patches.length
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
    console.log(JSON.stringify(validatePreservation(snapshot, manifest)));
  } catch {
    console.error(
      "IP-011 preservation validation failed; no data was written."
    );
    process.exitCode = 1;
  }
}
