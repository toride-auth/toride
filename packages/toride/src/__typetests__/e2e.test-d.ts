/**
 * End-to-end type test: full type flow from codegen schema output through
 * engine methods to client-side permission checks.
 *
 * Covers: US1 (typed checks), US2 (typed resolvers), US3 (typed actors),
 * US4 (codegen schema), US5 (typed batch/explain), US6 (typed client).
 */
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
  CheckOptions,
  PermissionSnapshot,
  ClientResourceRef,
} from "../../dist/index.js";
import { Toride, createToride, TorideClient } from "../../dist/index.js";

// ═══════════════════════════════════════════════════════════════════════
// Step 1: Simulated codegen output (GeneratedSchema)
// This mirrors what @toride/codegen would produce from a policy YAML.
// ═══════════════════════════════════════════════════════════════════════

interface GeneratedSchema extends TorideSchema {
  resources: "Document" | "Organization" | "Task";
  actions: "read" | "write" | "delete" | "manage";
  actorTypes: "User" | "ServiceAccount";
  permissionMap: {
    Document: "read" | "write" | "delete";
    Organization: "manage" | "read";
    Task: "read" | "write";
  };
  roleMap: {
    Document: "owner" | "editor" | "viewer";
    Organization: "admin" | "member";
    Task: "assignee";
  };
  resourceAttributeMap: {
    Document: { status: string; ownerId: string };
    Organization: { plan: string };
    Task: { priority: number; assigneeId: string };
  };
  actorAttributeMap: {
    User: { email: string; is_admin: boolean };
    ServiceAccount: { scope: string };
  };
  relationMap: {
    Document: { org: "Organization" };
    Organization: Record<string, string>;
    Task: { doc: "Document" };
  };
}

// ═══════════════════════════════════════════════════════════════════════
// Step 2: Schema satisfies TorideSchema
// ═══════════════════════════════════════════════════════════════════════

expectAssignable<TorideSchema>({} as GeneratedSchema);

// ═══════════════════════════════════════════════════════════════════════
// Step 3: Typed actor refs (US3)
// ═══════════════════════════════════════════════════════════════════════

// Valid actors
const userActor: ActorRef<GeneratedSchema> = {
  type: "User" as const,
  id: "u1",
  attributes: { email: "alice@example.com", is_admin: false },
};

const saActor: ActorRef<GeneratedSchema> = {
  type: "ServiceAccount" as const,
  id: "sa1",
  attributes: { scope: "read:all" },
};

// Invalid actor type
expectNotAssignable<ActorRef<GeneratedSchema>>({
  type: "Robot" as const,
  id: "r1",
  attributes: {},
});

// Invalid actor attributes (wrong shape)
expectNotAssignable<ActorRef<GeneratedSchema>>({
  type: "User" as const,
  id: "u1",
  attributes: { emal: "typo@example.com", is_admin: true },
});

// ═══════════════════════════════════════════════════════════════════════
// Step 4: Typed resource refs (US1)
// ═══════════════════════════════════════════════════════════════════════

const docRef: ResourceRef<GeneratedSchema, "Document"> = {
  type: "Document" as const,
  id: "d1",
};

const orgRef: ResourceRef<GeneratedSchema, "Organization"> = {
  type: "Organization" as const,
  id: "o1",
};

const taskRef: ResourceRef<GeneratedSchema, "Task"> = {
  type: "Task" as const,
  id: "t1",
  attributes: { priority: 1, assigneeId: "u1" },
};

// Invalid resource type via constraint
// @ts-expect-error - "Docuemnt" does not satisfy constraint
type BadRef = ResourceRef<GeneratedSchema, "Docuemnt">;

// ═══════════════════════════════════════════════════════════════════════
// Step 5: Typed resolvers (US2)
// ═══════════════════════════════════════════════════════════════════════

// Valid resolvers with correct attribute shapes
const resolvers: Resolvers<GeneratedSchema> = {
  Document: async (ref) => {
    expectType<"Document">(ref.type);
    return { status: "published", ownerId: "u1" };
  },
  Organization: async (ref) => {
    expectType<"Organization">(ref.type);
    return { plan: "enterprise" };
  },
  Task: async (ref) => {
    expectType<"Task">(ref.type);
    return { priority: 1, assigneeId: "u1" };
  },
};

// Invalid resolver key
expectNotAssignable<Resolvers<GeneratedSchema>>({
  NonExistent: async () => ({}),
});

// Typed ResourceResolver for a specific resource
const docResolver: ResourceResolver<GeneratedSchema, "Document"> = async (ref) => {
  return { status: "draft", ownerId: "u2" };
};

// ═══════════════════════════════════════════════════════════════════════
// Step 6: Construct typed Toride engine (US1)
// ═══════════════════════════════════════════════════════════════════════

// Engine with typed options
const typedEngine = createToride<GeneratedSchema>({
  policy: {} as any,
  resolvers: {
    Document: async (ref) => ({ status: "active", ownerId: "u1" }),
    Task: async (ref) => ({ priority: 2, assigneeId: "u1" }),
  },
});
expectAssignable<Toride<GeneratedSchema>>(typedEngine);

// Unparameterized engine still works (backward compat)
const defaultEngine = createToride({ policy: {} as any });
expectAssignable<Toride>(defaultEngine);
expectAssignable<Toride<DefaultSchema>>(defaultEngine);

// ═══════════════════════════════════════════════════════════════════════
// Step 7: Typed can() calls (US1 — core value proposition)
// ═══════════════════════════════════════════════════════════════════════

// Valid: "read" is a Document permission
async () => {
  const result = await typedEngine.can(userActor, "read", docRef);
  expectType<boolean>(result);
};

// Valid: "manage" is an Organization permission
async () => {
  const result = await typedEngine.can(userActor, "manage", orgRef);
  expectType<boolean>(result);
};

// Valid: "write" is a Task permission
async () => {
  const result = await typedEngine.can(saActor, "write", taskRef);
  expectType<boolean>(result);
};

// @ts-expect-error - "reed" is not a valid Document permission (typo!)
typedEngine.can(userActor, "reed", docRef);

// @ts-expect-error - "manage" is not a valid Document permission (wrong resource)
typedEngine.can(userActor, "manage", docRef);

// @ts-expect-error - "Docuemnt" is not a valid resource type (typo!)
typedEngine.can(userActor, "read", { type: "Docuemnt" as const, id: "d1" });

// Default engine accepts any strings (backward compat)
async () => {
  await defaultEngine.can(
    { type: "Anything", id: "a1", attributes: {} },
    "whatever",
    { type: "Something", id: "s1" },
  );
};

// ═══════════════════════════════════════════════════════════════════════
// Step 8: Typed explain() (US5)
// ═══════════════════════════════════════════════════════════════════════

async () => {
  const result = await typedEngine.explain(userActor, "read", docRef);
  expectType<boolean>(result.allowed);
  // grantedPermissions is narrowed to Document permissions
  expectType<("read" | "write" | "delete")[]>(result.grantedPermissions);
};

async () => {
  const result = await typedEngine.explain(userActor, "manage", orgRef);
  // grantedPermissions is narrowed to Organization permissions
  expectType<("manage" | "read")[]>(result.grantedPermissions);
};

// @ts-expect-error - "reed" is not a valid Document permission
typedEngine.explain(userActor, "reed", docRef);

// ═══════════════════════════════════════════════════════════════════════
// Step 9: Typed canBatch() (US5)
// ═══════════════════════════════════════════════════════════════════════

async () => {
  const results = await typedEngine.canBatch(userActor, [
    { action: "read", resource: docRef },
    { action: "manage", resource: orgRef },
    { action: "write", resource: taskRef },
  ]);
  expectType<boolean[]>(results);
};

// @ts-expect-error - "reed" is not a valid global action
typedEngine.canBatch(userActor, [{ action: "reed", resource: docRef }]);

// ═══════════════════════════════════════════════════════════════════════
// Step 10: Typed permittedActions() (US5)
// ═══════════════════════════════════════════════════════════════════════

async () => {
  const actions = await typedEngine.permittedActions(userActor, docRef);
  expectType<("read" | "write" | "delete")[]>(actions);
};

async () => {
  const actions = await typedEngine.permittedActions(userActor, taskRef);
  expectType<("read" | "write")[]>(actions);
};

// ═══════════════════════════════════════════════════════════════════════
// Step 11: Typed buildConstraints() (US5)
// ═══════════════════════════════════════════════════════════════════════

async () => {
  await typedEngine.buildConstraints(userActor, "read", "Document");
};

// @ts-expect-error - "Docuemnt" is not a valid resource type
typedEngine.buildConstraints(userActor, "read", "Docuemnt");

// @ts-expect-error - "reed" is not a valid Document permission
typedEngine.buildConstraints(userActor, "reed", "Document");

// ═══════════════════════════════════════════════════════════════════════
// Step 12: Typed canField() and permittedFields() (US5)
// ═══════════════════════════════════════════════════════════════════════

async () => {
  const result = await typedEngine.canField(userActor, "read", docRef, "status");
  expectType<boolean>(result);
};

async () => {
  const fields = await typedEngine.permittedFields(userActor, "read", docRef);
  expectType<string[]>(fields);
};

// @ts-expect-error - Invalid resource type
typedEngine.canField(userActor, "read", { type: "Docuemnt" as const, id: "d1" }, "status");

// ═══════════════════════════════════════════════════════════════════════
// Step 13: Typed resolvedRoles() (US5)
// ═══════════════════════════════════════════════════════════════════════

async () => {
  const roles = await typedEngine.resolvedRoles(userActor, docRef);
  expectType<string[]>(roles);
};

// @ts-expect-error - Invalid resource type
typedEngine.resolvedRoles(userActor, { type: "Docuemnt" as const, id: "d1" });

// ═══════════════════════════════════════════════════════════════════════
// Step 14: Typed snapshot() (US5)
// ═══════════════════════════════════════════════════════════════════════

async () => {
  const snap = await typedEngine.snapshot(userActor, [docRef, orgRef, taskRef]);
  expectType<PermissionSnapshot>(snap);
};

// @ts-expect-error - Invalid resource type
typedEngine.snapshot(userActor, [{ type: "Docuemnt" as const, id: "d1" }]);

// ═══════════════════════════════════════════════════════════════════════
// Step 15: Typed TorideClient (US6)
// ═══════════════════════════════════════════════════════════════════════

const snapshot: PermissionSnapshot = {
  "Document:d1": ["read", "write"],
  "Organization:o1": ["manage"],
  "Task:t1": ["read"],
};

const typedClient = new TorideClient<GeneratedSchema>(snapshot);

// Valid: "read" is a valid action, "Document" is a valid resource
const canResult = typedClient.can("read", { type: "Document" as const, id: "d1" });
expectType<boolean>(canResult);

// Valid: "manage" is a valid action for Organization
typedClient.can("manage", { type: "Organization" as const, id: "o1" });

// @ts-expect-error - "reed" is not a valid action
typedClient.can("reed", { type: "Document" as const, id: "d1" });

// @ts-expect-error - "Docuemnt" is not a valid resource type
typedClient.can("read", { type: "Docuemnt" as const, id: "d1" });

// Typed permittedActions
const permitted = typedClient.permittedActions({ type: "Document" as const, id: "d1" });
expectType<("read" | "write" | "delete" | "manage")[]>(permitted);

// @ts-expect-error - Invalid resource type
typedClient.permittedActions({ type: "Docuemnt" as const, id: "d1" });

// Typed ClientResourceRef
const typedRef: ClientResourceRef<GeneratedSchema> = { type: "Document", id: "d1" };
expectType<"Document" | "Organization" | "Task">(typedRef.type);

// ═══════════════════════════════════════════════════════════════════════
// Step 16: Default (unparameterized) backward compatibility
// ═══════════════════════════════════════════════════════════════════════

// Default client accepts any strings
const defaultClient = new TorideClient(snapshot);
defaultClient.can("anything", { type: "Whatever", id: "w1" });

const defaultRef: ClientResourceRef = { type: "anything", id: "d1" };
expectType<string>(defaultRef.type);

// Default engine accepts any strings
async () => {
  await defaultEngine.can(
    { type: "X", id: "1", attributes: {} },
    "any-action",
    { type: "any-resource", id: "1" },
  );
};

// Default resolvers accept any keys
const defaultResolvers: Resolvers = {
  AnyResource: async () => ({}),
};
expectAssignable<Resolvers>(defaultResolvers);
