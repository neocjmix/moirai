/** Inactive v5 content package. The historical v1-v3 reader stays byte-stable;
 * this format does not turn Collection membership into Event ownership. */
import { createHash } from "node:crypto";
import { ZipFile } from "yazl";
import type { CanonicalState } from "@moirai/contracts/v5";
import { assertV5CanonicalState, orderedV5State } from "@moirai/domain/v5";
import {
  operationUuid,
  packageFiles,
  portableStringify
} from "./portability.js";

const MAX_CONTENT_BYTES = 10 * 1024 * 1024;
const sections = {
  collections: "collections",
  timeSystems: "time-systems",
  collectionTimeSystems: "collection-time-systems",
  events: "events",
  eventCollectionMemberships: "collection-event-memberships",
  relations: "relations",
  narratives: "narratives"
} as const;
type Section = keyof typeof sections;
const digest = (value: string | Buffer) =>
  `sha256:${createHash("sha256").update(value).digest("hex")}`;
const expectedPaths = [
  "content/world.json",
  ...Object.values(sections).map((name) => `content/${name}.ndjson`),
  "reports/export-report.json"
].sort();

export interface V5ContentManifest {
  readonly format: "moirai-world-package";
  readonly format_version: "4.0";
  readonly export_id: string;
  readonly export_kind: "content";
  readonly created_at: string;
  readonly generator_version: "clotho-v5-portability/1";
  readonly world_id: string;
  readonly source_revision: number;
  readonly publication_revision: null;
  readonly scope: { readonly collection_ids: readonly string[] };
  readonly included_sections: readonly string[];
  readonly omitted_sections: readonly {
    readonly section: string;
    readonly reason: string;
  }[];
  readonly schema_versions: {
    readonly content: "world-event-collection-selection/1";
  };
  readonly files: readonly {
    readonly path: string;
    readonly media_type: string;
    readonly size: number;
    readonly sha256: string;
  }[];
  readonly completeness: "complete";
}

export function v5ContentFingerprint(state: CanonicalState) {
  assertV5CanonicalState(state);
  return {
    algorithm_version: "v5-world-content/1",
    digest: digest(portableStringify(orderedV5State(state)))
  } as const;
}

export async function exportV5ContentPackage(
  state: CanonicalState,
  revision: number
): Promise<{
  readonly bytes: Buffer;
  readonly manifest: V5ContentManifest;
  readonly fingerprint: ReturnType<typeof v5ContentFingerprint>;
}> {
  if (!Number.isSafeInteger(revision) || revision < 1)
    throw Error("v5_package_revision_invalid");
  const fingerprint = v5ContentFingerprint(state);
  const ordered = orderedV5State(state);
  const files = new Map<string, Buffer>();
  files.set(
    "content/world.json",
    Buffer.from(portableStringify(ordered.world))
  );
  for (const [field, name] of Object.entries(sections) as [Section, string][]) {
    const rows = ordered[field];
    files.set(
      `content/${name}.ndjson`,
      Buffer.from(
        rows.map(portableStringify).join("\n") + (rows.length ? "\n" : "")
      )
    );
  }
  files.set(
    "reports/export-report.json",
    Buffer.from(portableStringify({ fingerprint }))
  );
  const manifest: V5ContentManifest = {
    format: "moirai-world-package",
    format_version: "4.0",
    export_id: operationUuid(),
    export_kind: "content",
    created_at: new Date().toISOString(),
    generator_version: "clotho-v5-portability/1",
    world_id: state.world.id,
    source_revision: revision,
    publication_revision: null,
    scope: { collection_ids: ordered.collections.map((item) => item.id) },
    included_sections: [...files.keys()],
    omitted_sections: [
      {
        section: "history",
        reason:
          "Content transfer excludes Change history and private origins; not an owner backup"
      },
      {
        section: "operations/subject-handles.ndjson",
        reason: "Operational handles are not content ownership"
      },
      {
        section: "attachments",
        reason: "No attachment support in this content schema"
      }
    ],
    schema_versions: { content: "world-event-collection-selection/1" },
    files: [...files].map(([path, bytes]) => ({
      path,
      media_type: path.endsWith(".ndjson")
        ? "application/x-ndjson"
        : "application/json",
      size: bytes.length,
      sha256: digest(bytes)
    })),
    completeness: "complete"
  };
  files.set("manifest.json", Buffer.from(portableStringify(manifest)));
  if (
    [...files.values()].reduce((sum, value) => sum + value.length, 0) >
    MAX_CONTENT_BYTES
  )
    throw Error("package_size_limit");
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

/** Read-only validation; actual import must plan a v5 transaction and obtain
 * caller authorization. No automatic commit or World ID remap occurs here. */
export async function readV5ContentPackage(bytes: Buffer): Promise<{
  readonly state: CanonicalState;
  readonly manifest: V5ContentManifest;
}> {
  const files = await packageFiles(bytes);
  let manifest: V5ContentManifest;
  try {
    manifest = JSON.parse(files.get("manifest.json")?.toString("utf8") ?? "");
  } catch {
    throw Error("package_manifest_invalid");
  }
  if (
    !manifest ||
    manifest.format !== "moirai-world-package" ||
    manifest.format_version !== "4.0" ||
    manifest.schema_versions?.content !==
      "world-event-collection-selection/1" ||
    manifest.export_kind !== "content" ||
    manifest.completeness !== "complete" ||
    !Number.isSafeInteger(manifest.source_revision) ||
    manifest.source_revision < 1 ||
    !Array.isArray(manifest.files) ||
    !manifest.files.every(
      (item) =>
        item &&
        typeof item.path === "string" &&
        typeof item.sha256 === "string" &&
        Number.isSafeInteger(item.size) &&
        item.size >= 0
    ) ||
    !Array.isArray(manifest.included_sections) ||
    portableStringify([...manifest.included_sections].sort()) !==
      portableStringify(expectedPaths) ||
    portableStringify(manifest.files.map((item) => item.path).sort()) !==
      portableStringify(expectedPaths) ||
    files.size !== expectedPaths.length + 1
  )
    throw Error("package_format_unsupported");
  for (const item of manifest.files) {
    const content = files.get(item.path);
    if (
      !content ||
      content.length !== item.size ||
      digest(content) !== item.sha256
    )
      throw Error("package_digest_mismatch");
  }
  const json = (path: string) => {
    try {
      return JSON.parse(files.get(path)!.toString("utf8")) as unknown;
    } catch {
      throw Error("package_json_invalid");
    }
  };
  const rows = (name: string) => {
    try {
      return files
        .get(`content/${name}.ndjson`)!
        .toString("utf8")
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line)) as unknown[];
    } catch {
      throw Error("package_json_invalid");
    }
  };
  const state = {
    world: json("content/world.json"),
    ...Object.fromEntries(
      Object.entries(sections).map(([field, name]) => [field, rows(name)])
    )
  } as unknown as CanonicalState;
  if (!state.world || state.world.id !== manifest.world_id)
    throw Error("package_world_mismatch");
  if (
    !Array.isArray(manifest.scope?.collection_ids) ||
    portableStringify(manifest.scope.collection_ids) !==
      portableStringify(
        orderedV5State(state).collections.map((item) => item.id)
      )
  )
    throw Error("package_scope_mismatch");
  try {
    const report = json("reports/export-report.json") as {
      fingerprint: ReturnType<typeof v5ContentFingerprint>;
    };
    if (report.fingerprint?.digest !== v5ContentFingerprint(state).digest)
      throw Error("package_semantic_digest_mismatch");
  } catch (cause) {
    if (cause instanceof Error && cause.message.startsWith("package_"))
      throw cause;
    throw new Error("package_content_invalid", { cause });
  }
  return { state, manifest };
}
