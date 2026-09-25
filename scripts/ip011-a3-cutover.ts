/** Restricted operator command. Run only after both HTTP writes and the v4
 * Publication worker are quiesced. It backs up and restores a fresh clone,
 * repeats the reviewed v5 migration there, then applies the same transaction
 * to the frozen source. It never writes the serving pointer or opens writes. */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { sql } from "kysely";
import { createDatabase } from "@moirai/persistence";
import {
  assertV5SchemaReady,
  readActiveV5State,
  readV5WorldAtRevision
} from "@moirai/persistence/v5";
import { assertV5CanonicalState } from "@moirai/domain/v5";
import { S3ObjectStore } from "@moirai/publication";
import { backupAndRehearse } from "./ip011-backup-rehearsal.js";
import {
  preservationDigest,
  type PreservationManifest
} from "./ip011-preservation.js";
import { rehearseV5Snapshot } from "./ip011-v5-rehearsal.js";
import {
  applyReviewedV5Cutover,
  rehearseV5Database
} from "../packages/persistence/src/ip011-v5-rehearsal.js";
import {
  captureDatabaseImage,
  databaseImageDigest
} from "../packages/persistence/src/ip011-backup.js";
import {
  up as installSearchIndex,
  IP011_SEARCH_MIGRATION
} from "../packages/persistence/src/cutovers/011_ip011_authoring_search.js";

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let phase = "preflight";
  try {
    if (
      process.argv[2] !== "cutover-v5" ||
      process.env.IP011_WRITE_QUIESCED !== "1" ||
      process.env.PUBLICATION_CONTRACT_MODE !== "quiesced"
    )
      throw Error("cutover_requires_explicit_quiescence");
    const sourceUrl = process.env.DATABASE_URL;
    const key = process.env.IP011_BACKUP_KEY;
    const expectedName = process.env.IP011_OPERATIONAL_DB_NAME;
    if (
      !sourceUrl ||
      !key ||
      !expectedName ||
      !/^[a-zA-Z0-9_-]+$/.test(expectedName)
    )
      throw Error("cutover_configuration_required");
    if (
      decodeURIComponent(new URL(sourceUrl).pathname.slice(1)) !==
        expectedName ||
      expectedName.startsWith("ip011_rehearsal_")
    )
      throw Error("cutover_source_identity_invalid");
    const manifest = JSON.parse(
      await readFile(
        new URL(
          "../data/migrations/ip011/world-r30-preservation.json",
          import.meta.url
        ),
        "utf8"
      )
    ) as PreservationManifest;
    const input = {
      world_id: manifest.world_id,
      expected_revision: manifest.source_revision,
      preservation_digest: preservationDigest(manifest),
      build_candidate: (snapshot: Parameters<typeof rehearseV5Snapshot>[0]) =>
        rehearseV5Snapshot(snapshot, manifest).state
    };
    const source = createDatabase(sourceUrl);
    try {
      const identity = (
        await sql<{ name: string }>`select current_database() as name`.execute(
          source
        )
      ).rows[0];
      if (identity?.name !== expectedName)
        throw Error("cutover_source_identity_invalid");
      const worlds = (
        await sql<{ id: string; current_revision: number }>`
        select id,current_revision from worlds order by id`.execute(source)
      ).rows;
      if (
        worlds.length !== 1 ||
        worlds[0]?.id !== input.world_id ||
        worlds[0].current_revision !== input.expected_revision
      )
        throw Error("cutover_source_revision_drift");
      const pending = (
        await sql<{ count: string }>`
        select count(*)::text as count from publication_outbox where status <> 'completed'`.execute(
          source
        )
      ).rows[0];
      if (pending?.count !== "0") throw Error("cutover_pending_v4_publication");
      phase = "backup_and_restore";
      const backup = await backupAndRehearse(
        sourceUrl,
        key,
        new S3ObjectStore()
      );
      if (!backup.restore_digest_equal || !backup.source_digest_unchanged)
        throw Error("cutover_backup_verification_failed");
      phase = "clone_migration";
      const rehearsal = await rehearseV5Database(
        sourceUrl,
        backup.restored_database,
        input
      );
      if (
        !rehearsal.v5_revision_replay_matches_active ||
        !rehearsal.operational_source_unchanged
      )
        throw Error("cutover_clone_verification_failed");
      if (
        databaseImageDigest(await captureDatabaseImage(source)) !==
        backup.digest
      )
        throw Error("cutover_frozen_source_drift");
      phase = "source_migration";
      const migrated = await applyReviewedV5Cutover(source, input);
      if (
        migrated.candidate_digest !== rehearsal.candidate_digest ||
        !migrated.v5_revision_replay_matches_active
      )
        throw Error("cutover_live_clone_divergence");
      phase = "search_index";
      await source.transaction().execute(async (tx) => {
        await installSearchIndex(tx);
        await sql`insert into kysely_migration(name, timestamp)
          values (${IP011_SEARCH_MIGRATION}, ${new Date().toISOString()})`.execute(
          tx
        );
      });
      await assertV5SchemaReady(source);
      const actual = await readActiveV5State(source, input.world_id);
      assertV5CanonicalState(actual);
      await readV5WorldAtRevision(source, input.world_id, migrated.to_revision);
      console.info(
        JSON.stringify({
          operation: "ip011_a3_cutover",
          result_code: "canonical_migrated_pointer_unchanged",
          backup_key: backup.object_key,
          backup_digest: backup.digest,
          restored_database: backup.restored_database,
          from_revision: migrated.from_revision,
          to_revision: migrated.to_revision,
          candidate_digest: migrated.candidate_digest,
          events: actual.events.length,
          collections: actual.collections.length,
          relations: actual.relations.length,
          narratives: actual.narratives.length,
          writes_quiesced: true
        })
      );
    } finally {
      await source.destroy();
    }
  } catch {
    console.error(
      JSON.stringify({
        operation: "ip011_a3_cutover",
        phase,
        error_code: "cutover_failed_writes_must_remain_quiesced"
      })
    );
    process.exitCode = 1;
  }
}
