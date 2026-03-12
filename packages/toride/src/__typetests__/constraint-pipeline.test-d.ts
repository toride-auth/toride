/**
 * T012: Constraint pipeline type tests.
 *
 * Tests that buildConstraints returns ConstraintResult<R> and
 * translateConstraints returns TQueryMap[R] — the full pipeline
 * carries resource type information end-to-end.
 */
import { expectType, expectAssignable, expectNotAssignable } from "tsd";
import type {
  TorideSchema,
  DefaultSchema,
  ActorRef,
  ResourceRef,
  ConstraintResult,
  ConstraintAdapter,
  LeafConstraint,
  Constraint,
} from "../index.js";
import { Toride, createToride } from "../index.js";

// ─── Test Schema ─────────────────────────────────────────────────

interface PipelineSchema extends TorideSchema {
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

// ─── Test Query Map (simulating Prisma-like adapter output) ──────

type DocumentWhereInput = { status?: string; ownerId?: string };
type OrganizationWhereInput = { plan?: string };

type TestQueryMap = {
  Document: DocumentWhereInput;
  Organization: OrganizationWhereInput;
};

// ─── Test Fixtures ───────────────────────────────────────────────

const actor: ActorRef<PipelineSchema> = {
  type: "User" as const,
  id: "u1",
  attributes: { email: "a@b.com" },
};

declare const typedEngine: Toride<PipelineSchema>;
declare const defaultEngine: Toride;

// ─── Typed adapter ───────────────────────────────────────────────

declare const typedAdapter: ConstraintAdapter<TestQueryMap>;

// ─── Test: buildConstraints returns ConstraintResult<R> ──────────

async () => {
  const result = await typedEngine.buildConstraints(actor, "read", "Document");
  // Result should be ConstraintResult<"Document">
  expectType<ConstraintResult<"Document">>(result);
};

async () => {
  const result = await typedEngine.buildConstraints(actor, "manage", "Organization");
  // Result should be ConstraintResult<"Organization">
  expectType<ConstraintResult<"Organization">>(result);
};

// ─── Test: translateConstraints returns TQueryMap[R] ─────────────

async () => {
  const result = await typedEngine.buildConstraints(actor, "read", "Document");
  if ("constraints" in result) {
    const where = typedEngine.translateConstraints(result, typedAdapter);
    // Should be DocumentWhereInput (i.e., TQueryMap["Document"])
    expectType<DocumentWhereInput>(where);
  }
};

async () => {
  const result = await typedEngine.buildConstraints(actor, "manage", "Organization");
  if ("constraints" in result) {
    const where = typedEngine.translateConstraints(result, typedAdapter);
    // Should be OrganizationWhereInput (i.e., TQueryMap["Organization"])
    expectType<OrganizationWhereInput>(where);
  }
};

// ─── Test: Invalid resource/action combos produce errors ─────────

// @ts-expect-error - "manage" is not a valid Document permission
typedEngine.buildConstraints(actor, "manage", "Document");

// @ts-expect-error - "Docuemnt" is not a valid resource type
typedEngine.buildConstraints(actor, "read", "Docuemnt");

// @ts-expect-error - "write" is not a valid Organization permission
typedEngine.buildConstraints(actor, "write", "Organization");

// ─── Test: DefaultSchema degrades gracefully ─────────────────────

async () => {
  const result = await defaultEngine.buildConstraints(
    { type: "User", id: "u1", attributes: {} },
    "anything",
    "AnyResource",
  );
  // Default schema: ConstraintResult<"AnyResource"> is assignable to ConstraintResult<string>
  expectAssignable<ConstraintResult<string>>(result);
};

declare const untypedAdapter: ConstraintAdapter;

async () => {
  const result = await defaultEngine.buildConstraints(
    { type: "User", id: "u1", attributes: {} },
    "read",
    "Document",
  );
  // With default adapter (untyped)
  if ("constraints" in result) {
    const where = defaultEngine.translateConstraints(result, untypedAdapter);
    // Default: unknown (TQueryMap[string] where TQueryMap = Record<string, unknown>)
    expectType<unknown>(where);
  }
};

// ─── Test: ConstraintResult phantom type ─────────────────────────

// ConstraintResult<"Document"> is not assignable to ConstraintResult<"Organization">
declare const docResult: ConstraintResult<"Document">;
expectNotAssignable<ConstraintResult<"Organization">>(docResult);

// ConstraintResult<string> is the base type
expectAssignable<ConstraintResult<string>>(docResult);
