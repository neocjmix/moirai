import { createHash, randomBytes } from "node:crypto";
import { ZipFile } from "yazl";
import { fromBuffer, type Entry } from "yauzl";
import type {
  ChangeOperation,
  CreateChangeSet,
  CanonicalEventReference,
  PublicWorld,
  PublicCanon,
  PublicTimeSystem,
  PublicCanonTimeSystem,
  CanonicalEventCanonMembership,
  CanonicalRelationCanonMembership,
  PublicEvent,
  PublicRelation,
  PublicNarrative
} from "@moirai/contracts";
import { CONTRACT_VERSION } from "@moirai/contracts";
import {
  canonicalRelationEndpoints,
  endpointKey,
  resolveCreateOperations,
  validateCandidateChangeSet
} from "@moirai/domain";

export interface PortableWorld {
  readonly world: PublicWorld;
  readonly canons: readonly PublicCanon[];
  readonly timeSystems: readonly PublicTimeSystem[];
  readonly canonTimeSystems: readonly PublicCanonTimeSystem[];
  readonly eventCanonMemberships: readonly CanonicalEventCanonMembership[];
  readonly relationCanonMemberships: readonly CanonicalRelationCanonMembership[];
  readonly events: readonly PublicEvent[];
  readonly relations: readonly PublicRelation[];
  readonly narratives: readonly PublicNarrative[];
}
const LIMIT = 10 * 1024 * 1024;
const uuid =
  /^[a-f0-9]{8}-[a-f0-9]{4}-7[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const sectionNames = {
  canons: "canons",
  timeSystems: "time-systems",
  canonTimeSystems: "canon-time-systems",
  eventCanonMemberships: "event-canon-memberships",
  relationCanonMemberships: "relation-canon-memberships",
  events: "events",
  relations: "relations",
  narratives: "narratives"
} as const;
const fail = (code: string): never => {
  throw new Error(code);
};
const hash = (value: string | Buffer) =>
  "sha256:" + createHash("sha256").update(value).digest("hex");
function compareKeys(a: string, b: string): number {
  const left = [...a],
    right = [...b];
  for (let i = 0; i < Math.min(left.length, right.length); i++) {
    const d = left[i]!.codePointAt(0)! - right[i]!.codePointAt(0)!;
    if (d) return d;
  }
  return left.length - right.length;
}
export function portableStringify(value: unknown): string {
  if (Array.isArray(value))
    return "[" + value.map(portableStringify).join(",") + "]";
  if (value && typeof value === "object")
    return (
      "{" +
      Object.keys(value)
        .sort(compareKeys)
        .map(
          (key) =>
            JSON.stringify(key) +
            ":" +
            portableStringify((value as Record<string, unknown>)[key])
        )
        .join(",") +
      "}"
    );
  return JSON.stringify(value);
}
const sorted = <T extends { id: string }>(rows: readonly T[]) =>
  [...rows].sort((a, b) => compareKeys(a.id, b.id));
const sortedMemberships = (
  rows: readonly CanonicalEventCanonMembership[]
): CanonicalEventCanonMembership[] =>
  [...rows].sort((left, right) =>
    compareKeys(
      `${left.event_id}:${left.canon_id}`,
      `${right.event_id}:${right.canon_id}`
    )
  );
const sortedRelationMemberships = (
  rows: readonly CanonicalRelationCanonMembership[]
): CanonicalRelationCanonMembership[] =>
  [...rows].sort((left, right) =>
    compareKeys(
      `${left.relation_id}:${left.canon_id}`,
      `${right.relation_id}:${right.canon_id}`
    )
  );
const cleanRef = (ref: CanonicalEventReference): CanonicalEventReference =>
  ref.kind === "event"
    ? { kind: "event", event_id: ref.event_id }
    : {
        kind: "time_event",
        time_system_ref: { time_system_id: ref.time_system_ref.time_system_id },
        definition_version: ref.definition_version,
        coordinate: ref.coordinate
      };
function validatePortableWorld(view: PortableWorld): void {
  const canonIds = new Set(view.canons.map((canon) => canon.id));
  const eventIds = new Set(view.events.map((event) => event.id));
  const timeSystemIds = new Set(view.timeSystems.map((system) => system.id));
  if (
    view.canons.some((canon) => canon.world_id !== view.world.id) ||
    view.events.some((event) => event.world_id !== view.world.id) ||
    view.relations.some((relation) => relation.world_id !== view.world.id) ||
    view.timeSystems.some((system) => system.world_id !== view.world.id)
  )
    fail("package_cross_world_reference");
  const membershipKeys = view.eventCanonMemberships.map(
    (membership) => `${membership.event_id}:${membership.canon_id}`
  );
  if (new Set(membershipKeys).size !== membershipKeys.length)
    fail("package_duplicate_membership");
  if (
    view.eventCanonMemberships.some(
      (membership) =>
        !eventIds.has(membership.event_id) || !canonIds.has(membership.canon_id)
    )
  )
    fail("package_dangling_reference");
  const membershipsByEvent = new Map<string, string[]>();
  for (const membership of view.eventCanonMemberships) {
    const memberships = membershipsByEvent.get(membership.event_id) ?? [];
    memberships.push(membership.canon_id);
    membershipsByEvent.set(membership.event_id, memberships);
  }
  for (const event of view.events) {
    const canonical = [...(membershipsByEvent.get(event.id) ?? [])].sort(
      compareKeys
    );
    const embedded = [...event.canon_memberships].sort(compareKeys);
    if (!canonical.length) fail("package_orphan_event");
    if (portableStringify(canonical) !== portableStringify(embedded))
      fail("package_membership_mismatch");
  }
  const relationIds = new Set(view.relations.map((relation) => relation.id));
  const relationMembershipKeys = view.relationCanonMemberships.map(
    (membership) => `${membership.relation_id}:${membership.canon_id}`
  );
  if (new Set(relationMembershipKeys).size !== relationMembershipKeys.length)
    fail("package_duplicate_membership");
  if (
    view.relationCanonMemberships.some(
      (membership) =>
        !relationIds.has(membership.relation_id) ||
        !canonIds.has(membership.canon_id)
    )
  )
    fail("package_dangling_reference");
  const membershipsByRelation = new Map<string, string[]>();
  for (const membership of view.relationCanonMemberships) {
    const memberships = membershipsByRelation.get(membership.relation_id) ?? [];
    memberships.push(membership.canon_id);
    membershipsByRelation.set(membership.relation_id, memberships);
  }
  if (
    view.canonTimeSystems.some(
      (link) =>
        !canonIds.has(link.canon_id) || !timeSystemIds.has(link.time_system_id)
    )
  )
    fail("package_dangling_reference");
  for (const relation of view.relations) {
    const relationMemberships = [
      ...(membershipsByRelation.get(relation.id) ?? [])
    ].sort(compareKeys);
    if (!relationMemberships.length) fail("package_orphan_relation");
    if (
      portableStringify(relationMemberships) !==
      portableStringify([...relation.canon_memberships].sort(compareKeys))
    )
      fail("package_membership_mismatch");
    const endpoints = canonicalRelationEndpoints(relation);
    if (!endpoints) fail("package_relation_reference_invalid");
    for (const canonId of relationMemberships) {
      for (const endpoint of [endpoints.source, endpoints.target]) {
        if (endpoint.kind === "event") {
          if (
            !eventIds.has(endpoint.event_id) ||
            !membershipsByEvent.get(endpoint.event_id)?.includes(canonId)
          )
            fail("package_relation_scope_invalid");
        } else if (
          !timeSystemIds.has(endpoint.time_system_ref.time_system_id) ||
          !view.canonTimeSystems.some(
            (link) =>
              link.canon_id === canonId &&
              link.time_system_id === endpoint.time_system_ref.time_system_id
          )
        ) {
          fail("package_relation_scope_invalid");
        }
      }
    }
  }
  for (const narrative of view.narratives) {
    if (!canonIds.has(narrative.canon_id)) fail("package_dangling_reference");
    if (
      narrative.scope_type === "canon"
        ? narrative.scope_id !== narrative.canon_id
        : !eventIds.has(narrative.scope_id) ||
          !membershipsByEvent
            .get(narrative.scope_id)
            ?.includes(narrative.canon_id)
    )
      fail("package_narrative_scope_invalid");
  }
}
export function canonicalPortableRelations(
  rows: readonly PublicRelation[]
): PublicRelation[] {
  return sorted(rows).map((row) => {
    const refs = canonicalRelationEndpoints(row);
    if (!refs) return fail("package_relation_reference_invalid");
    let source = cleanRef(refs.source),
      target = cleanRef(refs.target);
    if (row.type === "coincides" && endpointKey(source) > endpointKey(target))
      [source, target] = [target, source];
    return {
      id: row.id,
      world_id: row.world_id,
      canon_memberships: [...row.canon_memberships].sort(compareKeys),
      type: row.type,
      source_ref: source,
      target_ref: target,
      direction: row.direction,
      attributes: row.attributes
    };
  });
}
export function temporalSemanticFingerprint(view: PortableWorld) {
  return temporalSemanticFingerprintWithIdentityMap(view, {});
}
export function temporalSemanticFingerprintWithIdentityMap(
  view: PortableWorld,
  identityMap: Readonly<Record<string, string>>
) {
  const remap = <T>(value: T): T => {
    if (typeof value === "string") return (identityMap[value] ?? value) as T;
    if (Array.isArray(value)) return value.map(remap) as T;
    if (value && typeof value === "object")
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, remap(item)])
      ) as T;
    return value;
  };
  const sections = {
    time_systems: sorted(remap(view.timeSystems)),
    events: sorted(remap(view.events)),
    event_canon_memberships: sortedMemberships(
      remap(view.eventCanonMemberships)
    ),
    relation_canon_memberships: sortedRelationMemberships(
      remap(view.relationCanonMemberships)
    ),
    relations: canonicalPortableRelations(remap(view.relations))
  };
  return {
    algorithm: "temporal-semantic-fingerprint-v1",
    category_digests: Object.fromEntries(
      Object.entries(sections).map(([name, rows]) => [
        name,
        hash(portableStringify(rows))
      ])
    ),
    digest: hash(portableStringify(sections))
  };
}

function legacyRelationSemanticFingerprint(decoded: Record<string, unknown>) {
  const relations = sorted(
    decoded.relations as Array<
      Omit<PublicRelation, "world_id" | "canon_memberships"> & {
        canon_id: string;
      }
    >
  ).map((row) => {
    const refs = canonicalRelationEndpoints(row);
    if (!refs) return fail("package_relation_reference_invalid");
    let source = cleanRef(refs.source);
    let target = cleanRef(refs.target);
    if (row.type === "coincides" && endpointKey(source) > endpointKey(target))
      [source, target] = [target, source];
    return {
      id: row.id,
      canon_id: row.canon_id,
      type: row.type,
      source_ref: source,
      target_ref: target,
      direction: row.direction,
      attributes: row.attributes
    };
  });
  const sections = {
    time_systems: sorted(decoded.timeSystems as PublicTimeSystem[]),
    events: sorted(decoded.events as PublicEvent[]),
    event_canon_memberships: sortedMemberships(
      decoded.eventCanonMemberships as CanonicalEventCanonMembership[]
    ),
    relations
  };
  return hash(portableStringify(sections));
}
export function operationUuid(): string {
  const bytes = randomBytes(16);
  bytes.writeUIntBE(Date.now(), 0, 6);
  bytes[6] = (bytes[6]! & 15) | 112;
  bytes[8] = (bytes[8]! & 63) | 128;
  const h = bytes.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
interface Manifest {
  format: string;
  format_version: string;
  export_id: string;
  export_kind: string;
  created_at: string;
  generator_version: string;
  world_id: string;
  source_revision: number;
  publication_revision: null;
  scope: { canon_ids: readonly string[] };
  included_sections: readonly string[];
  omitted_sections: readonly { section: string; reason: string }[];
  schema_versions: { content: string };
  files: readonly {
    path: string;
    media_type: string;
    size: number;
    sha256: string;
  }[];
  completeness: string;
}
export async function exportWorldPackage(
  view: PortableWorld,
  revision: number
): Promise<{
  bytes: Buffer;
  manifest: Manifest;
  fingerprint: ReturnType<typeof temporalSemanticFingerprint>;
}> {
  if (
    !uuid.test(view.world.id) ||
    !Number.isSafeInteger(revision) ||
    revision < 1
  )
    fail("package_source_invalid");
  validatePortableWorld(view);
  const files = new Map<string, Buffer>();
  files.set("content/world.json", Buffer.from(portableStringify(view.world)));
  for (const [key, name] of Object.entries(sectionNames) as [
    keyof typeof sectionNames,
    string
  ][]) {
    const rows =
      key === "relations"
        ? canonicalPortableRelations(view.relations)
        : key === "eventCanonMemberships"
          ? sortedMemberships(view.eventCanonMemberships)
          : key === "relationCanonMemberships"
            ? sortedRelationMemberships(view.relationCanonMemberships)
            : [...view[key]].sort((a, b) => compareKeys(a.id, b.id));
    files.set(
      `content/${name}.ndjson`,
      Buffer.from(
        rows.map(portableStringify).join("\n") + (rows.length ? "\n" : "")
      )
    );
  }
  const fingerprint = temporalSemanticFingerprint(view);
  files.set(
    "reports/export-report.json",
    Buffer.from(
      portableStringify({
        fingerprint,
        virtual_time_event_rows: 0
      })
    )
  );
  const manifest: Manifest = {
    format: "moirai-world-package",
    format_version: "3.0",
    export_id: operationUuid(),
    export_kind: "content",
    created_at: new Date().toISOString(),
    generator_version: "clotho-temporal-portability/3",
    world_id: view.world.id,
    source_revision: revision,
    publication_revision: null,
    scope: { canon_ids: sorted(view.canons).map((c) => c.id) },
    included_sections: [...files.keys()],
    omitted_sections: [
      {
        section: "history",
        reason:
          "Content transfer excludes Change history and private origins; this is not an owner backup"
      },
      {
        section: "operations/subject-handles.ndjson",
        reason: "Operational handles are regenerated in the clone"
      },
      {
        section: "content/correspondences.ndjson",
        reason: "Correspondence is not implemented in the active content schema"
      },
      {
        section: "attachments",
        reason: "No attachment support in this content schema"
      }
    ],
    schema_versions: { content: "world-event-relation-canon-membership/1" },
    files: [...files].map(([path, bytes]) => ({
      path,
      media_type: path.endsWith(".ndjson")
        ? "application/x-ndjson"
        : "application/json",
      size: bytes.length,
      sha256: hash(bytes)
    })),
    completeness: "complete"
  };
  files.set("manifest.json", Buffer.from(portableStringify(manifest)));
  if ([...files.values()].reduce((sum, b) => sum + b.length, 0) > LIMIT)
    fail("package_size_limit");
  const zip = new ZipFile();
  const result = new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    zip.outputStream.on("data", (chunk: Buffer) => chunks.push(chunk));
    zip.outputStream.on("error", reject);
    zip.on("error", reject);
    zip.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
  });
  for (const [path, bytes] of files)
    zip.addBuffer(bytes, path, {
      compress: false,
      mode: 0o100644,
      forceZip64Format: true
    });
  zip.end({ forceZip64Format: true, comment: "" });
  return { bytes: await result, manifest, fingerprint };
}
async function packageFiles(bytes: Buffer): Promise<Map<string, Buffer>> {
  if (bytes.length > LIMIT + 1024 * 1024) fail("package_size_limit");
  return new Promise((resolve, reject) =>
    fromBuffer(
      bytes,
      { lazyEntries: true, validateEntrySizes: true, strictFileNames: true },
      (error, zip) => {
        if (error || !zip) {
          reject(new Error("package_container_invalid"));
          return;
        }
        const files = new Map<string, Buffer>();
        let size = 0,
          stopped = false;
        const abort = (code: string) => {
          if (stopped) return;
          stopped = true;
          zip.close();
          reject(new Error(code));
        };
        zip.on("error", () => abort("package_container_invalid"));
        zip.on("entry", (entry: Entry) => {
          const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
          if (
            !/^[a-z0-9][a-z0-9._/-]*$/.test(entry.fileName) ||
            entry.fileName
              .split("/")
              .some((p) => !p || p === "." || p === "..") ||
            files.has(entry.fileName) ||
            (mode !== 0 && mode !== 0o100000) ||
            entry.isEncrypted()
          ) {
            abort("package_unsafe_entry");
            return;
          }
          if (
            files.size >= 100 ||
            entry.uncompressedSize > LIMIT ||
            size + entry.uncompressedSize > LIMIT ||
            entry.uncompressedSize > Math.max(1, entry.compressedSize) * 100
          ) {
            abort("package_size_limit");
            return;
          }
          zip.openReadStream(entry, (err, stream) => {
            if (err || !stream) {
              abort("package_container_invalid");
              return;
            }
            const chunks: Buffer[] = [];
            let length = 0;
            stream.on("data", (chunk: Buffer) => {
              length += chunk.length;
              if (size + length > LIMIT) {
                stream.destroy();
                abort("package_size_limit");
              } else chunks.push(chunk);
            });
            stream.on("error", () => abort("package_container_invalid"));
            stream.on("end", () => {
              if (stopped) return;
              size += length;
              files.set(entry.fileName, Buffer.concat(chunks));
              zip.readEntry();
            });
          });
        });
        zip.on("end", () => {
          if (!stopped) resolve(files);
        });
        zip.readEntry();
      }
    )
  );
}
export async function readWorldPackage(
  bytes: Buffer
): Promise<{ view: PortableWorld; manifest: Manifest }> {
  const files = await packageFiles(bytes);
  let manifest: Manifest;
  try {
    manifest = JSON.parse(files.get("manifest.json")?.toString("utf8") ?? "");
  } catch {
    return fail("package_manifest_invalid");
  }
  const legacyV1 =
    manifest.format_version === "1.0" &&
    manifest.schema_versions?.content === "event-relational-time/1";
  const currentV2 =
    manifest.format_version === "2.0" &&
    manifest.schema_versions?.content === "world-event-canon-membership/1";
  const currentV3 =
    manifest.format_version === "3.0" &&
    manifest.schema_versions?.content ===
      "world-event-relation-canon-membership/1";
  if (
    manifest.format !== "moirai-world-package" ||
    (!legacyV1 && !currentV2 && !currentV3) ||
    manifest.export_kind !== "content" ||
    manifest.completeness !== "complete" ||
    !Array.isArray(manifest.files)
  )
    fail("package_format_unsupported");
  const expectedSectionNames = Object.values(sectionNames).filter((name) => {
    if (name === "event-canon-memberships") return currentV2 || currentV3;
    if (name === "relation-canon-memberships") return currentV3;
    return true;
  });
  const expectedPaths = [
    "content/world.json",
    ...expectedSectionNames.map((name) => `content/${name}.ndjson`),
    "reports/export-report.json"
  ].sort();
  if (
    portableStringify(manifest.files.map((f) => f.path).sort()) !==
      portableStringify(expectedPaths) ||
    files.size !== expectedPaths.length + 1
  )
    fail("package_sections_invalid");
  for (const item of manifest.files) {
    const bytes = files.get(item.path);
    if (!bytes || bytes.length !== item.size || hash(bytes) !== item.sha256)
      fail("package_digest_mismatch");
  }
  const decode = (path: string) => {
    try {
      return JSON.parse(files.get(path)!.toString("utf8"));
    } catch {
      return fail("package_json_invalid");
    }
  };
  const rows = (name: string) => {
    try {
      return files
        .get(`content/${name}.ndjson`)!
        .toString("utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
    } catch {
      return fail("package_json_invalid");
    }
  };
  const decoded = {
    world: decode("content/world.json"),
    ...Object.fromEntries(
      Object.entries(sectionNames)
        .filter(([, name]) => expectedSectionNames.includes(name))
        .map(([key, name]) => [key, rows(name)])
    )
  } as Record<string, unknown> & { world: PublicWorld };
  if (legacyV1) {
    const canons = decoded.canons as PublicCanon[];
    const canonWorld = new Map(
      canons.map((canon) => [canon.id, canon.world_id])
    );
    const legacyEvents = decoded.events as Array<
      Omit<PublicEvent, "world_id" | "canon_memberships"> & {
        canon_id: string;
      }
    >;
    decoded.eventCanonMemberships = legacyEvents.map((event) => ({
      event_id: event.id,
      canon_id: event.canon_id
    }));
    decoded.events = legacyEvents.map((event) => {
      const { canon_id: canonId, ...value } = event;
      const worldId = canonWorld.get(canonId);
      if (!worldId) return fail("package_dangling_reference");
      return {
        ...value,
        world_id: worldId,
        canon_memberships: [canonId]
      };
    });
  }
  const legacyFingerprintDigest =
    legacyV1 || currentV2 ? legacyRelationSemanticFingerprint(decoded) : null;
  if (legacyV1 || currentV2) {
    const canons = decoded.canons as PublicCanon[];
    const canonWorld = new Map(
      canons.map((canon) => [canon.id, canon.world_id])
    );
    const legacyRelations = decoded.relations as Array<
      Omit<PublicRelation, "world_id" | "canon_memberships"> & {
        canon_id: string;
      }
    >;
    decoded.relationCanonMemberships = legacyRelations.map((relation) => ({
      relation_id: relation.id,
      canon_id: relation.canon_id
    }));
    decoded.relations = legacyRelations.map((relation) => {
      const { canon_id: canonId, ...value } = relation;
      const worldId = canonWorld.get(canonId);
      if (!worldId) return fail("package_dangling_reference");
      return {
        ...value,
        world_id: worldId,
        canon_memberships: [canonId]
      };
    });
  }
  const view = decoded as unknown as PortableWorld;
  if (view.world.id !== manifest.world_id) fail("package_world_mismatch");
  validatePortableWorld(view);
  const fingerprint = temporalSemanticFingerprint(view);
  const report = decode("reports/export-report.json");
  if (
    report.fingerprint?.digest !== fingerprint.digest &&
    report.fingerprint?.digest !== legacyFingerprintDigest
  )
    fail("package_semantic_digest_mismatch");
  return { view, manifest };
}
export function cloneWorldPlan(
  view: PortableWorld,
  targetWorldId: string,
  nextId: () => string = operationUuid
): {
  plan: Omit<CreateChangeSet, "actor">;
  id_mapping: Readonly<Record<string, string>>;
} {
  if (!uuid.test(targetWorldId) || targetWorldId === view.world.id)
    fail("clone_world_target_invalid");
  const rows = [
    view.world,
    ...view.canons,
    ...view.timeSystems,
    ...view.canonTimeSystems,
    ...view.events,
    ...view.relations,
    ...view.narratives
  ];
  if (new Set(rows.map((row) => row.id)).size !== rows.length)
    fail("package_duplicate_id");
  const mapping = new Map(
    rows.map((row) => [
      row.id,
      row.id === view.world.id ? targetWorldId : nextId()
    ])
  );
  if (
    new Set(mapping.values()).size !== mapping.size ||
    [...mapping.values()].some(
      (id) => !uuid.test(id) || rows.some((row) => row.id === id)
    )
  )
    fail("clone_id_mapping_invalid");
  const id = (source: string) =>
    mapping.get(source) ?? fail("package_dangling_reference");
  const ref = (source: CanonicalEventReference): CanonicalEventReference =>
    source.kind === "event"
      ? { kind: "event", event_id: id(source.event_id) }
      : {
          ...cleanRef(source),
          kind: "time_event",
          time_system_ref: {
            time_system_id: id(source.time_system_ref.time_system_id)
          },
          definition_version: source.definition_version,
          coordinate: source.coordinate
        };
  const operations: ChangeOperation[] = [];
  const add = (entity_type: string, row: Record<string, unknown>) => {
    const { id: sourceId, ...value } = row;
    operations.push({
      kind: "create",
      entity_type,
      entity_id: id(String(sourceId)),
      origin_refs: [{ field: "*", origin_index: 0 }],
      value
    } as unknown as ChangeOperation);
  };
  add("world", { ...view.world, slug: `${view.world.slug}-import` });
  for (const row of view.canons)
    add("canon", { ...row, world_id: id(row.world_id) });
  for (const row of view.timeSystems)
    add("time_system", { ...row, world_id: id(row.world_id) });
  for (const row of view.canonTimeSystems)
    add("canon_time_system", {
      ...row,
      canon_id: id(row.canon_id),
      time_system_id: id(row.time_system_id)
    });
  for (const row of view.events) {
    const event = { ...row } as Record<string, unknown>;
    delete event.canon_memberships;
    add("event", { ...event, world_id: targetWorldId });
  }
  for (const membership of sortedMemberships(view.eventCanonMemberships)) {
    operations.push({
      kind: "add",
      entity_type: "event_canon_membership",
      origin_refs: [{ field: "*", origin_index: 0 }],
      value: {
        event_id: id(membership.event_id),
        canon_id: id(membership.canon_id)
      }
    });
  }
  for (const row of canonicalPortableRelations(view.relations)) {
    const relation = { ...row } as Record<string, unknown>;
    delete relation.canon_memberships;
    add("relation", {
      ...relation,
      world_id: targetWorldId,
      source_ref: ref(row.source_ref!),
      target_ref: ref(row.target_ref!)
    });
  }
  for (const membership of sortedRelationMemberships(
    view.relationCanonMemberships
  ))
    operations.push({
      kind: "add",
      entity_type: "relation_canon_membership",
      origin_refs: [{ field: "*", origin_index: 0 }],
      value: {
        relation_id: id(membership.relation_id),
        canon_id: id(membership.canon_id)
      }
    });
  for (const row of view.narratives)
    add("narrative", {
      ...row,
      canon_id: id(row.canon_id),
      scope_id: id(row.scope_id)
    });
  const plan: Omit<CreateChangeSet, "actor"> = {
    contract_version: CONTRACT_VERSION,
    change_set_id: nextId(),
    world_id: targetWorldId,
    expected_revision: 0,
    intent: "Clone validated .moirai content into an empty trial World",
    origins: [
      {
        kind: "human_instruction" as const,
        summary:
          "Reviewed content package clone; source IDs are retained in the mapping report"
      }
    ],
    operations
  };
  // This only validates in memory. The CLI still submits the resulting Plan to Clotho.
  const input = { ...plan, actor: nextId() };
  const resolved = resolveCreateOperations(input, nextId);
  validateCandidateChangeSet(input, resolved.operations, {
    world: null,
    canons: [],
    timeSystems: [],
    canonTimeSystems: [],
    eventCanonMemberships: [],
    relationCanonMemberships: [],
    events: [],
    relations: [],
    narratives: []
  });
  return { plan, id_mapping: Object.fromEntries(mapping) };
}
