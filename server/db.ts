import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema });

export async function verifyDatabaseReady(timeoutMs = 3_000) {
  let timeout: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      pool.query("select 1"),
      new Promise((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("Database readiness check timed out")), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
