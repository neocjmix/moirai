/** Operator-only isolated rehearsal. No route or general production migration mode. */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import type { PreservationManifest } from "./ip011-preservation.js";
import { preservationDigest } from "./ip011-preservation.js";
import { rehearseV5Snapshot } from "./ip011-v5-rehearsal.js";
import { rehearseV5Database } from "../packages/persistence/src/ip011-v5-rehearsal.js";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] !== "rehearse-v5")
      throw Error("explicit_mode_required");
    const source = process.env.DATABASE_URL;
    const database = process.env.IP011_REHEARSAL_DB;
    if (!source || !database) throw Error("rehearsal_configuration_required");
    const manifest = JSON.parse(
      await readFile(
        new URL(
          "../data/migrations/ip011/world-r30-preservation.json",
          import.meta.url
        ),
        "utf8"
      )
    ) as PreservationManifest;
    const result = await rehearseV5Database(source, database, {
      world_id: manifest.world_id,
      expected_revision: manifest.source_revision,
      preservation_digest: preservationDigest(manifest),
      build_candidate: (snapshot) =>
        rehearseV5Snapshot(snapshot, manifest).state
    });
    console.info(JSON.stringify(result));
  } catch {
    // Database diagnostics may contain private Change Set material or credentials.
    console.error(
      '{"operation":"ip011_v5_database_rehearsal","error_code":"rehearsal_failed"}'
    );
    process.exitCode = 1;
  }
}
