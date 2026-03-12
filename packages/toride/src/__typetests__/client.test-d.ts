import { expectType, expectAssignable, expectNotAssignable } from "tsd";
import {
  TorideClient,
} from "../index.js";
import type {
  TorideSchema,
  DefaultSchema,
  PermissionSnapshot,
  ClientResourceRef,
} from "../index.js";

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

const typedSnapshot = {
  "Document:d1": ["read", "write"],
  "Organization:o1": ["manage"],
} as PermissionSnapshot<TestSchema>;

const defaultSnapshot: PermissionSnapshot = {
  "Document:d1": ["read", "write"],
  "Organization:o1": ["manage"],
};

// ─── T030: TorideClient<S> is generic ────────────────────────────

// Default client (no type param) behaves like today — accepts any string
const defaultClient = new TorideClient(defaultSnapshot);
expectAssignable<TorideClient<DefaultSchema>>(defaultClient);

// Typed client narrows action and resource types
const typedClient = new TorideClient<TestSchema>(typedSnapshot);

// ─── T030: can() type narrowing ──────────────────────────────────

// Valid: "read" is a valid action, "Document" is a valid resource
const canResult = typedClient.can("read", { type: "Document" as const, id: "d1" });
expectType<boolean>(canResult);

// Valid: "manage" is a valid action, "Organization" is a valid resource
typedClient.can("manage", { type: "Organization" as const, id: "o1" });

// @ts-expect-error - "reed" is not a valid action
typedClient.can("reed", { type: "Document" as const, id: "d1" });

// @ts-expect-error - "Docuemnt" is not a valid resource type
typedClient.can("read", { type: "Docuemnt" as const, id: "d1" });

// Default client accepts any strings (backward compat)
const defaultCanResult = defaultClient.can("anything", { type: "Whatever", id: "w1" });
expectType<boolean>(defaultCanResult);

// ─── T028: Per-resource action narrowing on can() ────────────────

// @ts-expect-error - "manage" is NOT a Document permission (only read | write | delete)
typedClient.can("manage", { type: "Document" as const, id: "d1" });

// @ts-expect-error - "write" is NOT an Organization permission (only manage | read)
typedClient.can("write", { type: "Organization" as const, id: "o1" });

// @ts-expect-error - "delete" is NOT an Organization permission
typedClient.can("delete", { type: "Organization" as const, id: "o1" });

// Valid: "read" is a Document permission
typedClient.can("read", { type: "Document" as const, id: "d1" });

// Valid: "write" is a Document permission
typedClient.can("write", { type: "Document" as const, id: "d1" });

// Valid: "delete" is a Document permission
typedClient.can("delete", { type: "Document" as const, id: "d1" });

// Valid: "manage" is an Organization permission
typedClient.can("manage", { type: "Organization" as const, id: "o1" });

// Valid: "read" is an Organization permission
typedClient.can("read", { type: "Organization" as const, id: "o1" });

// ─── T031: permittedActions() return type narrowing ──────────────

// Typed client returns per-resource permission array for Document
const typedDocActions = typedClient.permittedActions({ type: "Document" as const, id: "d1" });
expectType<("read" | "write" | "delete")[]>(typedDocActions);

// Typed client returns per-resource permission array for Organization
const typedOrgActions = typedClient.permittedActions({ type: "Organization" as const, id: "o1" });
expectType<("manage" | "read")[]>(typedOrgActions);

// @ts-expect-error - "Docuemnt" is not a valid resource type
typedClient.permittedActions({ type: "Docuemnt" as const, id: "d1" });

// Default client returns string[]
const defaultActions = defaultClient.permittedActions({ type: "Whatever", id: "w1" });
expectType<string[]>(defaultActions);

// ─── ClientResourceRef<S> type narrowing ─────────────────────────

// Typed ClientResourceRef narrows type to S["resources"]
const typedRef: ClientResourceRef<TestSchema> = { type: "Document", id: "d1" };
expectType<"Document" | "Organization">(typedRef.type);

// @ts-expect-error - "Invalid" is not a valid resource type
const invalidRef: ClientResourceRef<TestSchema> = { type: "Invalid", id: "d1" };

// Default ClientResourceRef accepts any string
const defaultRef: ClientResourceRef = { type: "anything", id: "d1" };
expectType<string>(defaultRef.type);
