import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { LegacyV4RevisionView } from "@moirai/contracts/legacy-v4";
import {
  preservationDigest,
  validatePreservation,
  type PreservationManifest
} from "./ip011-preservation.js";

function fixture() {
  const world = { id: "world" };
  const event = { id: "event", attributes: {} };
  const narrative = {
    id: "019f5000-1100-7000-8000-000000000001",
    canon_id: "canon",
    scope_id: "event",
    scope_type: "event",
    locale: "ko",
    kind: "primary",
    title: "Event",
    body: "Historical account",
    public_references: [{ url: "https://example.org/source", label: "Source" }]
  };
  const snapshot = {
    world,
    events: [event],
    canons: [],
    relations: [],
    narratives: [narrative],
    eventCanonMemberships: [],
    relationCanonMemberships: []
  } as unknown as LegacyV4RevisionView;
  const target = {
    id: narrative.id,
    world_id: world.id,
    scope_type: "event" as const,
    scope_id: event.id,
    locale: "ko",
    title: "Event",
    body: narrative.body,
    public_references: narrative.public_references,
    notes: []
  };
  const manifest: PreservationManifest = {
    format: "moirai-ip011-preservation/1",
    status: "test",
    world_id: world.id,
    source_revision: 30,
    source_snapshot_sha256: preservationDigest(snapshot),
    owners: [
      {
        owner_id: event.id,
        owner_type: "event",
        source_owner_sha256: preservationDigest(event),
        source_narratives: [
          {
            record: narrative as never,
            sha256: preservationDigest(narrative),
            disposition: "retain_identity"
          }
        ],
        target,
        target_sha256: preservationDigest(target)
      }
    ],
    identity_mapping: {
      events: [{ old_id: event.id, new_id: event.id }],
      canons: [],
      relations: []
    },
    membership_preservation: [],
    retired_relation_applicability: [],
    entity_patches: []
  };
  return { snapshot, manifest };
}

describe("IP-011 preservation gates", () => {
  it("rejects a changed source even when the World and revision identifiers match", () => {
    const { snapshot, manifest } = fixture();
    expect(validatePreservation(snapshot, manifest).target_narratives).toBe(1);
    const changed = structuredClone(snapshot);
    Object.assign(changed.narratives[0]!, { body: "Concurrent edit" });
    expect(() => validatePreservation(changed, manifest)).toThrow(
      "snapshot_drift"
    );
  });
  it("rejects dropped citations and missing owners", () => {
    const { snapshot, manifest } = fixture();
    manifest.owners[0]!.target.public_references = [];
    manifest.owners[0]!.target_sha256 = preservationDigest(
      manifest.owners[0]!.target
    );
    expect(() => validatePreservation(snapshot, manifest)).toThrow(
      "lost_reference"
    );
    manifest.owners = [];
    expect(() => validatePreservation(snapshot, manifest)).toThrow(
      "owner_coverage"
    );
  });
  it("rejects owner reassignment and unreviewed Event rekeying", () => {
    const { snapshot, manifest } = fixture();
    manifest.owners[0]!.target.scope_id = "another-event";
    expect(() => validatePreservation(snapshot, manifest)).toThrow(
      "target_owner"
    );
    manifest.owners[0]!.target.scope_id = "event";
    manifest.identity_mapping.events[0]!.new_id = "new-event";
    expect(() => validatePreservation(snapshot, manifest)).toThrow(
      "unreviewed_rekey"
    );
  });
  it("pins every committed editorial source and target and preserves all citation records", () => {
    const manifest = JSON.parse(
      readFileSync(
        new URL(
          "../data/migrations/ip011/world-r30-preservation.json",
          import.meta.url
        ),
        "utf8"
      )
    ) as PreservationManifest;
    expect(manifest.owners).toHaveLength(133);
    expect(manifest.owners.flatMap((e) => e.source_narratives)).toHaveLength(
      160
    );
    expect(
      manifest.owners.filter((e) => e.source_narratives.length === 0)
    ).toHaveLength(14);
    expect(
      manifest.owners
        .flatMap((e) => e.source_narratives)
        .filter((n) => n.disposition !== "retain_identity")
    ).toHaveLength(41);
    expect(manifest.owners.flatMap((e) => e.target.notes)).toHaveLength(22);
    const targets = manifest.owners.map((e) => e.target.id);
    expect(new Set(targets).size).toBe(133);
    for (const entry of manifest.owners) {
      expect(preservationDigest(entry.target)).toBe(entry.target_sha256);
      const refs = new Set(
        [
          ...entry.target.public_references,
          ...entry.target.notes.flatMap((n) => n.public_references)
        ].map(preservationDigest)
      );
      for (const source of entry.source_narratives) {
        expect(preservationDigest(source.record)).toBe(source.sha256);
        for (const ref of source.record.public_references)
          expect(refs.has(preservationDigest(ref))).toBe(true);
        if (source.disposition !== "retain_identity")
          expect(targets).not.toContain(source.record.id);
      }
    }
  });
});
