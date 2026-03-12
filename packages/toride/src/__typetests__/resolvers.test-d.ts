import { expectType, expectAssignable, expectNotAssignable } from "tsd";
import type {
  TorideSchema,
  DefaultSchema,
  Resolvers,
  ResourceResolver,
  TorideOptions,
} from "../index.js";
import { Toride, createToride } from "../index.js";

// ─── Test Schema ─────────────────────────────────────────────────

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

// ─── T022: Resolver key narrowing ────────────────────────────────

// Valid: resolver keys are resource type names
const validResolvers: Resolvers<TestSchema> = {
  Document: async (ref) => {
    expectType<"Document">(ref.type);
    return { status: "published", ownerId: "u1" };
  },
  Organization: async (ref) => {
    expectType<"Organization">(ref.type);
    return { plan: "pro" };
  },
};

// Invalid resolver key should be rejected
expectNotAssignable<Resolvers<TestSchema>>({
  InvalidResource: async () => ({}),
});

// ─── T022: Resolver return type enforcement ──────────────────────

// ResourceResolver ref parameter is typed
const docResolver: ResourceResolver<TestSchema, "Document"> = async (ref) => {
  expectType<"Document">(ref.type);
  return { status: "draft", ownerId: "u1" };
};

// ─── T022: Resolvers in TorideOptions ────────────────────────────

// Typed TorideOptions accepts typed resolvers
const opts: TorideOptions<TestSchema> = {
  policy: {} as any,
  resolvers: {
    Document: async (ref) => ({ status: "active", ownerId: "u2" }),
  },
};

// Can construct a typed Toride with typed resolvers
const engine = createToride<TestSchema>({
  policy: {} as any,
  resolvers: {
    Document: async (ref) => ({ status: "active", ownerId: "u2" }),
    Organization: async (ref) => ({ plan: "enterprise" }),
  },
});
expectAssignable<Toride<TestSchema>>(engine);

// ─── T022: Default schema resolvers accept any keys ──────────────

// Backward compat: default resolvers accept any string keys
const defaultResolvers: Resolvers = {
  AnyResourceType: async (ref) => ({}),
  AnotherType: async (ref) => ({ anything: "works" }),
};
expectAssignable<Resolvers>(defaultResolvers);

// Default TorideOptions accepts any resolvers
const defaultOpts: TorideOptions = {
  policy: {} as any,
  resolvers: {
    Whatever: async (ref) => ({}),
  },
};
expectAssignable<TorideOptions>(defaultOpts);
