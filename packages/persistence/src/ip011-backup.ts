import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from "node:crypto";
import { sql } from "kysely";
import { createDatabase, type MoiraiDatabase } from "./index.js";
import { migrateToVersion } from "./migrate.js";

// Frozen v4 restore dependency order. Unknown tables fail closed rather than
// silently losing data. JSON text stays in PostgreSQL form to preserve numeric
// and timestamptz precision; row values never pass through JS number coercion.
export const BACKUP_TABLES = [
  "worlds",
  "canons",
  "time_systems",
  "canon_time_systems",
  "events",
  "canon_event_memberships",
  "relations",
  "canon_relation_memberships",
  "narratives",
  "change_sets",
  "world_revisions",
  "change_operations",
  "world_publication_state",
  "publication_outbox",
  "subject_handles",
  "subject_handle_members",
  "moirai_system_metadata",
  "kysely_migration",
  "kysely_migration_lock"
] as const;
interface TableImage {
  name: string;
  rows_json: string;
  count: number;
}
interface SequenceImage {
  name: string;
  last_value: string;
  is_called: boolean;
}
export interface DatabaseImage {
  format: "moirai-v4-db-backup/1";
  migration: string;
  schema_json: string;
  tables: TableImage[];
  sequences: SequenceImage[];
}
const MAX_BYTES = 64 * 1024 * 1024;
const AAD = Buffer.from("moirai-v4-db-backup/1");

export async function captureDatabaseImage(
  db: MoiraiDatabase
): Promise<DatabaseImage> {
  return db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (tx) => {
      await sql`set transaction read only`.execute(tx);
      await sql`set local statement_timeout = '30s'`.execute(tx);
      const schema_json = (
        await sql<{ schema_json: string }>`
        select jsonb_build_object(
          'columns', (select jsonb_agg(to_jsonb(c) order by table_name,ordinal_position) from (
            select table_name,column_name,ordinal_position,is_nullable,data_type,udt_name,column_default,character_maximum_length,numeric_precision,numeric_scale,datetime_precision,identity_generation
            from information_schema.columns where table_schema='public'
          ) c),
          'constraints', (select jsonb_agg(to_jsonb(c) order by table_name,name) from (
            select r.relname as table_name,c.conname as name,pg_get_constraintdef(c.oid) as definition
            from pg_constraint c join pg_class r on r.oid=c.conrelid join pg_namespace n on n.oid=r.relnamespace where n.nspname='public'
          ) c),
          'indexes', (select jsonb_agg(to_jsonb(i) order by tablename,indexname) from (
            select tablename,indexname,indexdef from pg_indexes where schemaname='public'
          ) i),
          'triggers', (select jsonb_agg(to_jsonb(t) order by table_name,name) from (
            select r.relname as table_name,t.tgname as name,t.tgenabled as enabled,pg_get_triggerdef(t.oid) as definition
            from pg_trigger t join pg_class r on r.oid=t.tgrelid join pg_namespace n on n.oid=r.relnamespace where n.nspname='public' and not t.tgisinternal
          ) t),
          'table_security', (select jsonb_agg(to_jsonb(r) order by name) from (select c.relname as name,c.relrowsecurity,c.relforcerowsecurity,c.relacl::text as acl from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind in ('r','p')) r),
          'policies', (select jsonb_agg(to_jsonb(p) order by tablename,policyname) from (select tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='public') p),
          'functions', (select jsonb_agg(pg_get_functiondef(p.oid) order by p.proname,pg_get_function_identity_arguments(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f'),
          'views', (select jsonb_agg(to_jsonb(v) order by viewname) from (select viewname,definition from pg_views where schemaname='public') v)
        )::text as schema_json
      `.execute(tx)
      ).rows[0]!.schema_json;
      const actual = (
        await sql<{
          table_name: string;
        }>`select table_name from information_schema.tables where table_schema='public' and table_type='BASE TABLE' order by table_name`.execute(
          tx
        )
      ).rows.map((row) => row.table_name);
      if (actual.join() !== [...BACKUP_TABLES].sort().join())
        throw Error("backup_schema_inventory_mismatch");
      const migration = (
        await sql<{
          name: string;
        }>`select name from kysely_migration order by name desc limit 1`.execute(
          tx
        )
      ).rows[0]?.name;
      if (migration !== "009_ip003_relation_memberships")
        throw Error("backup_schema_version_mismatch");
      const tables: TableImage[] = [];
      let bytes = 0;
      for (const name of BACKUP_TABLES) {
        const row = (
          await sql<{
            rows_json: string;
            count: number;
          }>`select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text), '[]'::jsonb)::text as rows_json, count(*)::int as count from ${sql.table(`public.${name}`)} as t`.execute(
            tx
          )
        ).rows[0]!;
        bytes += Buffer.byteLength(row.rows_json);
        if (bytes > MAX_BYTES) throw Error("backup_size_limit");
        tables.push({ name, ...row });
      }
      const names = (
        await sql<{
          sequencename: string;
        }>`select sequencename from pg_sequences where schemaname='public' order by sequencename`.execute(
          tx
        )
      ).rows;
      const sequences: SequenceImage[] = [];
      for (const { sequencename: name } of names) {
        const row = (
          await sql<{
            last_value: string;
            is_called: boolean;
          }>`select last_value::text, is_called from ${sql.table(`public.${name}`)}`.execute(
            tx
          )
        ).rows[0]!;
        sequences.push({ name, ...row });
      }
      return {
        format: "moirai-v4-db-backup/1",
        migration,
        schema_json,
        tables,
        sequences
      };
    });
}

export function databaseImageDigest(image: DatabaseImage): string {
  return createHash("sha256").update(JSON.stringify(image)).digest("hex");
}
function keyBytes(key: string): Buffer {
  if (!/^[0-9a-f]{64}$/.test(key)) throw Error("backup_key_required");
  return Buffer.from(key, "hex");
}
export function encryptDatabaseImage(
  image: DatabaseImage,
  key: string
): string {
  const body = Buffer.from(JSON.stringify(image));
  if (body.length > MAX_BYTES) throw Error("backup_size_limit");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyBytes(key), iv);
  cipher.setAAD(AAD);
  const ciphertext = Buffer.concat([cipher.update(body), cipher.final()]);
  return JSON.stringify({
    format: "moirai-v4-db-backup/1",
    iv: iv.toString("hex"),
    tag: cipher.getAuthTag().toString("hex"),
    ciphertext: ciphertext.toString("base64")
  });
}
export function decryptDatabaseImage(
  envelope: string,
  key: string
): DatabaseImage {
  if (Buffer.byteLength(envelope) > MAX_BYTES * 1.5)
    throw Error("backup_size_limit");
  const data = JSON.parse(envelope) as {
    format: string;
    iv: string;
    tag: string;
    ciphertext: string;
  };
  if (
    data.format !== "moirai-v4-db-backup/1" ||
    !/^[0-9a-f]{24}$/.test(data.iv) ||
    !/^[0-9a-f]{32}$/.test(data.tag)
  )
    throw Error("invalid_backup_envelope");
  const decipher = createDecipheriv(
    "aes-256-gcm",
    keyBytes(key),
    Buffer.from(data.iv, "hex")
  );
  decipher.setAAD(AAD);
  decipher.setAuthTag(Buffer.from(data.tag, "hex"));
  const body = Buffer.concat([
    decipher.update(Buffer.from(data.ciphertext, "base64")),
    decipher.final()
  ]);
  if (body.length > MAX_BYTES) throw Error("backup_size_limit");
  const image = JSON.parse(body.toString("utf8")) as DatabaseImage;
  if (
    image.format !== "moirai-v4-db-backup/1" ||
    typeof image.schema_json !== "string" ||
    image.migration !== "009_ip003_relation_memberships" ||
    image.tables.map((t) => t.name).join() !== BACKUP_TABLES.join()
  )
    throw Error("invalid_backup_image");
  return image;
}

/** Never restores over an existing database, including another rehearsal.
 * Caller receives only the new database name, never a connection string. */
export async function restoreFreshRehearsal(
  sourceUrl: string,
  image: DatabaseImage,
  name: string
): Promise<{ database: string; digest: string }> {
  if (!/^ip011_rehearsal_[0-9a-f]{16}$/.test(name))
    throw Error("rehearsal_name_required");
  const target = new URL(sourceUrl);
  if (target.pathname.slice(1) === name)
    throw Error("rehearsal_source_conflict");
  target.pathname = "/" + name;
  const admin = createDatabase(sourceUrl);
  try {
    // CREATE DATABASE fails when the name exists; there is no overwrite path.
    await sql`create database ${sql.id(name)}`.execute(admin);
  } finally {
    await admin.destroy();
  }
  await migrateToVersion(target.toString(), image.migration);
  const db = createDatabase(target.toString());
  try {
    if ((await captureDatabaseImage(db)).schema_json !== image.schema_json)
      throw Error("rehearsal_schema_mismatch");
    await db.transaction().execute(async (tx) => {
      await sql`set local statement_timeout = '30s'`.execute(tx);
      await sql`truncate ${sql.join(BACKUP_TABLES.map((t) => sql.table(`public.${t}`)))} cascade`.execute(
        tx
      );
      for (const table of image.tables) {
        if (!(BACKUP_TABLES as readonly string[]).includes(table.name))
          throw Error("invalid_backup_table");
        await sql`insert into ${sql.table(`public.${table.name}`)} select * from jsonb_populate_recordset(null::${sql.id("public", table.name)},${table.rows_json}::jsonb)`.execute(
          tx
        );
      }
      for (const seq of image.sequences)
        await sql`select setval(${`public.${seq.name}`}::regclass,${seq.last_value}::bigint,${seq.is_called})`.execute(
          tx
        );
    });
    const restored = await captureDatabaseImage(db);
    const digest = databaseImageDigest(restored);
    if (digest !== databaseImageDigest(image))
      throw Error("rehearsal_restore_digest_mismatch");
    return { database: name, digest };
  } finally {
    await db.destroy();
  }
}
