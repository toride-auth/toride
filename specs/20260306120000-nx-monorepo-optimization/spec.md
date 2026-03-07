# Feature Specification: Nx Monorepo Optimization & AI Agent Context

**Feature Branch**: `add-nx`
**Created**: 2026-03-06
**Status**: Draft
**Input**: User description: "add nx to improve the monorepo optimization and context optimization for ai agents"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - AI Agent Understands Package Boundaries (Priority: P1)

A developer using Claude Code on the toride monorepo asks for help modifying the `@toride/drizzle` package. Claude Code automatically reads the per-package AGENTS.md and understands the package's purpose, dependencies (depends on `toride` core), build tooling (tsup), and what it exports — without loading irrelevant code from `@toride/prisma` or `@toride/codegen`.

**Why this priority**: The primary motivation for adding Nx. AI agents waste context window on irrelevant packages, leading to worse suggestions and slower responses.

**Independent Test**: Can be tested by verifying that AGENTS.md files exist per package with correct dependency/scope information, and that CLAUDE.md symlinks point to them.

**Acceptance Scenarios**:

1. **Given** a developer opens the monorepo in Claude Code, **When** they ask about the `@toride/drizzle` package, **Then** Claude Code reads `packages/drizzle/AGENTS.md` (via CLAUDE.md symlink) and understands the package scope, dependencies, and conventions without needing to scan unrelated packages.
2. **Given** a developer asks Claude Code to add a feature to `toride` core, **When** Claude Code determines affected packages, **Then** it can identify downstream dependents (`codegen`, `drizzle`, `prisma`) from the Nx project graph metadata documented in AGENTS.md.
3. **Given** each package has an AGENTS.md, **When** any AI tool (not just Claude Code) reads the file, **Then** it gets a tool-agnostic description of the package's role, boundaries, and dependencies.

---

### User Story 2 - Fast Cached Builds with Nx (Priority: P2)

A developer runs `nx run-many -t build` and only packages with changed source files rebuild. Subsequent runs with no changes complete instantly via Nx's local computation cache.

**Why this priority**: Reduces feedback loop during development. The monorepo has 4 packages with inter-dependencies — rebuilding all on every change is wasteful.

**Independent Test**: Can be tested by running build twice and verifying the second run is a cache hit (near-zero time).

**Acceptance Scenarios**:

1. **Given** all packages have been built, **When** a developer runs `nx run-many -t build` with no source changes, **Then** all tasks are restored from cache and complete in under 2 seconds.
2. **Given** only `toride` core source files changed, **When** a developer runs `nx affected -t build`, **Then** only `toride` and its dependents (`codegen`, `drizzle`, `prisma`) rebuild, not unrelated packages.
3. **Given** a developer modifies only `@toride/drizzle`, **When** they run `nx affected -t build`, **Then** only `@toride/drizzle` rebuilds (since no other package depends on it).

---

### User Story 3 - Targeted Test Runs (Priority: P2)

A developer runs `nx affected -t test` and only tests for changed packages and their dependents execute, rather than the entire test suite.

**Why this priority**: Same value as cached builds — faster feedback. Tied with US2 because tests are the primary development feedback mechanism.

**Independent Test**: Can be tested by modifying one package and verifying only relevant tests run.

**Acceptance Scenarios**:

1. **Given** only `@toride/prisma` source changed, **When** a developer runs `nx affected -t test`, **Then** only `@toride/prisma` tests run (no downstream dependents).
2. **Given** `toride` core changed, **When** a developer runs `nx affected -t test`, **Then** tests for `toride`, `codegen`, `drizzle`, and `prisma` all run (since they depend on core).

---

### User Story 4 - CI Pipeline with Nx (Priority: P3)

A pull request triggers a GitHub Actions CI workflow that uses Nx affected commands to only build, test, and lint packages affected by the PR's changes — reducing CI time compared to running everything.

**Why this priority**: Important for development velocity but less urgent than local development experience. Builds on the Nx setup from US2/US3.

**Independent Test**: Can be tested by opening a PR that changes one package and verifying CI only runs tasks for affected packages.

**Acceptance Scenarios**:

1. **Given** a PR changes only `@toride/drizzle`, **When** CI runs, **Then** only `@toride/drizzle` build, test, and lint tasks execute.
2. **Given** a PR changes `toride` core, **When** CI runs, **Then** build, test, and lint run for all 4 packages (all depend on core).
3. **Given** a PR changes only documentation or non-source files, **When** CI runs, **Then** no build/test tasks execute (cache or no affected projects).

---

### User Story 5 - Nx Project Graph for Dependency Visibility (Priority: P3)

A developer or AI agent can run `nx graph` or `nx show project <name>` to visualize or query the dependency relationships between packages. This information is also captured in AGENTS.md for passive consumption.

**Why this priority**: Useful for understanding the codebase but not blocking for daily development.

**Independent Test**: Can be tested by running `nx graph` and verifying it shows the correct dependency tree.

**Acceptance Scenarios**:

1. **Given** the monorepo has Nx configured, **When** a developer runs `nx graph`, **Then** a dependency graph shows `toride` as core with `codegen`, `drizzle`, and `prisma` depending on it.
2. **Given** a developer runs `nx show project @toride/drizzle`, **Then** the output shows the project's targets, tags, and dependencies.

---

### Edge Cases

- What happens when a new package is added to `packages/`? Nx should auto-detect it via pnpm workspace integration without manual configuration.
- What happens when circular dependencies are introduced? Nx should detect and report them.
- What happens when the Nx cache becomes stale or corrupted? Developers should be able to clear it with `nx reset`.
- What happens when AGENTS.md content drifts from actual project configuration? The spec should recommend keeping AGENTS.md in sync manually or via a generation step.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The monorepo MUST have Nx initialized with an `nx.json` configuration file at the root, integrated with the existing pnpm workspace.
- **FR-002**: Each package MUST have Nx-compatible project configuration (inferred from `package.json` or explicit `project.json`) with `build`, `test`, and `lint` targets.
- **FR-003**: Nx task caching MUST be enabled for `build`, `test`, and `lint` targets with correct `inputs` and `outputs` configuration.
- **FR-004**: The `build` target MUST respect dependency ordering — `toride` core builds before `codegen`, `drizzle`, and `prisma`.
- **FR-005**: Root-level scripts in `package.json` MUST be updated to use Nx commands (`nx run-many -t build`, `nx run-many -t test`, `nx run-many -t lint`) replacing the current `pnpm -r run build`, `vitest run`, and `tsc --build --noEmit`.
- **FR-006**: Each package MUST have an `AGENTS.md` file containing: package purpose, public API summary, dependency relationships, build/test commands, and conventions.
- **FR-007**: Each package MUST have a `CLAUDE.md` symlink pointing to `AGENTS.md` in the same directory.
- **FR-008**: The root `CLAUDE.md` MUST be updated with Nx commands and monorepo navigation instructions for AI agents.
- **FR-009**: Nx project tags MUST be assigned to each package (e.g., `type:core`, `type:integration`, `type:codegen`) to classify packages by role.
- **FR-010**: A GitHub Actions CI workflow MUST be created that runs `nx affected -t build test lint` on pull requests.
- **FR-011**: The CI workflow MUST use Nx's `nx-set-shas` action (or equivalent) to correctly determine the base SHA for affected detection.
- **FR-012**: The `.gitignore` MUST be updated to exclude Nx cache directories (`.nx/cache`).

### Key Entities

- **Nx Workspace Configuration** (`nx.json`): Defines task pipelines, caching inputs/outputs, default settings, and project tags.
- **Project Configuration**: Per-package build/test/lint targets, either inferred from `package.json` or explicit in `project.json`.
- **AGENTS.md**: Per-package AI agent context file describing package scope, dependencies, APIs, and conventions.
- **CI Workflow**: GitHub Actions configuration using Nx affected commands for optimized PR checks.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Repeated builds with no source changes complete in under 2 seconds (cache hit).
- **SC-002**: Changing a single satellite package (e.g., `@toride/drizzle`) and running affected build/test only processes that one package, not all four.
- **SC-003**: Every package has an AGENTS.md file that an AI agent can read to understand the package without scanning source code.
- **SC-004**: CI pipeline only runs tasks for PR-affected packages, reducing average CI time compared to running all tasks unconditionally.
- **SC-005**: `nx graph` correctly visualizes the dependency tree: `toride` core with three dependents (`codegen`, `drizzle`, `prisma`).
- **SC-006**: A developer new to the repo can understand package relationships by reading AGENTS.md files without needing to trace import statements.

## Assumptions

- The existing pnpm workspace structure (`packages/*`) will be preserved. Nx layers on top without restructuring directories.
- `tsup` remains the build tool for all packages. Nx orchestrates when tsup runs, not how.
- `vitest` remains the test runner. Nx orchestrates when vitest runs, not how.
- `tsc --build` remains the lint/typecheck mechanism.
- No Nx Cloud or remote caching is needed at this stage. Local caching is sufficient.
- No Nx plugins beyond the core are required — the setup uses Nx's package-based monorepo approach with inferred targets.
