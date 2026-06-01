import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

const connectionString = env.DATABASE_URL;

export const db = connectionString
  ? drizzle(
      postgres(connectionString, {
        prepare: false,
        max: 1,
        connect_timeout: 10,
        idle_timeout: 20,
      }),
      { schema },
    )
  : null;
