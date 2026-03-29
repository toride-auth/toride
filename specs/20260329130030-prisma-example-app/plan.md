# Implementation Plan: Prisma Example App

**Branch**: `prisma-example` | **Date**: 2026-03-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/20260329130030-prisma-example-app/spec.md`

## Summary

Build a standalone example app at `examples/prisma-app` demonstrating toride authorization with Prisma ORM. The app is a task board (Hono + HTMX + Prisma + SQLite) with three pre-seeded users, showcasing buildConstraints, can, snapshot, TorideClient, permittedActions, and translateConstraints patterns. Targets new toride users with tutorial-style inline comments.

## Technical Context

**Language/Version**: TypeScript (strict mode), Node.js 20+ LTS
**Primary Dependencies**: hono ^4.7.0, @hono/node-server ^1.13.0, @prisma/client ^6.4.0, toride ^0.3.0, @toride/prisma ^0.3.0, htmx 2.x (CDN)
**Dev Dependencies**: @toride/codegen ^0.3.0, prisma ^6.4.0, tsx ^4.19.0, typescript ^5.7.0
**Storage**: SQLite via Prisma (file:./prisma/dev.db)
**Testing**: None — manual verification via README scenarios (per FR-014)
**Target Platform**: Node.js server (localhost:3000)
**Project Type**: Standalone example app (not part of pnpm workspace or Nx)
**Performance Goals**: N/A — demo app, single-user local usage
**Constraints**: Must use published npm versions (not workspace:*), own pnpm-lock.yaml, fully independent
**Scale/Scope**: 3 users, 3 projects, 6 tasks, 4 entities, ~12 source files

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Status | Notes |
|-----------|--------|-------|
| I. Security-First / Fail-Closed | **PASS** | App uses toride engine which enforces default-deny. All mutation routes use can() guards before writes. Forbid rules override permits for archived projects. |
| II. Type-Safe Library / Zero Infrastructure | **PASS** | Example uses Toride<AppSchema> with full generics. Generated types from codegen ensure compile-time checking. SQLite is zero-config. |
| III. Explicit Over Clever | **PASS** | Policy is YAML, all roles/permissions/rules explicit per resource block. No implicit inheritance. |
| IV. Stable Public API / Semver | **PASS** | Example consumes published versions (^0.3.0). Uses only public APIs (can, buildConstraints, snapshot, etc.). |
| V. Test-First | **EXEMPT** | This is an example app, not a library feature. FR-014 explicitly states no automated tests. The constitution's test-first mandate applies to toride engine development, not consumer example apps. |

No violations requiring justification.

## Project Structure

### Documentation (this feature)

```text
specs/20260329130030-prisma-example-app/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── routes.md        # HTTP route contracts
└── tasks.md             # Phase 2 output (created by /speckit.tasks)
```

### Source Code (repository root)

```text
examples/prisma-app/
├── package.json
├── pnpm-lock.yaml
├── tsconfig.json
├── policy.yaml
├── .gitignore
├── README.md
├── prisma/
│   ├── schema.prisma
│   └── seed.ts
└── src/
    ├── index.tsx            # App entry, Hono server setup, route mounting
    ├── db.ts                # Prisma client singleton
    ├── engine.ts            # Toride engine setup with resolvers + adapter
    ├── types.ts             # AppSchema, User type, AppEnv, toActorRef helper
    ├── middleware.ts         # User resolution middleware (cookie-based)
    ├── generated/           # @toride/codegen output (gitignored)
    │   └── policy.ts
    ├── routes/
    │   ├── projects.tsx     # Project list + detail routes
    │   └── tasks.tsx        # Task CRUD routes
    └── components/
        ├── Layout.tsx       # HTML shell, header, user switcher, styles
        ├── ProjectList.tsx  # Project cards with permitted actions
        ├── ProjectDetail.tsx # Project detail with task form + list
        └── TaskItem.tsx     # Single task row with conditional controls
```

**Structure Decision**: Matches the reference implementation layout. This is a flat, single-purpose app with no need for layered architecture. Route files double as controllers; components are server-rendered JSX. The structure mirrors what a real Prisma+toride integration would look like.

## Polish Opportunities

Improvements over the reference implementation (within "same core, room for polish" scope):

1. **README enhancement**: Add a "How It Works" section with a brief architecture diagram (text-based) showing the flow: Request → Middleware → Route → Engine → Prisma → Response
2. **Better empty states**: More helpful messages when no tasks exist in a project
3. **User info in header**: Show current user's department and role context alongside the switcher
4. **Status badge consistency**: Normalize status display across projects and tasks
5. **Form reset UX**: Clear form and show brief success feedback after task creation
6. **Code comment refinement**: Ensure comments focus on "why this pattern" rather than restating what the code does

## Complexity Tracking

No constitution violations to justify.
