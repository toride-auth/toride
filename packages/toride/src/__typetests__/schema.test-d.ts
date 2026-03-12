import { expectType, expectAssignable, expectNotAssignable } from "tsd";
import type {
  TorideSchema,
  DefaultSchema,
  ActorRef,
  ResourceRef,
  Resolvers,
  ResourceResolver,
  TorideOptions,
  BatchCheckItem,
  ExplainResult,
} from "../../dist/index.js";

// ─── Test Schema ─────────────────────────────────────────────────
// A concrete schema with literal types, simulating codegen output.

interface TestSchema extends TorideSchema {
  resources: "Document" | "Organization";
  actions: "read" | "write" | "delete" | "manage";
  actorTypes: "User" | "ServiceAccount";
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
    User: { email: string; is_admin: boolean };
    ServiceAccount: { scope: string };
  };
  relationMap: {
    Document: { org: "Organization" };
    Organization: Record<string, string>;
  };
}

// ─── T007: TorideSchema assignability ────────────────────────────
// TestSchema should be assignable to TorideSchema
expectAssignable<TorideSchema>({} as TestSchema);

// DefaultSchema should be assignable to TorideSchema
expectAssignable<TorideSchema>({} as DefaultSchema);

// ─── T008: ActorRef<DefaultSchema> collapses to current shape ────
// When no type parameter is given, ActorRef should match the old shape.
type OldActorRef = {
  readonly type: string;
  readonly id: string;
  readonly attributes: Record<string, unknown>;
};

expectAssignable<ActorRef>({} as OldActorRef);
expectAssignable<OldActorRef>({} as ActorRef);

// ActorRef<DefaultSchema> is the same as ActorRef (no param)
expectAssignable<ActorRef<DefaultSchema>>({} as ActorRef);
expectAssignable<ActorRef>({} as ActorRef<DefaultSchema>);

// ─── T008: ActorRef<TestSchema> discriminated union ──────────────
// Valid actor types are accepted
const userActor = {
  type: "User" as const,
  id: "u1",
  attributes: { email: "a@b.com", is_admin: true },
} as const;
expectAssignable<ActorRef<TestSchema>>(userActor);

const saActor = {
  type: "ServiceAccount" as const,
  id: "sa1",
  attributes: { scope: "read" },
} as const;
expectAssignable<ActorRef<TestSchema>>(saActor);

// Invalid actor type should be rejected
expectNotAssignable<ActorRef<TestSchema>>({
  type: "Usr" as const,
  id: "u1",
  attributes: { email: "a@b.com", is_admin: true },
});

// ─── T009: ResourceRef<DefaultSchema> collapses to current shape ─
type OldResourceRef = {
  readonly type: string;
  readonly id: string;
  readonly attributes?: Record<string, unknown>;
};

expectAssignable<ResourceRef>({} as OldResourceRef);
expectAssignable<OldResourceRef>({} as ResourceRef);

// ─── T009: ResourceRef<TestSchema, R> typed attributes ───────────
const docRef = {
  type: "Document" as const,
  id: "d1",
  attributes: { status: "published", ownerId: "u1" },
} as const;
expectAssignable<ResourceRef<TestSchema, "Document">>(docRef);

// Invalid resource type should be rejected via constraint
// @ts-expect-error - "Docment" does not satisfy constraint S["resources"]
type BadRef = ResourceRef<TestSchema, "Docment">;

// ─── T010: Resolvers<TestSchema> mapped type ─────────────────────
// Valid resolvers: keys are narrowed to resource names
const resolvers: Resolvers<TestSchema> = {
  Document: async (ref) => ({ status: "published", ownerId: "u1" }),
  Organization: async (ref) => ({ plan: "pro" }),
};
expectAssignable<Resolvers<TestSchema>>(resolvers);

// Invalid resolver key should be rejected
expectNotAssignable<Resolvers<TestSchema>>({
  InvalidResource: async () => ({}),
});

// ─── T010: ResourceResolver<TestSchema, R> ───────────────────────
// Resolver for Document receives typed ref
const docResolver: ResourceResolver<TestSchema, "Document"> = async (ref) => {
  expectType<"Document">(ref.type);
  return { status: "published", ownerId: "u1" };
};

// ─── T011: TorideOptions<TestSchema> ─────────────────────────────
// TorideOptions should accept typed resolvers
const opts: TorideOptions<TestSchema> = {
  policy: {} as any,
  resolvers: {
    Document: async (ref) => ({ status: "published", ownerId: "u1" }),
  },
};
expectAssignable<TorideOptions<TestSchema>>(opts);

// Unparameterized TorideOptions still works (backward compat)
const defaultOpts: TorideOptions = {
  policy: {} as any,
  resolvers: {
    AnyString: async (ref) => ({}),
  },
};
expectAssignable<TorideOptions>(defaultOpts);

// ─── T011: BatchCheckItem<TestSchema> ────────────────────────────
// Action narrowed to global actions union
const batchItem: BatchCheckItem<TestSchema> = {
  action: "read",
  resource: { type: "Document", id: "d1" },
};
expectAssignable<BatchCheckItem<TestSchema>>(batchItem);

// Invalid action should be rejected
expectNotAssignable<BatchCheckItem<TestSchema>>({
  action: "fly",
  resource: { type: "Document", id: "d1" },
});

// ─── T011: ExplainResult<TestSchema, "Document"> ─────────────────
// grantedPermissions typed as permission union array
declare const explainDoc: ExplainResult<TestSchema, "Document">;
expectType<("read" | "write" | "delete")[]>(explainDoc.grantedPermissions);

// Default ExplainResult has string[] grantedPermissions (backward compat)
declare const explainDefault: ExplainResult;
expectType<string[]>(explainDefault.grantedPermissions);
