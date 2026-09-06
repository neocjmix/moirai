import { readFileSync } from "node:fs";
import { ZipFile } from "yazl";
import { describe, expect, it } from "vitest";
import type { CreateChangeSet } from "@moirai/contracts";
import { resolveCreateOperations } from "@moirai/domain";
import {
  cloneWorldPlan,
  exportWorldPackage,
  readWorldPackage,
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
          ...JSON.parse(readFileSync(new URL(name, base), "utf8")),
          actor: "019f3b00-0000-7000-8000-000000000099"
        } as CreateChangeSet,
        () => {
          throw Error("explicit IDs");
        }
      ).operations
  );
  const rows = (type: string) =>
    ops
      .filter((o) => o.entity_type === type)
      .map((o) => ({ id: o.entity_id, ...o.value }));
  return {
    world: rows("world")[0],
    canons: rows("canon"),
    timeSystems: rows("time_system"),
    canonTimeSystems: rows("canon_time_system"),
    events: rows("event"),
    relations: rows("relation"),
    narratives: rows("narrative"),
    temporalPlacements: []
  } as PortableWorld;
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
      preview.plan.operations
        .filter((operation) => operation.entity_type === entityType)
        .map((operation) => ({
          id: operation.entity_id,
          ...(operation.value as Record<string, unknown>)
        }));
    const clone = {
      world: clonedRows("world")[0],
      canons: clonedRows("canon"),
      timeSystems: clonedRows("time_system"),
      canonTimeSystems: clonedRows("canon_time_system"),
      events: clonedRows("event"),
      relations: clonedRows("relation"),
      narratives: clonedRows("narrative"),
      temporalPlacements: []
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
