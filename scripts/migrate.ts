import { config } from "dotenv";
config({ path: ".env.local" });
config();
const { authOptions } = await import("../src/lib/auth-options");
const { getMigrations } = await import("better-auth/db/migration");
const { db } = await import("../src/lib/db");
const { readFile } = await import("node:fs/promises");
try {
  const { runMigrations } = await getMigrations(authOptions);
  await runMigrations();
  const { readdir } = await import("node:fs/promises");
  await db.query(
    "CREATE TABLE IF NOT EXISTS app_migration (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())",
  );
  const connection = await db.connect();
  try {
    await connection.query("SELECT pg_advisory_lock(73501921)");
    const folder = new URL("../db/migrations/", import.meta.url);
    for (const name of (await readdir(folder))
      .filter((name) => name.endsWith(".sql"))
      .sort()) {
      if (
        (
          await connection.query("SELECT 1 FROM app_migration WHERE name=$1", [
            name,
          ])
        ).rowCount
      )
        continue;
      await connection.query("BEGIN");
      try {
        await connection.query(await readFile(new URL(name, folder), "utf8"));
        await connection.query("INSERT INTO app_migration(name) VALUES($1)", [
          name,
        ]);
        await connection.query("COMMIT");
      } catch (error) {
        await connection.query("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await connection.query("SELECT pg_advisory_unlock(73501921)");
    connection.release();
  }
  console.info("IssuePulse database is ready.");
} finally {
  await db.end();
}
