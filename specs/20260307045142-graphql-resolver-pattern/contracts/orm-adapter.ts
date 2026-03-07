/**
 * Contract: ORM adapter pattern for @toride/drizzle and @toride/prisma.
 *
 * Both packages export thin adapter functions that wrap ORM queries
 * into the new per-type resolver signature.
 */

import type { ResourceRef } from "./core-api.js";

// ─── @toride/drizzle ─────────────────────────────────────────────

/**
 * Creates a resolver function for a Drizzle table.
 * Wraps a Drizzle select query into the ResourceResolver signature.
 */
export declare function createDrizzleResolver(
  db: unknown, // DrizzleInstance
  table: unknown, // AnyTable
  options?: {
    /** Column used as the resource ID. Defaults to "id". */
    idColumn?: string;
  },
): (ref: ResourceRef) => Promise<Record<string, unknown>>;

// ─── @toride/prisma ──────────────────────────────────────────────

/**
 * Creates a resolver function for a Prisma model.
 * Wraps a Prisma findUnique query into the ResourceResolver signature.
 */
export declare function createPrismaResolver(
  client: unknown, // PrismaClient
  modelName: string,
  options?: {
    /** Fields to select. Defaults to all scalar fields. */
    select?: Record<string, boolean>;
  },
): (ref: ResourceRef) => Promise<Record<string, unknown>>;
