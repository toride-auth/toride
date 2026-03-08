# Research: Sync Documentation with Implementation

## R1: Current Resolver API Surface

**Decision**: The actual API uses `Resolvers = Record<string, ResourceResolver>` where `ResourceResolver = (ref: ResourceRef) => Promise<Record<string, unknown>>`.

**Findings**:
- `ResourceResolver` is a per-type function that takes a `ResourceRef` and returns a flat object of attributes
- Relation references are returned as `ResourceRef` objects within the attributes (e.g., `project: { type: "Project", id: "123" }`)
- For `many` cardinality, return an array of `ResourceRef` objects
- Non-relation fields (like `status`, `isPublic`) are plain attribute values
- `TorideOptions.resolvers` is optional — engine works without resolvers if all data is inline on `ResourceRef.attributes`
- The `Resolvers` map is keyed by resource type name (e.g., `"Task"`, `"Project"`)

**Source**: `packages/toride/src/types.ts:38-47`, `packages/toride/src/index.ts`

## R2: Role Resolution Architecture (FR-008)

**Decision**: `getRoles` was removed. All roles are derived through `derived_roles` policy entries. Direct roles are always empty.

**Findings**:
- `resolveDirectRoles()` in `evaluation/role-resolver.ts` always returns `{ direct: [], derived: [] }`
- Comment: "FR-008: No more getRoles — direct roles always empty."
- Five derivation patterns remain: global_role, from_role+on_relation, from_relation, actor_type+when, when-only
- Relation traversal for derived roles uses `AttributeCache.resolve()` to fetch attributes, then checks for `ResourceRef` objects in the returned attributes

**Source**: `packages/toride/src/evaluation/role-resolver.ts:26-35`

## R3: Docs Already Using Correct Pattern

**Decision**: Most concept and integration pages already use the correct `resolvers` map pattern. No changes needed for these files.

**Verified correct files**:
- `docs/concepts/roles-and-relations.md` — Shows correct `resolvers` map with Task and Project examples
- `docs/concepts/conditions-and-rules.md` — Uses correct `resolvers` map
- `docs/concepts/partial-evaluation.md` — Uses correct `resolvers` map
- `docs/concepts/client-side-hints.md` — Uses correct pattern
- `docs/concepts/policy-format.md` — Minimal code, correct
- `docs/integrations/prisma.md` — Uses correct `resolvers` map + `createPrismaResolver`
- `docs/integrations/drizzle.md` — Uses correct `resolvers` map + `createDrizzleResolver`
- `docs/integrations/codegen.md` — Shows correct `ResolverMap` type

## R4: VitePress Config and Cross-Links to spec.md

**Decision**: No sidebar or cross-links reference `spec.md`. Safe to delete without config changes.

**Findings**:
- `docs/.vitepress/config.ts` does not contain "spec" anywhere
- No Markdown files in `docs/` link to `spec.md` or `/spec`
- `spec.md` is a standalone orphan page

## R5: Quickstart Rewrite Approach

**Decision**: Use pseudocode DB calls (e.g., `db.task.findById`) consistent with other concept pages. Show Task + Project dual-resolver pattern matching `roles-and-relations.md`.

**Rationale**: Keeps documentation style consistent across the site. The `roles-and-relations.md` page already has a well-structured example that quickstart should align with.

**Key changes for quickstart**:
1. Replace `RelationResolver` with `resolvers` map in engine constructor
2. Remove `getRoles`, `getRelated`, `getAttributes` methods — show per-type functions returning flat objects
3. Add `actor_type + when` derived_role to Project (department-based) so roles originate without `getRoles`
4. Update "How it works" explanation to describe derived role evaluation flow
5. Update resolver explanation table: one row per resolver function, not three methods
