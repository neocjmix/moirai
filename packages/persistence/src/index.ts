import { Kysely, PostgresDialect, sql } from "kysely";
import pg from "pg";

export interface DatabaseSchema {
  moirai_system_metadata: {
    key: string;
    value: string;
    updated_at: Date;
  };
}

export type MoiraiDatabase = Kysely<DatabaseSchema>;

export function createDatabase(connectionString: string): MoiraiDatabase {
  return new Kysely<DatabaseSchema>({
    dialect: new PostgresDialect({
      pool: new pg.Pool({ connectionString, max: 5 })
    })
  });
}

export async function checkDatabaseReady(db: MoiraiDatabase): Promise<void> {
  await sql`select 1`.execute(db);
}
