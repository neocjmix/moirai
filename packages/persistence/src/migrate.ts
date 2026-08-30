import { FileMigrationProvider, Migrator } from "kysely";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { createDatabase } from "./index.js";

export async function migrateToLatest(connectionString: string): Promise<void> {
  const db = createDatabase(connectionString);
  const migrationFolder = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "migrations"
  );

  try {
    const migrator = new Migrator({
      db,
      provider: new FileMigrationProvider({ fs, path, migrationFolder })
    });
    const { error, results } = await migrator.migrateToLatest();

    for (const result of results ?? []) {
      process.stdout.write(
        `migration ${result.migrationName}: ${result.status}\n`
      );
    }

    if (error) {
      throw error;
    }
  } finally {
    await db.destroy();
  }
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is required");
  }
  await migrateToLatest(connectionString);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "migration failed";
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
