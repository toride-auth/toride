# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0] - 2026-04-02

### Added
- Simplified constraint API with ok-based results returning ForbiddenError on denial, providing structured error context
- Nested attribute schema types (object/array) with recursive validation and depth-limiting in policy parser
- Policy JSON Schema generation for IDE integration (autocomplete and validation in YAML policies)
- Array attribute types (string[], number[], boolean[]) in policy definitions
- Shared VirtualFieldMapping and VirtualFieldsConfig types in toride core for ORM-agnostic virtual field support
- Prisma payload type utilities (ModelScalars, PayloadRelations, VirtualFieldMappingFor) for compile-time virtual field validation
- virtualFields support in createPrismaAdapter with schema-aware typed configuration
- virtualFields support in createDrizzleAdapter mirroring the Prisma adapter pattern
- prisma-app example project demonstrating end-to-end authorization with Hono, Prisma, and HTMX

### Changed
- Migrated dev container from .devcontainer to .worktree with multi-stage builds
- Adapted update-docs workflow for toride docs site
- Migrated orchestration to takt and improved review pipeline

## [0.3.0] - 2026-03-13

### Added
- Deep type safety with per-resource type narrowing across the entire API surface
- Phantom type parameters on `ConstraintResult<R>`, `ConstraintAdapter<TQueryMap>`, `PermissionSnapshot<S>`, and `ClientResourceRef<S, R>`
- `canField<R>()` now validates field names at compile time against `resourceAttributeMap`
- `resolvedRoles<R>()` returns per-resource role unions instead of `string[]`
- `can()` and `permittedActions()` narrow action types per resource
- `TQueryMap` generic on `createPrismaAdapter()` and `createDrizzleAdapter()` for per-resource query output typing

### Changed
- **BREAKING**: `ConstraintAdapter<TQuery>` changed to `ConstraintAdapter<TQueryMap extends Record<string, unknown>>`
- **BREAKING**: `translateConstraints()` now accepts `ConstraintResult<R>` instead of `Constraint` — callers must pass the full `buildConstraints()` result
- **BREAKING**: `permittedFields<R>()` returns typed field union arrays instead of `string[]`

## [0.2.0] - 2026-03-12

### Added
- End-to-end type safety with generic `TorideSchema` — all packages now accept a schema type parameter that narrows actions, resources, and resolver types at compile time
- Default resolver — resources with inline attributes now work without registering a `ResourceResolver`, with full docs and JSDoc

### Changed
- Simplified devcontainer init script and added worktree lifecycle hooks
- Removed deprecated devcontainer infrastructure and lifecycle files

### Fixed
- Claude Code OAuth token injection into devcontainer from macOS Keychain

## [0.1.0] - 2026-03-08

### Added
- Relation-aware authorization engine with `can()` API supporting direct roles, grants, default-deny, and `all` keyword
- Derived roles via relations and global roles
- Conditional permit/forbid rules with forbid-wins precedence
- Partial evaluation with constraint ASTs, translation, and simplification
- Debug authorization decisions with `explain()`, helpers, and audit callbacks
- Policy validation at load time with comprehensive checks, strict mode, and CLI
- Sync permissions to client for UI hints
- Declarative YAML test policies with mock resolver, test runner, and CLI
- Field-level access control
- GraphQL resolver pattern with per-type resolvers, inline attributes, and relation traversal
- Satellite packages: `@toride/codegen`, `@toride/drizzle`, `@toride/prisma`
- Benchmark suite with CI regression detection

### Fixed
- Correct pinned SHA for actions/deploy-pages v4
- Add docs to pnpm workspace to fix CI build
- Add actions:read permission for nx-set-shas
