import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createDatabase } from "../packages/persistence/src/index.js";
import {
  captureDatabaseImage,
  databaseImageDigest,
  decryptDatabaseImage,
  encryptDatabaseImage,
  restoreFreshRehearsal
} from "../packages/persistence/src/ip011-backup.js";
import {
  S3ObjectStore,
  type ObjectStore
} from "../packages/publication/src/index.js";

/** Operator-only command; no public HTTP/MCP entrypoint and no production restore.
 * Private operation history is encrypted BEFORE it reaches the object store.
 * The independent encryption key remains in the service's secret variables. */
export async function backupAndRehearse(
  sourceUrl: string,
  key: string,
  store: ObjectStore
) {
  const db = createDatabase(sourceUrl);
  try {
    const image = await captureDatabaseImage(db);
    const digest = databaseImageDigest(image);
    const encrypted = encryptDatabaseImage(image, key);
    const suffix = randomBytes(8).toString("hex");
    const objectKey = `operational-backups/ip011/${suffix}.aes256gcm.json`;
    const saved = await store.put(objectKey, encrypted, { immutable: true });
    if (saved.status < 200 || saved.status >= 300)
      throw Error("backup_storage_write_failed");
    const read = await store.get(objectKey);
    if (read.status !== 200 || read.body !== encrypted)
      throw Error("backup_storage_readback_failed");
    const verified = decryptDatabaseImage(read.body, key);
    if (databaseImageDigest(verified) !== digest)
      throw Error("backup_digest_mismatch");
    const result = await restoreFreshRehearsal(
      sourceUrl,
      verified,
      `ip011_rehearsal_${suffix}`
    );
    if (databaseImageDigest(await captureDatabaseImage(db)) !== digest)
      throw Error("source_changed_during_rehearsal");
    return {
      operation: "ip011_backup_rehearsal",
      object_key: objectKey,
      encryption: "AES-256-GCM",
      digest,
      restored_database: result.database,
      restore_digest_equal: result.digest === digest,
      source_digest_unchanged: true,
      table_rows: Object.fromEntries(image.tables.map((t) => [t.name, t.count]))
    };
  } finally {
    await db.destroy();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv[2] !== "backup-and-rehearse")
      throw Error("explicit_rehearsal_mode_required");
    const source = process.env.DATABASE_URL;
    const key = process.env.IP011_BACKUP_KEY;
    if (!source || !key) throw Error("backup_configuration_required");
    console.info(
      JSON.stringify(await backupAndRehearse(source, key, new S3ObjectStore()))
    );
  } catch {
    // Driver/storage messages can contain private data. Report only a safe code.
    console.error(
      '{"operation":"ip011_backup_rehearsal","error_code":"backup_rehearsal_failed"}'
    );
    process.exitCode = 1;
  }
}
