import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/lib/env";
import * as schema from "./schema";

const connectionString = env.DATABASE_URL;

export const db = connectionString
  ? drizzle(postgres(connectionString, { prepare: false }), { schema })
  : null;
