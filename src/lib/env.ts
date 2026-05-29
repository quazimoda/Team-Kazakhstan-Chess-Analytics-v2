import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  ADMIN_SECRET: z.string().min(12).optional(),
  CHESSCOM_USER_AGENT: z.string().min(8).optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),
});

export const env = envSchema.parse({
  DATABASE_URL: process.env.DATABASE_URL,
  ADMIN_SECRET: process.env.ADMIN_SECRET,
  CHESSCOM_USER_AGENT: process.env.CHESSCOM_USER_AGENT,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
});

export function getChessComUserAgent() {
  return env.CHESSCOM_USER_AGENT ?? "Team Kazakhstan Chess Analytics v2 MVP (set CHESSCOM_USER_AGENT)";
}
