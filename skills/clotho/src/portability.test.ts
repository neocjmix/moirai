import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { ZipFile } from "yazl";
import { describe, expect, it } from "vitest";
import {
  normalizeLegacyChangePlan,
  type CreateChangeSet
} from "@moirai/contracts";
import { resolveCreateOperations } from "@moirai/domain";
import {
  cloneWorldPlan,
  exportWorldPackage,
  readWorldPackage,
  portableStringify,
  temporalSemanticFingerprint,
  temporalSemanticFingerprintWithIdentityMap,
  type PortableWorld
} from "./portability.js";
const base = new URL(
  "../../../docs/implementation/fixtures/temporal-expressiveness/",
  import.meta.url
);
function corpus(): PortableWorld {
  const ops = [
    "bootstrap.change-plan.json",
    "success.change-plan.json"
  ].flatMap(
    (name) =>
      resolveCreateOperations(
        {
          ...normalizeLegacyChangePlan({
            ...JSON.parse(readFileSync(new URL(name, base), "utf8"))
          }),
          actor: "019f3b00-0000-7000-8000-000000000099"
        } as CreateChangeSet,
        () => {
          throw Error("explicit IDs");
        }
      ).operations
  );
  const rows = (type: string) =>
    ops
      .filter((o) => o.kind === "create" && o.entity_type === type)
      .map((o) => ({ id: o.entity_id, ...o.value }));
  const eventCanonMemberships = ops.flatMap((operation) =>
    operation.kind === "add" &&
    operation.entity_type === "event_canon_membership"
      ? [
          {
            event_id: String(operation.value.event_id),
            canon_id: String(operation.value.canon_id)
          }
        ]
      : []
  );
  const relationCanonMemberships = ops.flatMap((operation) =>
    operation.kind === "add" &&
    operation.entity_type === "relation_canon_membership"
      ? [
          {
            relation_id: String(operation.value.relation_id),
            canon_id: String(operation.value.canon_id)
          }
        ]
      : []
  );
  const events = ops.flatMap((operation) => {
    if (operation.kind !== "create" || operation.entity_type !== "event")
      return [];
    return [
      {
        id: operation.entity_id,
        ...operation.value,
        canon_memberships: eventCanonMemberships
          .filter((membership) => membership.event_id === operation.entity_id)
          .map((membership) => membership.canon_id)
      }
    ];
  });
  return {
    world: rows("world")[0],
    canons: rows("canon"),
    timeSystems: rows("time_system"),
    canonTimeSystems: rows("canon_time_system"),
    eventCanonMemberships,
    events,
    relationCanonMemberships,
    relations: rows("relation").map((relation) => ({
      ...relation,
      canon_memberships: relationCanonMemberships
        .filter((membership) => membership.relation_id === relation.id)
        .map((membership) => membership.canon_id)
    })),
    narratives: rows("narrative")
  } as unknown as PortableWorld;
}
async function archive(options: {
  symlink?: boolean;
  compress?: boolean;
}): Promise<Buffer> {
  const zip = new ZipFile();
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    zip.outputStream.on("data", (chunk: Buffer) => chunks.push(chunk));
    zip.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on("error", reject);
  });
  zip.addBuffer(Buffer.alloc(1024 * 1024, 65), "content/events.ndjson", {
    mode: options.symlink ? 0o120777 : 0o100644,
    compress: options.compress ?? false
  });
  zip.end();
  return done;
}
async function legacyPackage(source: PortableWorld): Promise<Buffer> {
  const ndjson = (rows: readonly unknown[]) =>
    Buffer.from(
      rows.map(portableStringify).join("\n") + (rows.length ? "\n" : "")
    );
  const legacyEvents = source.events.map((event) => {
    const value = { ...event } as Record<string, unknown>;
    delete value.world_id;
    delete value.canon_memberships;
    value.canon_id = event.canon_memberships[0];
    return value;
  });
  const legacyRelations = source.relations.map((relation) => {
    const value = { ...relation } as Record<string, unknown>;
    delete value.world_id;
    delete value.canon_memberships;
    value.canon_id = relation.canon_memberships[0];
    return value;
  });
  const files = new Map<string, Buffer>([
    ["content/world.json", Buffer.from(portableStringify(source.world))],
    ["content/canons.ndjson", ndjson(source.canons)],
    ["content/time-systems.ndjson", ndjson(source.timeSystems)],
    ["content/canon-time-systems.ndjson", ndjson(source.canonTimeSystems)],
    ["content/events.ndjson", ndjson(legacyEvents)],
    ["content/relations.ndjson", ndjson(legacyRelations)],
    ["content/narratives.ndjson", ndjson(source.narratives)],
    [
      "reports/export-report.json",
      Buffer.from(
        portableStringify({ fingerprint: temporalSemanticFingerprint(source) })
      )
    ]
  ]);
  const digest = (bytes: Buffer) =>
    `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  const manifest = {
    format: "moirai-world-package",
    format_version: "1.0",
    export_kind: "content",
    completeness: "complete",
    world_id: source.world.id,
    schema_versions: { content: "event-relational-time/1" },
    files: [...files].map(([path, bytes]) => ({
      path,
      size: bytes.length,
      sha256: digest(bytes)
    }))
  };
  files.set("manifest.json", Buffer.from(portableStringify(manifest)));
  const zip = new ZipFile();
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    zip.outputStream.on("data", (chunk: Buffer) => chunks.push(chunk));
    zip.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on("error", reject);
  });
  for (const [path, bytes] of files)
    zip.addBuffer(bytes, path, { mode: 0o100644, compress: false });
  zip.end();
  return done;
}
describe("TS-007 temporal content package", () => {
  it("exports ZIP64 and reads all lossless references without a persisted Time Event", async () => {
    const source = corpus(),
      artifact = await exportWorldPackage(source, 2);
    expect(artifact.bytes.includes(Buffer.from([0x50, 0x4b, 0x06, 0x06]))).toBe(
      true
    );
    const imported = await readWorldPackage(artifact.bytes);
    expect(temporalSemanticFingerprint(imported.view)).toEqual(
      temporalSemanticFingerprint(source)
    );
    expect(imported.view.events).toHaveLength(11);
    expect(imported.view.relations).toHaveLength(23);
    expect(JSON.stringify(imported.view)).toContain(
      "2026-09-05T08:13:21.123456789013Z"
    );
    expect(
      imported.view.events.some((event) => event.id.startsWith("time-event://"))
    ).toBe(false);
    const expected = JSON.parse(
      readFileSync(new URL("expected/roundtrip-fingerprint.json", base), "utf8")
    );
    expect(artifact.fingerprint.category_digests).toEqual(
      expected.category_digests
    );
    expect(artifact.fingerprint.digest).toBe(expected.expected_digest);
  });
  it("clones all persistent identities into one empty-World Change Plan", async () => {
    const artifact = await exportWorldPackage(corpus(), 2);
    const { view } = await readWorldPackage(artifact.bytes);
    let sequence = 0x500;
    const preview = cloneWorldPlan(
      view,
      "019f3b00-0000-7000-8000-000000000401",
      () =>
        `019f3b00-0000-7000-8000-${(sequence++).toString(16).padStart(12, "0")}`
    );
    expect(preview.plan.expected_revision).toBe(0);
    expect(
      preview.plan.operations.filter((o) => o.entity_type === "event")
    ).toHaveLength(11);
    expect(Object.keys(preview.id_mapping)).toHaveLength(38);
    expect(Object.values(preview.id_mapping)).not.toContain(view.world.id);
    expect(JSON.stringify(preview.plan)).toContain(
      "0220-01-01T00:00:00.000000000000Z"
    );
    const clonedRows = (entityType: string) =>
      preview.plan.operations.flatMap((operation) =>
        operation.kind === "create" && operation.entity_type === entityType
          ? [
              {
                id: operation.entity_id,
                ...(operation.value as Record<string, unknown>)
              }
            ]
          : []
      );
    const clonedMemberships = preview.plan.operations.flatMap((operation) =>
      operation.kind === "add" &&
      operation.entity_type === "event_canon_membership"
        ? [
            {
              event_id: String(operation.value.event_id),
              canon_id: String(operation.value.canon_id)
            }
          ]
        : []
    );
    const clonedRelationMemberships = preview.plan.operations.flatMap(
      (operation) =>
        operation.kind === "add" &&
        operation.entity_type === "relation_canon_membership"
          ? [
              {
                relation_id: String(operation.value.relation_id),
                canon_id: String(operation.value.canon_id)
              }
            ]
          : []
    );
    const clonedEvents = clonedRows("event").map((event) => {
      return {
        ...event,
        canon_memberships: clonedMemberships
          .filter((membership) => membership.event_id === event.id)
          .map((membership) => membership.canon_id)
      };
    });
    const clone = {
      world: clonedRows("world")[0],
      canons: clonedRows("canon"),
      timeSystems: clonedRows("time_system"),
      canonTimeSystems: clonedRows("canon_time_system"),
      eventCanonMemberships: clonedMemberships,
      relationCanonMemberships: clonedRelationMemberships,
      events: clonedEvents,
      relations: clonedRows("relation").map((relation) => ({
        ...relation,
        canon_memberships: clonedRelationMemberships
          .filter((membership) => membership.relation_id === relation.id)
          .map((membership) => membership.canon_id)
      })),
      narratives: clonedRows("narrative")
    } as unknown as PortableWorld;
    const targetToSource = Object.fromEntries(
      Object.entries(preview.id_mapping).map(([source, target]) => [
        target,
        source
      ])
    );
    expect(
      temporalSemanticFingerprintWithIdentityMap(clone, targetToSource)
    ).toEqual(temporalSemanticFingerprint(view));
  });
  it("losslessly adapts a v1 Event canon_id into one explicit membership", async () => {
    const source = corpus();
    const imported = await readWorldPackage(await legacyPackage(source));
    expect(imported.manifest.format_version).toBe("1.0");
    expect(imported.view.events[0]).toMatchObject({
      world_id: source.world.id,
      canon_memberships: [source.canons[0]!.id]
    });
    expect(imported.view.eventCanonMemberships).toHaveLength(
      source.events.length
    );
    expect(temporalSemanticFingerprint(imported.view)).toEqual(
      temporalSemanticFingerprint(source)
    );
  });
  it("rejects symlinks and excessive compression before constructing a Change Plan", async () => {
    await expect(
      readWorldPackage(await archive({ symlink: true }))
    ).rejects.toThrow("package_unsafe_entry");
    await expect(
      readWorldPackage(await archive({ compress: true }))
    ).rejects.toThrow("package_size_limit");
  });
  it("rejects content tampering against the manifest digest", async () => {
    const artifact = await exportWorldPackage(corpus(), 2);
    const damaged = Buffer.from(artifact.bytes);
    const position = damaged.indexOf(
      Buffer.from("2026-09-05T08:13:21.123456789013Z")
    );
    expect(position).toBeGreaterThan(0);
    damaged[position + 27] = 0x34;
    await expect(readWorldPackage(damaged)).rejects.toThrow(
      "package_digest_mismatch"
    );
  });
});
