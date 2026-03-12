import { expectType, expectAssignable, expectNotAssignable } from "tsd";
import {
  TorideClient,
} from "../../dist/index.js";
import type {
  TorideSchema,
  DefaultSchema,
  PermissionSnapshot,
  ClientResourceRef,
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

// ─── Test Fixtures ───────────────────────────────────────────────

const snapshot: PermissionSnapshot = {
  "Document:d1": ["read", "write"],
  "Organization:o1": ["manage"],
};

// ─── T030: TorideClient<S> is generic ────────────────────────────

// Default client (no type param) behaves like today — accepts any string
const defaultClient = new TorideClient(snapshot);
expectAssignable<TorideClient<DefaultSchema>>(defaultClient);

// Typed client narrows action and resource types
const typedClient = new TorideClient<TestSchema>(snapshot);

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

// ─── T031: permittedActions() return type narrowing ──────────────

// Typed client returns the global actions union array
const typedActions = typedClient.permittedActions({ type: "Document" as const, id: "d1" });
expectType<("read" | "write" | "delete" | "manage")[]>(typedActions);

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
