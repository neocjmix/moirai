/** Operator-only read-only check against an explicitly named restored clone.
 * No S3 write, live pointer update, schema migration or import commit. */
import { fileURLToPath } from "node:url";
import { readFile } from "node:fs/promises";
import { sql } from "kysely";
import { createDatabase, readWorldAtRevision } from "@moirai/persistence";
import {
  readActiveV5State,
  readV5WorldAtRevision
} from "@moirai/persistence/v5";
import { stableStringify } from "@moirai/domain";
import {
  exportV5ContentPackage,
  readV5ContentPackage,
  v5ContentFingerprint
} from "../skills/clotho/src/portability-v5.js";

export async function rehearseV5ContentExport(
  sourceUrl: string,
  cloneName: string,
  worldId: string,
  legacyRevision: number,
  targetRevision: number
) {
  if (!/^ip011_rehearsal_[0-9a-f]{16}$/.test(cloneName))
    throw Error("isolated_rehearsal_name_required");
  const targetUrl = new URL(sourceUrl);
  if (decodeURIComponent(targetUrl.pathname.slice(1)) === cloneName)
    throw Error("source_target_collision");
  targetUrl.pathname = `/${cloneName}`;
  const source = createDatabase(sourceUrl);
  const target = createDatabase(targetUrl.toString());
  try {
    const name = (
      await sql<{ name: string }>`select current_database() as name`.execute(
        target
      )
    ).rows[0]?.name;
    if (name !== cloneName) throw Error("rehearsal_database_mismatch");
    const original = await readWorldAtRevision(source, worldId, legacyRevision);
    const retained = await readWorldAtRevision(target, worldId, legacyRevision);
    if (stableStringify(original) !== stableStringify(retained))
      throw Error("legacy_revision_drift");
    const replay = await readV5WorldAtRevision(target, worldId, targetRevision);
    const active = await readActiveV5State(target, worldId);
    if (
      v5ContentFingerprint(replay).digest !==
      v5ContentFingerprint(active).digest
    )
      throw Error("v5_revision_drift");
    const packaged = await exportV5ContentPackage(replay, targetRevision);
    const unpacked = await readV5ContentPackage(packaged.bytes);
    if (
      v5ContentFingerprint(unpacked.state).digest !==
      packaged.fingerprint.digest
    )
      throw Error("v5_package_roundtrip_drift");
    return {
      operation: "ip011_v5_content_export_rehearsal",
      world_id: worldId,
      legacy_revision: legacyRevision,
      target_revision: targetRevision,
      legacy_revision_unchanged: true,
      v5_revision_matches_active: true,
      package_roundtrip: true,
      fingerprint: packaged.fingerprint.digest,
      package_bytes: packaged.bytes.length,
      counts: {
        events: unpacked.state.events.length,
        collections: unpacked.state.collections.length,
        relations: unpacked.state.relations.length,
        memberships: unpacked.state.eventCollectionMemberships.length,
        narratives: unpacked.state.narratives.length
      }
    };
  } finally {
    await Promise.all([source.destroy(), target.destroy()]);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] !== "rehearse-content-export")
      throw Error("explicit_mode_required");
    const source = process.env.DATABASE_URL;
    const clone = process.env.IP011_REHEARSAL_DB;
    if (!source || !clone) throw Error("rehearsal_configuration_required");
    const manifest = JSON.parse(
      await readFile(
        new URL(
          "../data/migrations/ip011/world-r30-preservation.json",
          import.meta.url
        ),
        "utf8"
      )
    ) as {
      world_id: string;
      source_revision: number;
    };
    console.info(
      JSON.stringify(
        await rehearseV5ContentExport(
          source,
          clone,
          manifest.world_id,
          manifest.source_revision,
          manifest.source_revision + 1
        )
      )
    );
  } catch {
    // Credentials/private Change Set values never leave this process.
    console.error(
      '{"operation":"ip011_v5_content_export_rehearsal","error_code":"rehearsal_failed"}'
    );
    process.exitCode = 1;
  }
}
