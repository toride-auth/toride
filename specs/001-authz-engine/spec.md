# Feature Specification: Toride Authorization Engine

**Feature Branch**: `001-authz-engine`
**Created**: 2026-03-06
**Status**: Draft
**Input**: User description: "Relation-aware authorization engine — a framework-agnostic TypeScript library combining resource-centric policies, relation-based role derivation, permit/forbid rules, and partial evaluation for data filtering."
**Architecture Reference**: `docs/spec.md` (Architecture Specification v1.1) — authoritative source for all design decisions, API surface, policy format, and implementation details.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Define and Enforce Resource Permissions (Priority: P1)

A developer integrating Toride into their application defines a YAML policy declaring resources (e.g., Organization, Project, Task), roles, permissions, and grants. They instantiate the engine with a resolver and call `can()` to check whether an actor has a specific permission on a resource. The engine evaluates direct role assignments, grants, and returns an allow/deny decision with default-deny semantics.

**Why this priority**: This is the foundational authorization check — without it, no other feature has value. Every application needs basic "can this user do this action on this resource?" checks.

**Independent Test**: Can be fully tested by loading a policy with one resource, assigning a role via the resolver, and verifying `can()` returns the correct allow/deny decision.

**Acceptance Scenarios**:

1. **Given** a policy with a Task resource granting `[read, update]` to the `editor` role, **When** an actor with the `editor` role on Task:42 calls `can(actor, "update", Task:42)`, **Then** the result is `true`.
2. **Given** the same policy, **When** an actor with the `viewer` role (granted only `[read]`) calls `can(actor, "update", Task:42)`, **Then** the result is `false`.
3. **Given** the same policy, **When** an actor with no role on Task:42 calls `can(actor, "read", Task:42)`, **Then** the result is `false` (default deny).
4. **Given** a role granted `[all]`, **When** the actor checks any permission on that resource, **Then** the result is `true` for every declared permission.

---

### User Story 2 - Derive Roles Through Relations and Global Roles (Priority: P1)

A developer configures derived roles so that an Organization admin automatically becomes a Project admin (via the `org` relation), and a superadmin (global role derived from actor attributes) gets owner access everywhere. The engine traverses relations, evaluates global role conditions, and grants derived roles without explicit per-resource assignments.

**Why this priority**: Relation-based role derivation is Toride's core differentiator over simpler libraries like CASL. Without it, every role must be explicitly assigned per resource, which doesn't scale.

**Independent Test**: Can be tested by setting up a two-resource policy (Organization + Project) with a derived role, assigning a role on the parent, and verifying the child resource inherits the expected permissions.

**Acceptance Scenarios**:

1. **Given** a Project with `derived_roles: [role: admin, from_role: admin, on_relation: org]`, **When** an actor has `admin` on Organization:1 and Project:5's org relation points to Organization:1, **Then** `can(actor, "delete", Project:5)` returns `true` (admin gets `[all]`).
2. **Given** a global role `superadmin` with condition `$actor.isSuperAdmin: true`, and a resource deriving `owner` from `superadmin`, **When** an actor with `isSuperAdmin: true` checks any permission, **Then** access is granted.
3. **Given** a Task with `derived_roles: [role: editor, from_relation: assignee]`, **When** the actor's ID matches the assignee relation, **Then** the actor gets the `editor` role on that Task.
4. **Given** a derived role with `actor_type: User` and a `when` condition on `$actor.department`, **When** a ServiceAccount actor is checked, **Then** the derived role entry is silently skipped.

---

### User Story 3 - Apply Conditional Permit and Forbid Rules (Priority: P1)

A developer adds ABAC rules to their policy: a `permit` rule that grants `read` to viewers when `resource.isPublic: true`, and a `forbid` rule that blocks `delete` when `resource.archived: true`. The engine evaluates conditions against resource attributes and enforces forbid-wins precedence.

**Why this priority**: Conditional rules enable attribute-based access control on top of role-based grants, which is essential for real-world policies where access depends on resource state.

**Independent Test**: Can be tested by defining a resource with a forbid rule, providing resource attributes via the resolver, and verifying that the forbid rule overrides grants.

**Acceptance Scenarios**:

1. **Given** a permit rule granting `read` to `viewer` when `resource.isPublic: true`, **When** a viewer checks `read` on a public resource, **Then** access is granted.
2. **Given** a forbid rule blocking `delete` when `resource.archived: true`, **When** an admin (who has `delete` via grants) checks `delete` on an archived resource, **Then** access is denied.
3. **Given** both a permit and forbid rule match for the same permission, **When** the check is evaluated, **Then** forbid always wins.
4. **Given** a permit rule's conditions match but the actor has no role on the resource, **When** the check is evaluated, **Then** access is denied (permit requires at least one role).

---

### User Story 4 - Filter Data Using Partial Evaluation (Priority: P2)

A developer calls `buildConstraints(actor, "read", "Task")` to get a constraint AST describing which Tasks the actor can read. They translate this AST to a Prisma WHERE clause using a `ConstraintAdapter` and query only accessible records, avoiding O(n) per-record checks.

**Why this priority**: Partial evaluation is critical for list views and data-heavy applications. Without it, developers must either over-fetch and filter in-memory or build custom query logic, defeating the purpose of a policy engine.

**Independent Test**: Can be tested by calling `buildConstraints()`, inspecting the returned constraint AST, and verifying it correctly represents the policy logic as composable query conditions.

**Acceptance Scenarios**:

1. **Given** a superadmin actor, **When** `buildConstraints()` is called, **Then** the result has `unrestricted: true`.
2. **Given** an actor with no roles and no derivation paths, **When** `buildConstraints()` is called, **Then** the result has `forbidden: true`.
3. **Given** an actor with `editor` role derived via a relation, **When** `buildConstraints()` is called, **Then** the constraints include a `has_role` node referencing the actor and role.
4. **Given** a condition referencing `$actor.department`, **When** partial evaluation occurs, **Then** the actor's department value is inlined into a concrete `field_eq` constraint.
5. **Given** constraints translated via a Prisma adapter, **When** used in `prisma.task.findMany({ where })`, **Then** only authorized records are returned.

---

### User Story 5 - Debug Authorization Decisions (Priority: P2)

A developer uses `explain()` to understand why an actor was denied access. The response shows all resolved roles (direct and derived with derivation paths), granted permissions, matched rules, and the final decision. They also use `permittedActions()` and `resolvedRoles()` for UI and debugging.

**Why this priority**: Without observability, authorization bugs are extremely difficult to diagnose. Explain is essential for both development-time debugging and production audit logging.

**Independent Test**: Can be tested by calling `explain()` on any authorization scenario and verifying the response contains complete role derivation traces, rule match details, and a clear final decision.

**Acceptance Scenarios**:

1. **Given** any authorization scenario, **When** `explain()` is called, **Then** the response includes `resolvedRoles` (with derivation paths), `grantedPermissions`, `matchedRules`, and `finalDecision`.
2. **Given** an actor with multiple derivation paths to the same role, **When** `explain()` is called, **Then** all paths are shown (exhaustive evaluation).
3. **Given** an actor and resource, **When** `permittedActions()` is called, **Then** a list of all permitted action strings is returned.
4. **Given** an actor and resource, **When** `resolvedRoles()` is called, **Then** both direct and derived roles are returned.

---

### User Story 6 - Validate Policies at Load Time (Priority: P2)

A developer loads a YAML policy file. The engine validates it strictly: undeclared roles in grants, unknown relations in derived_roles, invalid operators in conditions, and `$actor` attribute references not matching actor declarations all produce clear error messages with logical paths to the offending node.

**Why this priority**: Catching policy errors early prevents runtime authorization failures. Clear error messages with paths reduce debugging time significantly.

**Independent Test**: Can be tested by loading intentionally invalid policies and verifying that specific, path-annotated error messages are thrown.

**Acceptance Scenarios**:

1. **Given** a policy referencing a role in grants that isn't declared in `roles`, **When** loaded, **Then** a `ValidationError` is thrown with a message like `resources.Task.grants references undeclared role "edtor"`.
2. **Given** a policy with `$actor.nonExistent` in a condition where the actor type doesn't declare that attribute, **When** loaded, **Then** a validation error is thrown.
3. **Given** a valid policy, **When** loaded, **Then** no errors are thrown and the engine is ready to use.

---

### User Story 7 - Sync Permissions to Client for UI Hints (Priority: P3)

A developer calls `snapshot()` on the server to build a permission map for specific resources, sends it to the frontend, and uses `TorideClient` for instant synchronous `can()` checks to show/hide UI elements. Unknown resources return `false`.

**Why this priority**: Client-side permission checks enable responsive UIs without round-trips, but they are hints only — the server always re-checks on mutations. This is a DX enhancement, not a core authorization feature.

**Independent Test**: Can be tested by generating a snapshot on the server, creating a `TorideClient` with it, and verifying synchronous checks return correct results including `false` for unknown resources.

**Acceptance Scenarios**:

1. **Given** a snapshot containing `Task:42: ["read", "update"]`, **When** `client.can("read", Task:42)` is called, **Then** the result is `true` (synchronous).
2. **Given** the same snapshot, **When** `client.can("delete", Task:42)` is called, **Then** the result is `false`.
3. **Given** a resource not in the snapshot, **When** `client.can("read", Task:99)` is called, **Then** the result is `false`.

---

### User Story 8 - Test Policies Declaratively in YAML (Priority: P3)

A developer writes test cases in YAML (inline in the policy or in separate test files) with inline mocks for roles, relations, and attributes. They run `npx toride test` to validate that their policy produces expected allow/deny decisions without needing a real database or resolver.

**Why this priority**: Declarative tests make policy development faster and more reliable, but developers can also test with code-based integration tests. This is a productivity enhancement.

**Independent Test**: Can be tested by writing a YAML test file with mock data and running the test runner to verify pass/fail results.

**Acceptance Scenarios**:

1. **Given** a test case with `expected: allow` and mocked roles/relations that satisfy the policy, **When** the test runner executes, **Then** the test passes.
2. **Given** a test case with `expected: deny` and mocked data that triggers a forbid rule, **When** the test runner executes, **Then** the test passes.
3. **Given** a test with an actor having `isSuperAdmin: true`, **When** the test evaluates, **Then** the global role `superadmin` is derived from attributes (no mock override).

---

### User Story 9 - Control Field-Level Access (Priority: P3)

A developer defines `field_access` on an Employee resource to restrict salary visibility to `hr_admin` and `manager` roles. They call `canField()` and `permittedFields()` to check and list accessible fields per actor.

**Why this priority**: Field-level access is important for sensitive data but is an optional enhancement — most resources don't need it, and it builds on the core role resolution already established.

**Independent Test**: Can be tested by defining a resource with `field_access`, resolving an actor's role, and verifying `canField()` and `permittedFields()` return correct results.

**Acceptance Scenarios**:

1. **Given** `field_access: salary: { read: [hr_admin] }`, **When** a `manager` calls `canField(actor, "read", Employee:42, "salary")`, **Then** the result is `false`.
2. **Given** the same policy, **When** an `hr_admin` calls `canField(actor, "read", Employee:42, "salary")`, **Then** the result is `true`.
3. **Given** a field not listed in `field_access`, **When** any role with the resource-level permission checks that field, **Then** access is granted (unlisted fields are unrestricted).

---

### Edge Cases

- What happens when a resolver method throws an error? Access is denied (fail-closed). Resolver errors never grant access.
- What happens when `$actor.department` is `undefined` and `$resource.department` is `undefined`? Cross-reference returns `false` (strict null semantics — undefined never equals undefined).
- What happens when a derived role chain creates a cycle (e.g., A references B references A)? Path-based cycle detection throws an error for the specific resolution path.
- What happens when a derived role's `when` condition references an attribute not declared on the actor type? The derived role entry is silently skipped for that actor type.
- What happens when `setPolicy()` is called while `can()` checks are in-flight? In-flight checks complete with the old policy; new checks use the new policy (atomic swap).
- What happens when a custom evaluator throws in a forbid rule? The forbid is treated as matched (access denied) — fail-closed.
- What happens when a custom evaluator throws in a permit rule? The permit does not apply (no access granted).
- What happens when a `canBatch()` call includes resources sharing the same relation target? The resolver result is cached and reused across all checks in the batch.
- What happens when `buildConstraints()` encounters a custom evaluator? It emits an `{ type: "unknown", name: "..." }` constraint node for the adapter to handle.

## Clarifications

### Session 2026-03-06

- Q: What is the package structure for this project? → A: Monorepo with scoped packages (`toride` as main engine, plus `@toride/codegen`, `@toride/prisma`, `@toride/drizzle` as separate workspace packages using pnpm workspaces). Per architecture spec section 11.
- Q: What is $env and how is it provided? → A: Runtime context bag passed per-check as an option (e.g., `{ env: { now: new Date(), ip: req.ip } }`). Already specified in architecture spec sections 4.3 and 7.3.
- Q: Should TorideClient use a subpath export (toride/client) or be a direct export? → A: Subpath export (`toride/client`) for tree-shaking — server apps don't need client code. Matches architecture spec section 7.11.
- Q: What minimum Node.js version should Toride target? → A: Node.js 20+ (current LTS).
- Q: Should the toride package ship as ESM-only or dual ESM/CJS? → A: ESM-only. Node 20+ has stable ESM support, and named exports work best with ESM.
- Q: What YAML parsing library should be used? → A: `yaml` (npm package). YAML 1.2 compliant, good error messages with source positions.
- Q: What schema validation approach for policy validation? → A: Valibot. Lightweight, TypeScript-first schema validation with small bundle size.
- Q: What testing framework for the library's own test suite? → A: Vitest. ESM-native, TypeScript support out of the box.
- Q: What build tool for compiling/bundling TypeScript packages? → A: tsup. Simple, fast bundler built on esbuild with .d.ts generation.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST parse and validate YAML and JSON policy files at load time, rejecting invalid policies with error messages that include the logical path to the offending node.
- **FR-002**: System MUST support multiple actor types with declared attributes, and validate `$actor` attribute references against actor declarations.
- **FR-003**: System MUST evaluate global roles by matching actor type and evaluating `when` conditions against actor attributes.
- **FR-004**: System MUST resolve roles from five sources: direct assignment, relation-based derivation, relation identity, global role derivation, and actor attribute conditions.
- **FR-005**: System MUST evaluate all derivation paths exhaustively for every role check (no short-circuit after first match).
- **FR-006**: System MUST enforce default-deny semantics — no matched role or rule results in denial.
- **FR-007**: System MUST enforce forbid-wins precedence — a matched forbid rule overrides all permits and grants.
- **FR-008**: System MUST only evaluate permit and forbid rules for actors who have at least one role on the resource.
- **FR-009**: System MUST support the full condition expression syntax: equality, comparison operators (`gt`, `gte`, `lt`, `lte`), set operations (`in`, `includes`), existence checks, pattern operators (`startsWith`, `endsWith`, `contains`), negation (`neq`), cross-references (`$actor`, `$resource`, `$env`), and logical combinators (`any`, `all`).
- **FR-010**: System MUST enforce strict null semantics — `undefined`/`null` never equals anything, including another `undefined`/`null`.
- **FR-011**: System MUST cache all resolver results per `can()` check and share the cache across `canBatch()` checks.
- **FR-012**: System MUST detect cycles in relation traversal using path-based tracking and throw an error when a cycle is found.
- **FR-013**: System MUST support configurable depth limits for condition nesting (default: 3) and derived role chain traversal (default: 5).
- **FR-014**: System MUST fail closed on resolver errors — any resolver exception results in access denied.
- **FR-015**: System MUST provide `can()`, `canBatch()`, `permittedActions()`, `resolvedRoles()`, and `explain()` APIs.
- **FR-016**: System MUST provide `buildConstraints()` returning a `ConstraintResult` with `unrestricted`, `forbidden`, or `constraints` sentinels, and `translateConstraints()` for adapter-based translation.
- **FR-017**: System MUST inline `$actor` and `$env` values during partial evaluation and emit `has_role` constraint nodes for relation-based derived roles.
- **FR-018**: System MUST provide a `ConstraintAdapter` interface with methods for `translate`, `relation`, `hasRole`, `unknown`, `and`, `or`, and `not`.
- **FR-019**: System MUST support field-level access control via `field_access` sections with `canField()` and `permittedFields()` APIs.
- **FR-020**: System MUST provide `snapshot()` for server-side permission map generation and `TorideClient` for synchronous client-side checks.
- **FR-021**: System MUST support declarative YAML tests with inline mocks for roles, relations, and attributes, asserting only allow/deny outcomes.
- **FR-022**: System MUST support `setPolicy()` for atomic runtime policy updates — in-flight checks use the old policy, new checks use the new policy.
- **FR-023**: System MUST support `mergePolicies()` for additive policy composition with conflict detection for grants and silent append for rules.
- **FR-024**: System MUST emit asynchronous, non-blocking audit events via `onDecision` and `onQuery` callbacks.
- **FR-025**: System MUST support custom evaluators registered in code, with `unknown` constraint nodes emitted during partial evaluation.
- **FR-026**: System MUST support the `all` keyword in grants, resolving dynamically at check time to all declared permissions on the resource.
- **FR-027**: System MUST provide a codegen tool (`@toride/codegen`) that generates TypeScript types for actions, resources, and a fully typed `RelationResolver` interface from policy files.
- **FR-028**: System MUST provide reference `ConstraintAdapter` implementations for Prisma (`@toride/prisma`) and Drizzle (`@toride/drizzle`).
- **FR-029**: System MUST resolve `cardinality: many` relations in conditions using ANY (exists) semantics.
- **FR-030**: System MUST provide a CLI with `toride validate` (errors only), `toride validate --strict` (includes static analysis warnings), and `toride test` with glob pattern support.

### Key Entities

- **Policy**: The top-level authorization configuration containing actor declarations, global roles, resource blocks, and optional tests. Expressed as valid YAML or JSON.
- **Actor**: An entity performing actions — has a type (e.g., User, ServiceAccount), an ID, and typed attributes used for global role and derived role evaluation.
- **Resource**: A protected entity — declares roles, permissions, relations to other resources, grants, derived roles, conditional rules, and optional field access controls.
- **Role**: A named label on a resource (e.g., viewer, editor, admin) that maps to permissions via grants. Can be directly assigned or derived through multiple patterns.
- **Relation**: A typed connection between resources (e.g., Task belongs to Project) with cardinality (one or many), enabling cross-resource role derivation and nested condition evaluation.
- **Global Role**: A role derived purely from actor attributes and type, not tied to any specific resource instance. Applied via `derived_roles` entries referencing `from_global_role`.
- **Constraint AST**: A structured tree describing conditions a resource must satisfy for an actor to have a specific permission — the output of partial evaluation, translated to ORM queries via adapters.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers can define a complete authorization policy (actors, global roles, resources with relations, grants, derived roles, and rules) and enforce it with a single `can()` call within 30 minutes of first use.
- **SC-002**: Authorization checks where the resolver returns from cache complete in sub-millisecond time (engine overhead is negligible).
- **SC-003**: Policy validation catches 100% of structural errors (undeclared roles, unknown relations, invalid operators, mismatched actor attributes) at load time with actionable error messages.
- **SC-004**: Partial evaluation via `buildConstraints()` produces correct constraint ASTs that, when translated to ORM queries, return exactly the set of records the actor is authorized to access.
- **SC-005**: `explain()` provides complete role derivation traces showing every path evaluated, enabling developers to diagnose authorization issues without manual debugging.
- **SC-006**: Client-side `TorideClient` checks are synchronous and instant (no network round-trips), enabling responsive UI permission hints.
- **SC-007**: Declarative YAML tests enable developers to validate policy behavior without writing integration test code or setting up a database.
- **SC-008**: The library works as a zero-infrastructure, in-process dependency — no external services, no custom DSL parsers, no additional runtime requirements beyond Node.js.

## Assumptions

- The project is structured as a pnpm monorepo with scoped packages: `toride` (core engine), `@toride/codegen`, `@toride/prisma`, and `@toride/drizzle`.
- Minimum Node.js version: 20+ (current LTS). ESM-only module format.
- Toolchain: pnpm workspaces, tsup (build), Vitest (testing), `yaml` (YAML parsing), Valibot (schema validation).
- Developers using Toride are building TypeScript/JavaScript applications and are familiar with YAML configuration.
- The resolver pattern (developer-provided data bridge) is acceptable — developers are willing to implement `getRoles()`, `getRelated()`, and `getAttributes()` for their data layer.
- Policies are small enough to hold in memory (hundreds to low thousands of resources, not millions). Google-scale is a non-goal.
- Recursive relation traversal (e.g., folder-in-folder trees) is deferred to a future version.
- Multi-tenancy isolation is the resolver's responsibility — the engine remains tenant-agnostic.
- Framework middleware (Express, Hono, etc.) is provided as documentation examples, not shipped packages (may change based on demand).
