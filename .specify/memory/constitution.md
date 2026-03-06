<!--
Sync Impact Report
- Version change: 0.0.0 -> 1.0.0
- Modified principles: N/A (initial constitution)
- Added sections: Core Principles (5), Technical Constraints, Governance
- Removed sections: N/A
- Templates requiring updates:
  - .specify/templates/plan-template.md: ✅ no update needed
    (Constitution Check section already references constitution file)
  - .specify/templates/spec-template.md: ✅ no update needed
    (generic template, no principle-specific references)
  - .specify/templates/tasks-template.md: ✅ no update needed
    (generic template, no principle-specific references)
- Follow-up TODOs: none
-->

# Toride Constitution

## Core Principles

### I. Security-First / Fail-Closed

Every authorization decision MUST default to **denied**. The engine
follows a strict fail-closed posture:

- No role assignment means no access; permit rules MUST NOT grant
  permissions to actors without at least one role on the resource
- Resolver errors (DB down, timeout, unknown relation) MUST result
  in denial; resolver errors MUST NEVER grant access
- `forbid` rules MUST always override `permit` rules and grants
- Cross-references follow strict null semantics: `undefined`/`null`
  MUST NEVER equal anything, including another `undefined`/`null`
- Custom evaluator errors in forbid rules MUST be treated as matched
  (access denied); errors in permit rules MUST mean the permit does
  not apply

**Rationale**: Authorization is a security boundary. Ambiguity or
failure MUST always resolve to the safe side (no access).

### II. Type-Safe Library / Zero Infrastructure

Toride MUST be a framework-agnostic, in-process TypeScript library
with zero external infrastructure requirements:

- No external service, sidecar, or network dependency for policy
  evaluation
- Full TypeScript generics: actor types, resource types, permissions,
  and roles MUST be statically checked at compile time
- Isomorphic: MUST run in Node.js, edge runtimes, and browsers
- The user provides data access via the `RelationResolver` interface;
  the engine MUST NOT own or mandate any specific data layer

**Rationale**: Authorization logic that requires external services
introduces latency, availability risk, and deployment complexity.
In-process evaluation with type safety catches policy errors early
and eliminates an entire class of runtime bugs.

### III. Explicit Over Clever

All policy behavior MUST be visible and traceable without hidden
magic:

- Policies MUST be valid YAML or JSON; no custom DSL, no embedded
  scripting
- No implicit inheritance: role grants, derived roles, and rules
  are explicitly declared per resource block
- Co-location: everything about a resource (roles, permissions,
  relations, grants, derived roles, rules) MUST live in its
  resource block
- `all` in grants means every permission on *that specific resource*,
  not a wildcard across the system
- Forbid rules are direct only; they MUST NOT propagate through
  relations to child resources

**Rationale**: Authorization policies are audited, reviewed, and
debugged by humans. Implicit behavior creates security blind spots.

### IV. Stable Public API / Semver

Public API surfaces MUST follow strict semantic versioning:

- The Constraint AST type union is a **public stable API**; breaking
  changes MUST require a major version bump
- The `RelationResolver` interface, `can()`, `canBatch()`,
  `explain()`, and `buildConstraints()` signatures are public API
- Internal implementation details (caching strategy, evaluation
  order) are NOT public API and MAY change in minor/patch releases
- Deprecations MUST be announced at least one minor version before
  removal

**Rationale**: Downstream consumers (ORM adapters, middleware,
framework integrations) depend on stable types and contracts.
Unannounced breaking changes erode trust and adoption.

### V. Test-First

Every feature MUST be developed using test-driven development:

- Tests MUST be written before implementation; they MUST fail before
  the feature code is written (red-green-refactor)
- Policy files support a declarative `tests` section for inline
  policy validation
- Integration tests MUST cover: resolver interactions, relation
  traversal, partial evaluation constraint generation, and
  forbid-overrides-permit behavior
- The `explain()` API MUST use the same code path as `can()` to
  prevent behavioral divergence between debug and production

**Rationale**: Authorization bugs are security vulnerabilities.
Test-first development ensures every rule, edge case, and
interaction is verified before it ships.

## Technical Constraints

- **Language**: TypeScript (strict mode)
- **Target runtimes**: Node.js (LTS), edge runtimes, browsers
- **Policy format**: YAML and JSON (no custom DSL)
- **Dependencies**: Minimal; avoid heavy runtime dependencies
- **Non-goals** (v1): custom DSL parser, external service
  architecture, Google-scale consistency protocols, recursive
  relation traversal
- **Relation depth**: Configurable limit (default 3 levels) for
  nested property access in conditions; separate configurable
  limit for role derivation chain depth
- **Per-check caching**: Resolver results MUST be cached within
  a single `can()` call and shared across a `canBatch()` batch
- **Cycle detection**: Path-based tracking; the same
  `(resourceType, resourceId)` pair appearing twice in one
  resolution path MUST throw an error

## Governance

This constitution supersedes all other development practices for
the Toride project. All contributions MUST comply with these
principles.

- **Amendment procedure**: Amendments MUST be documented with
  rationale, reviewed, and versioned. Use the `speckit.constitution`
  command to process changes.
- **Versioning policy**: Constitution version follows semantic
  versioning. MAJOR for principle removals/redefinitions, MINOR for
  new principles or material expansions, PATCH for clarifications.
- **Compliance review**: All PRs and design reviews MUST verify
  alignment with these principles. The plan template's
  "Constitution Check" gate MUST reference this document.
- **Complexity justification**: Any deviation from these principles
  MUST be justified in writing and tracked in the plan's Complexity
  Tracking table.

**Version**: 1.0.0 | **Ratified**: 2026-03-06 | **Last Amended**: 2026-03-06
