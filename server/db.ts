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
    const result = await Promise.race([
      pool.query<{ rate_limit_table: string | null }>("select to_regclass('public.rate_limit_counters')::text as rate_limit_table"),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error("Database readiness check timed out")), timeoutMs);
      }),
    ]);
    if (!result.rows[0]?.rate_limit_table) throw new Error("rate_limit_counters schema is missing");
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
