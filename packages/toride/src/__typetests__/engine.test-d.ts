import { expectType, expectAssignable, expectNotAssignable } from "tsd";
import type {
  TorideSchema,
  DefaultSchema,
  ActorRef,
  ResourceRef,
  BatchCheckItem,
  ExplainResult,
  CheckOptions,
  TorideOptions,
  PermissionSnapshot,
  ConstraintResult,
} from "../index.js";
import { Toride, createToride } from "../index.js";

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

// ─── Test Fixtures ───────────────────────────────────────────────

const actor: ActorRef<TestSchema> = {
  type: "User" as const,
  id: "u1",
  attributes: { email: "a@b.com", is_admin: true },
};

const docRef: ResourceRef<TestSchema, "Document"> = {
  type: "Document" as const,
  id: "d1",
};

const orgRef: ResourceRef<TestSchema, "Organization"> = {
  type: "Organization" as const,
  id: "o1",
};

// ─── T014: Toride<S> is generic ──────────────────────────────────

// Toride without type param defaults to DefaultSchema (backward compat)
declare const defaultEngine: Toride;
expectAssignable<Toride<DefaultSchema>>(defaultEngine);

// Typed engine accepts typed options
declare const typedEngine: Toride<TestSchema>;

// ─── T015: can<R>() type narrowing ──────────────────────────────

// Valid: "read" is a Document permission
async () => {
  const result = await typedEngine.can(actor, "read", docRef);
  expectType<boolean>(result);
};

// Valid: "manage" is an Organization permission
async () => {
  const result = await typedEngine.can(actor, "manage", orgRef);
  expectType<boolean>(result);
};

// @ts-expect-error - "reed" is not a valid Document permission
typedEngine.can(actor, "reed", docRef);

// @ts-expect-error - "manage" is not a valid Document permission
typedEngine.can(actor, "manage", docRef);

// @ts-expect-error - "Docuemnt" is not a valid resource type
typedEngine.can(actor, "read", { type: "Docuemnt" as const, id: "d1" });

// Default engine accepts any strings (backward compat)
async () => {
  const result = await defaultEngine.can(
    { type: "User", id: "u1", attributes: {} },
    "anything",
    { type: "Whatever", id: "w1" },
  );
  expectType<boolean>(result);
};

// ─── T015: explain<R>() type narrowing ──────────────────────────

// Valid: "read" is a Document permission, return type has typed grantedPermissions
async () => {
  const result = await typedEngine.explain(actor, "read", docRef);
  expectType<boolean>(result.allowed);
  expectType<("read" | "write" | "delete")[]>(result.grantedPermissions);
};

// Valid: Organization permissions
async () => {
  const result = await typedEngine.explain(actor, "manage", orgRef);
  expectType<("manage" | "read")[]>(result.grantedPermissions);
};

// @ts-expect-error - "reed" is not a valid Document permission
typedEngine.explain(actor, "reed", docRef);

// ─── T016: canBatch() type narrowing ────────────────────────────

// Valid: batch items use global actions union
async () => {
  const result = await typedEngine.canBatch(actor, [
    { action: "read", resource: docRef },
    { action: "manage", resource: orgRef },
  ]);
  expectType<boolean[]>(result);
};

// @ts-expect-error - "reed" is not a valid global action
typedEngine.canBatch(actor, [{ action: "reed", resource: docRef }]);

// ─── T016: permittedActions<R>() type narrowing ─────────────────

async () => {
  const result = await typedEngine.permittedActions(actor, docRef);
  expectType<("read" | "write" | "delete")[]>(result);
};

async () => {
  const result = await typedEngine.permittedActions(actor, orgRef);
  expectType<("manage" | "read")[]>(result);
};

// ─── T016: buildConstraints<R>() type narrowing ─────────────────

// Valid: "read" is a Document permission, "Document" is a valid resource type
// T013: buildConstraints returns ConstraintResult<"Document">
async () => {
  const result = await typedEngine.buildConstraints(actor, "read", "Document");
  expectType<ConstraintResult<"Document">>(result);
};

// T013: buildConstraints returns ConstraintResult<"Organization">
async () => {
  const result = await typedEngine.buildConstraints(actor, "manage", orgRef.type as "Organization");
  expectType<ConstraintResult<"Organization">>(result);
};

// @ts-expect-error - "reed" is not a valid Document permission
typedEngine.buildConstraints(actor, "reed", "Document");

// @ts-expect-error - "Docuemnt" is not a valid resource type
typedEngine.buildConstraints(actor, "read", "Docuemnt");

// ─── T017: canField<R>() type narrowing ─────────────────────────

// Valid: typed resource
async () => {
  const result = await typedEngine.canField(actor, "read", docRef, "status");
  expectType<boolean>(result);
};

// @ts-expect-error - "Docuemnt" is not a valid resource type
typedEngine.canField(actor, "read", { type: "Docuemnt" as const, id: "d1" }, "status");

// ─── T017: permittedFields<R>() type narrowing ──────────────────

async () => {
  const result = await typedEngine.permittedFields(actor, "read", docRef);
  expectType<string[]>(result);
};

// @ts-expect-error - "Docuemnt" is not a valid resource type
typedEngine.permittedFields(actor, "read", { type: "Docuemnt" as const, id: "d1" });

// ─── T017: resolvedRoles<R>() type narrowing ────────────────────

async () => {
  const result = await typedEngine.resolvedRoles(actor, docRef);
  expectType<string[]>(result);
};

// @ts-expect-error - "Docuemnt" is not a valid resource type
typedEngine.resolvedRoles(actor, { type: "Docuemnt" as const, id: "d1" });

// ─── T017: snapshot() type narrowing ────────────────────────────

async () => {
  const result = await typedEngine.snapshot(actor, [docRef, orgRef]);
  expectType<PermissionSnapshot<TestSchema>>(result);
};

// @ts-expect-error - "Docuemnt" is not a valid resource type
typedEngine.snapshot(actor, [{ type: "Docuemnt" as const, id: "d1" }]);

// ─── T020: createToride<S>() factory ────────────────────────────

// Factory without type param creates default-typed engine
const defaultFactory = createToride({ policy: {} as any });
expectAssignable<Toride>(defaultFactory);

// Factory with type param creates typed engine
const typedFactory = createToride<TestSchema>({ policy: {} as any });
expectAssignable<Toride<TestSchema>>(typedFactory);
