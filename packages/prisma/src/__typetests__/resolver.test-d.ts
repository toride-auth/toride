import { expectType, expectAssignable } from "tsd";
import type { TorideSchema, DefaultSchema, ResourceRef } from "toride";
import { createPrismaResolver } from "../../dist/index.js";

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

// ─── T036: Typed Prisma resolver narrows return type ─────────────

// With explicit schema + resource type, return type narrows
const docResolver = createPrismaResolver<TestSchema, "Document">(
  {} as any,
  "Document",
);
const docResult = docResolver({} as ResourceRef<TestSchema, "Document">);
expectType<Promise<{ status: string; ownerId: string }>>(docResult);

// Organization resolver narrows to Organization attributes
const orgResolver = createPrismaResolver<TestSchema, "Organization">(
  {} as any,
  "Organization",
);
const orgResult = orgResolver({} as ResourceRef<TestSchema, "Organization">);
expectType<Promise<{ plan: string }>>(orgResult);

// ─── T036: modelName is typed as R ──────────────────────────────

// modelName parameter accepts the resource type string
const resolverWithSelect = createPrismaResolver<TestSchema, "Document">(
  {} as any,
  "Document",
  { select: { status: true } },
);
expectType<
  (ref: ResourceRef<TestSchema, "Document">) => Promise<{ status: string; ownerId: string }>
>(resolverWithSelect);

// ─── T036: Default schema preserves backward compatibility ───────

// When using default schema with a string variable, R infers as string
const modelName: string = "anyModel";
const defaultResolver = createPrismaResolver({} as any, modelName);
const defaultResult = defaultResolver({} as ResourceRef);
expectType<Promise<Record<string, unknown>>>(defaultResult);

// Default resolver is assignable to a function returning Record<string, unknown>
expectAssignable<(ref: ResourceRef) => Promise<Record<string, unknown>>>(defaultResolver);
