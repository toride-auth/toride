import { expectType, expectAssignable } from "tsd";
import type { TorideSchema, DefaultSchema, ResourceRef } from "toride";
import { createDrizzleResolver } from "../../dist/index.js";

// ─── Test Schema ─────────────────────────────────────────────────

interface TestSchema extends TorideSchema {
  resources: "Document" | "Organization";
  actions: "read" | "write" | "delete" | "manage";
  actorTypes: "User";
  permissionMap: {
    Document: "read" | "write" | "delete";
    Organization: "manage" | "read";
  };
  roleMap: {
    Document: "editor" | "viewer";
    Organization: "admin" | "member";
  };
  resourceAttributeMap: {
    Document: { status: string; ownerId: string };
    Organization: { plan: string };
  };
  actorAttributeMap: {
    User: { email: string };
  };
  relationMap: {
    Document: { org: "Organization" };
    Organization: Record<string, string>;
  };
}

// ─── T035: Typed Drizzle resolver narrows return type ────────────

// With explicit schema + resource type, return type narrows
const docResolver = createDrizzleResolver<TestSchema, "Document">(
  {} as any,
  {} as any,
);
const docResult = docResolver({} as ResourceRef<TestSchema, "Document">);
expectType<Promise<{ status: string; ownerId: string }>>(docResult);

// Organization resolver narrows to Organization attributes
const orgResolver = createDrizzleResolver<TestSchema, "Organization">(
  {} as any,
  {} as any,
);
const orgResult = orgResolver({} as ResourceRef<TestSchema, "Organization">);
expectType<Promise<{ plan: string }>>(orgResult);

// ─── T035: Options pass through ──────────────────────────────────

const resolverWithOpts = createDrizzleResolver<TestSchema, "Document">(
  {} as any,
  {} as any,
  { idColumn: "docId" },
);
expectType<
  (ref: ResourceRef<TestSchema, "Document">) => Promise<{ status: string; ownerId: string }>
>(resolverWithOpts);

// ─── T035: Default schema preserves backward compatibility ───────

const defaultResolver = createDrizzleResolver({} as any, {} as any);
const defaultResult = defaultResolver({} as ResourceRef);
expectType<Promise<Record<string, unknown>>>(defaultResult);

// Default resolver is assignable to a function returning Record<string, unknown>
expectAssignable<(ref: ResourceRef) => Promise<Record<string, unknown>>>(defaultResolver);
