import { Pool as NeonPool, neonConfig } from "@neondatabase/serverless";
import { sql } from "drizzle-orm";
import { drizzle as drizzleNeon, type NeonDatabase } from "drizzle-orm/neon-serverless";
import { drizzle as drizzlePg, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool as PgPool } from "pg";
import ws from "ws";
import { getEnv } from "@/lib/env";
import { resolveDriver, type DbDriver } from "./driver";
import * as schema from "./schema";

export type Schema = typeof schema;
export type Db = NodePgDatabase<Schema> | NeonDatabase<Schema>;

export type DbHandle =
  | { driver: Extract<DbDriver, "neon">; db: NeonDatabase<Schema>; close: () => Promise<void> }
  | { driver: Extract<DbDriver, "pg">; db: NodePgDatabase<Schema>; close: () => Promise<void> };

export function createDb(databaseUrl: string): DbHandle {
  const driver = resolveDriver(databaseUrl);
  if (driver === "neon") {
    // Node runtimes without a global WebSocket need one supplied.
    neonConfig.webSocketConstructor = ws;
    const pool = new NeonPool({ connectionString: databaseUrl });
    return { driver, db: drizzleNeon({ client: pool, schema }), close: () => pool.end() };
  }
  const pool = new PgPool({ connectionString: databaseUrl });
  return { driver, db: drizzlePg({ client: pool, schema }), close: () => pool.end() };
}

// Reuse one pool across hot reloads in dev and across invocations of a warm function.
const globalForDb = globalThis as typeof globalThis & { __sharadDb?: DbHandle };

function getDbHandle(): DbHandle {
  globalForDb.__sharadDb ??= createDb(getEnv().DATABASE_URL);
  return globalForDb.__sharadDb;
}

export function getDb(): Db {
  return getDbHandle().db;
}

export interface DatabaseStatus {
  driver: DbDriver;
  reachable: boolean;
}

export async function pingDatabase(): Promise<DatabaseStatus> {
  const { driver, db } = getDbHandle();
  await db.execute(sql`select 1`);
  return { driver, reachable: true };
}
