declare namespace React {
  type ReactNode = unknown;
}

declare module "react" {
  export type ReactNode = unknown;
  export function useState<T>(initialValue: T | (() => T)): [T, (value: T | ((previous: T) => T)) => void];
}

declare namespace JSX {
  interface Element {}
  interface ElementChildrenAttribute { children: {}; }
  interface IntrinsicAttributes { key?: string | number; }
  interface IntrinsicElements {
    [elemName: string]: any;
  }
}

declare module "next" {
  export type Metadata = Record<string, unknown>;
  export type NextConfig = Record<string, unknown>;
}

declare module "next/link" {
  const Link: any;
  export default Link;
}

declare module "next/server" {
  export class NextRequest extends Request {
    nextUrl: URL;
  }
  export class NextResponse extends Response {
    static json(body: unknown, init?: ResponseInit): NextResponse;
  }
}

declare module "lucide-react" {
  export const BarChart3: any;
  export const CalendarDays: any;
  export const Crown: any;
  export const Home: any;
  export const Shield: any;
  export const Trophy: any;
  export const Users: any;
}

declare module "drizzle-kit" {
  export function defineConfig(config: unknown): unknown;
}

declare module "postgres" {
  const postgres: any;
  export default postgres;
}

declare module "drizzle-orm" {
  export type SQL = unknown;
  export const sql: any;
  export function and(...conditions: unknown[]): unknown;
  export function desc(value: unknown): unknown;
  export function eq(left: unknown, right: unknown): unknown;
  export function inArray(column: unknown, values: unknown[]): unknown;
  export function relations(table: unknown, builder: (helpers: { one: any; many: any }) => unknown): unknown;
}

declare module "drizzle-orm/postgres-js" {
  export function drizzle(client: unknown, config?: unknown): any;
}

declare module "drizzle-orm/pg-core" {
  export function pgTable(name: string, columns: Record<string, any>, extra?: (table: any) => unknown): any;
  export function pgEnum(name: string, values: string[]): any;
  export function serial(name: string): any;
  export function integer(name: string): any;
  export function jsonb(name: string): any;
  export function numeric(name: string, config?: unknown): any;
  export function text(name: string): any;
  export function timestamp(name: string, config?: unknown): any;
  export function varchar(name: string, config?: unknown): any;
  export function index(name: string): any;
  export function uniqueIndex(name: string): any;
  export function primaryKey(config: unknown): any;
}

declare const process: {
  env: Record<string, string | undefined>;
};

declare module "*.css" { const content: unknown; export default content; }


declare module "zod" {
  export type ZodType<T> = {
    safeParse(value: unknown): { success: true; data: T } | { success: false; error: { flatten: () => unknown } };
  };
  type Schema<T = any> = ZodType<T> & {
    parse(value: unknown): T;
    optional(): Schema<T | undefined>;
    default(value: T): Schema<T>;
    passthrough(): Schema<T>;
    url(): Schema<T>;
    min(length: number): Schema<T>;
  };
  export const z: {
    string(): Schema<string>;
    number(): Schema<number>;
    unknown(): Schema<unknown>;
    array<T>(schema: Schema<T>): Schema<T[]>;
    record<T>(key: Schema<string>, value: Schema<T>): Schema<Record<string, T>>;
    object<T extends Record<string, Schema>>(shape: T): Schema<any>;
  };
}

declare module "vitest" {
  export const describe: any;
  export const expect: any;
  export const it: any;
}
