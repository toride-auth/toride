# Implementation Plan: Prisma Example App

**Branch**: `add-example` | **Date**: 2026-03-11 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/20260311120000-prisma-example-app/spec.md`

## Summary

Build a standalone example app in `examples/prisma-app/` that demonstrates toride + @toride/prisma integration. The app uses Hono (JSX SSR) + htmx + Prisma + SQLite to show role-based data filtering (`buildConstraints`), mutation authorization (`can`), and permitted action checks (`permittedActions`). Three pre-seeded users with different roles showcase how toride enforces authorization at both the query and mutation layers.

## Technical Context

**Language/Version**: TypeScript (strict mode), Node.js 20+ LTS
**Primary Dependencies**: hono, @hono/node-server, toride (^0.1.0), @toride/prisma (^0.1.0), @prisma/client, prisma, tsx, yaml, htmx (CDN)
**Storage**: SQLite via Prisma (file-based, `prisma/dev.db`)
**Testing**: None (demo app, manual verification only)
**Target Platform**: Node.js server, browser (HTML/htmx)
**Project Type**: Standalone example web application (NOT a workspace member)
**Performance Goals**: N/A (example app)
**Constraints**: Zero external services, < 5 setup commands, npm-published dependencies only
**Scale/Scope**: 3 users, 3 projects, ~6 tasks, 6 HTTP routes

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Security-First / Fail-Closed | PASS | Example uses toride's default-deny semantics. All mutations check `can()` before executing. `buildConstraints()` returns `forbidden` when no access. |
| II. Type-Safe Library / Zero Infrastructure | PASS | Example demonstrates toride as an in-process library. SQLite = zero infrastructure. TypeScript strict mode. |
| III. Explicit Over Clever | PASS | Policy is a standalone YAML file matching the docs quickstart pattern. No hidden magic — all authorization logic is visible in policy.yaml. |
| IV. Stable Public API / Semver | PASS | Example uses only public API: `can()`, `buildConstraints()`, `translateConstraints()`, `permittedActions()`, `loadYaml()`, `createPrismaAdapter()`, `createPrismaResolver()`. |
| V. Test-First | N/A | This is an example app, not a library feature. No new library code is being written. The example demonstrates existing tested functionality. |

**Post-Phase 1 Re-check**: All principles remain satisfied. The data model and route contracts use only stable public API surfaces. The policy structure matches the documented quickstart pattern exactly.

## Project Structure

### Documentation (this feature)

```text
specs/20260311120000-prisma-example-app/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/
│   └── routes.md        # HTTP route contracts
└── tasks.md             # Phase 2 output (NOT created by /speckit.plan)
```

### Source Code (repository root)

```text
examples/prisma-app/
├── package.json          # Standalone (not in pnpm workspace)
├── tsconfig.json         # JSX config for hono/jsx
├── .gitignore            # dev.db, node_modules
├── policy.yaml           # Toride authorization policy
├── README.md             # Setup instructions
├── prisma/
│   ├── schema.prisma     # User, Project, Task, RoleAssignment models
│   └── seed.ts           # Idempotent seed script
└── src/
    ├── index.tsx          # Entry point: Hono app creation, serve()
    ├── engine.ts          # Toride engine + Prisma adapter setup
    ├── db.ts              # PrismaClient singleton
    ├── middleware.ts       # User resolution middleware (cookie → actor)
    ├── routes/
    │   ├── projects.tsx   # GET /projects, GET /projects/:id
    │   └── tasks.tsx      # POST /projects/:id/tasks, PUT /tasks/:id, DELETE /tasks/:id
    └── components/
        ├── Layout.tsx     # HTML shell: <head> with htmx CDN + inline CSS, user switcher
        ├── ProjectList.tsx # Project cards with conditional action buttons
        ├── ProjectDetail.tsx # Project info + task list
        └── TaskItem.tsx   # Single task row with conditional edit/delete
```

**Structure Decision**: Flat `src/` with `routes/` and `components/` subdirectories. Single concern app — no need for separate backend/frontend since Hono serves everything server-side.

## Complexity Tracking

No constitution violations. No complexity justification needed.
