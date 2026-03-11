# Research: Default Resolver Formalization

## R-001: Is the default resolver behavior already implemented?

**Decision**: Yes — the behavior is fully implemented in `AttributeCache.doResolve()`.

**Rationale**: `packages/toride/src/evaluation/cache.ts` lines 96-101 show that when `!resolver`, the engine returns `allInline` (merged seeded + ref inline attributes). This is the "trivial resolver" path. No code changes are needed.

**Alternatives considered**: None — this is a formalization feature, not a new implementation.

## R-002: Existing test coverage for default resolver scenarios

**Decision**: Existing `inline-attributes.test.ts` covers the core scenarios but frames them as "inline attributes" tests, not "default resolver" tests. A new dedicated test file will make the contract explicit.

**Rationale**: The existing tests (Scenario 1: inline-only, Scenario 3: no resolver + no inline = undefined) already verify the behavior. However, the spec requires "dedicated, clearly named test cases" (FR-004) that frame this as the default resolver contract. A separate file avoids cluttering the existing test structure.

**Alternatives considered**:
- Reorganize existing tests: Rejected — would change test structure for an existing, passing test file.
- Add describe block to existing file: Rejected — user preference for separate dedicated file.

## R-003: JSDoc best practices for TypeScript library types

**Decision**: Use descriptive JSDoc text on all target types. Add `@example` block only on `TorideOptions.resolvers` (highest developer visibility in IDE tooltips).

**Rationale**: Best practice for library JSDoc:
- Type aliases (`ResourceResolver`, `Resolvers`): descriptive text explaining optional nature and fallback.
- Interface properties (`TorideOptions.resolvers`): `@example` showing resolver-less usage — this is the first thing devs see in autocomplete.
- `AttributeCache` class: descriptive JSDoc on the class explaining resolution strategy (already partially present).

**Alternatives considered**:
- `@example` on all types: Rejected — code examples on type aliases are less useful and add clutter.
- Descriptive text only: Rejected — missing the high-impact IDE tooltip example on `TorideOptions.resolvers`.

## R-004: VitePress docs page structure

**Decision**: Create `docs/concepts/resolvers.md` and add sidebar entry in `docs/.vitepress/config.ts`.

**Rationale**: Resolvers are a core mental model concept (like conditions, roles, partial evaluation). The Concepts section is for understanding *how things work*, while Guide is for step-by-step tutorials. The page should cover:
1. What resolvers do
2. The default resolver concept (inline attributes as fallback)
3. Merge precedence (inline wins)
4. Code examples: inline-only, resolver + inline merge, no data = deny

**Alternatives considered**:
- Guide section: Rejected — resolvers are conceptual, not a step-by-step tutorial.
- Integrations section: Rejected — resolvers are core engine, not ORM-specific.

## R-005: Merge precedence behavior confirmation

**Decision**: Inline attributes take precedence over resolver results (field-by-field merge: `{ ...resolved, ...allInline }`).

**Rationale**: Confirmed in `cache.ts` line 111: `const merged = { ...resolved, ...allInline }`. The spread order means `allInline` keys overwrite `resolved` keys. This is the documented behavior in the spec (FR-002) and matches existing tests.

**Alternatives considered**: N/A — this is an existing, tested behavior being documented.
