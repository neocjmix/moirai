import { describe, expect, it } from "vitest";
import { ZipFile } from "yazl";
import type { CanonicalState } from "@moirai/contracts/v5";
import { packageFiles, readWorldPackage } from "./portability.js";
import {
  exportV5ContentPackage,
  readV5ContentPackage,
  v5ContentFingerprint
} from "./portability-v5.js";

const worldId = "01995c2a-7b00-7000-8000-000000000101";
const state: CanonicalState = {
  world: {
    id: worldId,
    slug: "history",
    title: "실제 세계사",
    description: null
  },
  collections: ["joseon", "japan"].map((id) => ({
    id,
    world_id: worldId,
    slug: id,
    title: id,
    description: null
  })),
  timeSystems: [],
  collectionTimeSystems: [],
  events: ["coup", "unselected"].map((id) => ({
    id,
    world_id: worldId,
    slug: null,
    title: id,
    summary: null,
    roles: [],
    attributes: {}
  })),
  eventCollectionMemberships: ["joseon", "japan"].map((collection_id) => ({
    collection_id,
    event_id: "coup"
  })),
  relations: [
    {
      id: "contains",
      world_id: worldId,
      type: "contains",
      direction: "directed",
      source_ref: { kind: "event", event_id: "coup" },
      target_ref: { kind: "event", event_id: "unselected" },
      attributes: {}
    }
  ],
  narratives: [
    ...["coup", "unselected"].map((id) => ({
      id: `n-${id}`,
      world_id: worldId,
      scope_type: "event" as const,
      scope_id: id,
      locale: "ko",
      title: null,
      body: "Event account",
      public_references: [],
      notes: []
    })),
    ...["joseon", "japan"].map((id) => ({
      id: `n-${id}`,
      world_id: worldId,
      scope_type: "collection" as const,
      scope_id: id,
      locale: "ko",
      title: null,
      body: "Collection introduction",
      public_references: [],
      notes: []
    }))
  ]
};

describe("inactive v5 World content ZIP64", () => {
  it("rejects a modified content entry even when the ZIP container is valid", async () => {
    const exported = await exportV5ContentPackage(state, 31);
    const files = await packageFiles(exported.bytes);
    files.set("content/events.ndjson", Buffer.from("\n"));
    const zip = new ZipFile();
    const bytes = new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      zip.outputStream.on("data", (chunk: Buffer) => chunks.push(chunk));
      zip.outputStream.on("error", reject);
      zip.outputStream.on("end", () => resolve(Buffer.concat(chunks)));
    });
    for (const [path, content] of files)
      zip.addBuffer(content, path, { compress: false });
    zip.end();
    await expect(readV5ContentPackage(await bytes)).rejects.toThrow(
      "package_digest_mismatch"
    );
  });
  it("round-trips shared/zero membership, World Relation and one Narrative per owner", async () => {
    const exported = await exportV5ContentPackage(state, 31);
    expect(exported.bytes.subarray(0, 2).toString()).toBe("PK");
    expect(exported.manifest.scope.collection_ids).toEqual(["japan", "joseon"]);
    expect(exported.manifest.files.map((file) => file.path)).toContain(
      "content/collection-event-memberships.ndjson"
    );
    expect(JSON.stringify(exported.manifest)).not.toContain("canon");
    const imported = await readV5ContentPackage(exported.bytes);
    expect(v5ContentFingerprint(imported.state)).toEqual(exported.fingerprint);
    expect(imported.state.eventCollectionMemberships).toHaveLength(2);
    expect(imported.state.events).toHaveLength(2);
    expect(imported.state.relations).toHaveLength(1);
    expect(imported.state.narratives).toHaveLength(4);
    await expect(readWorldPackage(exported.bytes)).rejects.toThrow(
      "package_format_unsupported"
    );
  });
  it("refuses obsolete Event ownership and malformed revision", async () => {
    await expect(exportV5ContentPackage(state, 0)).rejects.toThrow(
      "v5_package_revision_invalid"
    );
    await expect(
      exportV5ContentPackage(
        {
          ...state,
          events: [
            { ...state.events[0]!, kind: "composite" } as never,
            state.events[1]!
          ]
        },
        31
      )
    ).rejects.toThrow("legacy event semantics");
  });
});
