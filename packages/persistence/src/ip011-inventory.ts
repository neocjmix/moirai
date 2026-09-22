import { sql } from "kysely";
import { fileURLToPath } from "node:url";
import { createDatabase, type MoiraiDatabase } from "./index.js";

/** Owner-level aggregate audit. The transaction itself prohibits writes.
 * Never returns source bodies, credentials, origins, actor subjects or SQL. */
export async function collectReadOnlyInventory(db: MoiraiDatabase) {
  return db
    .transaction()
    .setIsolationLevel("repeatable read")
    .execute(async (tx) => {
      await sql`set transaction read only`.execute(tx);
      await sql`set local statement_timeout = '20s'`.execute(tx);
      const { rows: columns } = await sql<{
        table_name: string;
        column_name: string;
      }>`
      select table_name, column_name from information_schema.columns
      where table_schema = 'public' order by table_name, ordinal_position
    `.execute(tx);
      const tables: Record<
        string,
        { rows: number; active?: number; withdrawn?: number }
      > = {};
      for (const name of [...new Set(columns.map((row) => row.table_name))]) {
        const withdrawals = columns.some(
          (row) =>
            row.table_name === name && row.column_name === "withdrawn_revision"
        );
        const counts = withdrawals
          ? sql`count(*)::int as rows, count(*) filter(where withdrawn_revision is null)::int as active, count(*) filter(where withdrawn_revision is not null)::int as withdrawn`
          : sql`count(*)::int as rows`;
        const result = await sql<{
          rows: number;
          active?: number;
          withdrawn?: number;
        }>`select ${counts} from ${sql.table(`public.${name}`)}`.execute(tx);
        tables[name] = result.rows[0]!;
      }
      const migrations = (
        await sql<{
          name: string;
        }>`select name from kysely_migration order by name`.execute(tx)
      ).rows;
      const worlds = (
        await sql<{
          id: string;
          slug: string;
          current_revision: number;
          publication_target_revision: number;
          withdrawn_revision: number | null;
        }>`select id,slug,current_revision,publication_target_revision,withdrawn_revision from worlds order by id`.execute(
          tx
        )
      ).rows;
      const locales = (
        await sql<{
          locale: string;
          scope_type: string;
          kind: string;
          rows: number;
          active: number;
        }>`select locale,scope_type,kind,count(*)::int as rows,count(*) filter(where withdrawn_revision is null)::int as active from narratives group by locale,scope_type,kind order by locale,scope_type,kind`.execute(
          tx
        )
      ).rows;
      const handles = (
        await sql<{
          status: string;
          rows: number;
        }>`select status,count(*)::int as rows from subject_handles group by status order by status`.execute(
          tx
        )
      ).rows;
      return {
        operation: "ip011_owner_inventory",
        read_only: true,
        tables,
        migrations,
        worlds,
        locales,
        handles
      };
    });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const url = process.env.DATABASE_URL;
  if (!url) throw Error("DATABASE_URL is required");
  const db = createDatabase(url);
  try {
    process.stdout.write(
      JSON.stringify(await collectReadOnlyInventory(db)) + "\n"
    );
  } catch {
    process.stderr.write(
      '{"operation":"ip011_owner_inventory","error_code":"inventory_failed"}\n'
    );
    process.exitCode = 1;
  } finally {
    await db.destroy();
  }
}
