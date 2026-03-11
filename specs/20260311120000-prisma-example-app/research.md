# Research: Prisma Example App

## R1: Hono JSX + HTMX Integration

**Decision**: Use Hono's built-in JSX (`hono/jsx`) for server-side rendering with HTMX loaded from CDN for dynamic interactions.

**Rationale**: Hono has first-class JSX support via `hono/jsx` — no React dependency needed. HTMX enables partial page updates (user switching, CRUD operations, error messages) without a client-side JS framework. This keeps the example simple while providing a polished UX.

**Key details**:
- Configure `tsconfig.json` with `"jsx": "react-jsx"` and `"jsxImportSource": "hono/jsx"`
- HTMX loaded via CDN `<script>` tag in the layout — no npm dependency
- Use `hx-get`, `hx-post`, `hx-swap` attributes for partial updates
- Server returns HTML fragments for HTMX requests (check `HX-Request` header)

**Alternatives considered**:
- Full page reloads only: Too clunky for demonstrating interactive authorization
- Vanilla JS fetch: More boilerplate, reinvents what HTMX provides

## R2: Cookie-Based User Switching

**Decision**: Store the current user ID in a cookie. User switcher sends a POST to `/switch-user` that sets the cookie and triggers a page reload.

**Rationale**: Cookies are the simplest stateless approach. No session store needed. The cookie persists across page navigations naturally.

**Key details**:
- Use `hono/cookie` helper to get/set cookies
- Cookie name: `currentUser` with user ID as value
- Default to first seeded user if no cookie present
- Middleware reads cookie on every request and attaches user info to context

**Alternatives considered**:
- Query parameters: Leaks user selection into URLs, easy to lose
- Session middleware: Adds unnecessary complexity for an example

## R3: Prisma with SQLite Setup

**Decision**: Use Prisma with SQLite (`file:./dev.db`). Database file is gitignored. Users run `pnpm prisma db push` and `pnpm prisma db seed` to set up.

**Rationale**: SQLite requires zero external services (FR-003). `db push` is simpler than migrations for an example app. The seed script is idempotent (clears data before inserting).

**Key details**:
- Prisma schema datasource: `provider = "sqlite"`, `url = "file:./dev.db"`
- Seed script configured in `package.json` under `prisma.seed`: `"tsx prisma/seed.ts"`
- Seed clears all tables (deleteMany) before inserting to ensure idempotency
- `.gitignore` includes `dev.db`, `dev.db-journal`

**Alternatives considered**:
- PostgreSQL: Requires Docker or external service, violates zero-friction setup
- Better-sqlite3 without Prisma: Misses the point of demonstrating @toride/prisma

## R4: RoleAssignment Table Design

**Decision**: Dedicated `RoleAssignment` model with `userId`, `projectId`, and `role` fields. Composite unique constraint on all three.

**Rationale**: Maps directly to `createPrismaAdapter()`'s `hasRole()` pattern. The adapter generates `{ roleAssignments: { some: { userId, role } } }` WHERE clauses, so the Prisma relation must be named `roleAssignments` on the Project model.

**Key details**:
- `createPrismaAdapter({ roleAssignmentTable: "roleAssignments" })` (default)
- Project model has `roleAssignments RoleAssignment[]` relation
- This enables `buildConstraints()` to generate correct Prisma WHERE clauses for role-based filtering

**Alternatives considered**:
- JSON field: Doesn't work with Prisma's relational WHERE clause structure

## R5: Package Dependencies from npm

**Decision**: Install `toride` and `@toride/prisma` from the npm registry, like a real user would.

**Rationale**: The example app is a standalone project meant to show how end users would integrate toride. Using published packages makes the example realistic and copy-pasteable. Currently both packages are at version 0.1.0.

**Key details**:
- `pnpm add toride @toride/prisma` in the example's package.json
- No `workspace:*` references (app is outside the pnpm workspace)
- Version pinning: use `^0.1.0` to allow patch updates

**Alternatives considered**:
- `file:` protocol: Works locally but confusing for users cloning the repo
- `link:` protocol: Fragile, requires manual linking

## R6: tsx for Development

**Decision**: Use `tsx` to run TypeScript directly. No build step.

**Rationale**: An example app doesn't need production builds. `tsx` lets users run `pnpm dev` immediately. `tsx watch` provides auto-reload during development.

**Key details**:
- `"dev": "tsx watch src/index.tsx"` in package.json scripts
- `"start": "tsx src/index.tsx"` for one-shot execution
- `tsx` is a dev dependency only

**Alternatives considered**:
- tsup + node: Adds build step complexity with no benefit for an example

## R7: Policy Structure

**Decision**: Use the exact same policy structure from the docs quickstart, with minor additions for the example's data model (Project `archived` field, Task `assignee` relation).

**Rationale**: FR-005 requires matching the official docs quickstart pattern. This ensures consistency between docs and example.

**Key details**:
- Actor: `User` with `department`, `isSuperAdmin` attributes
- Global role: `superadmin` derived from `isSuperAdmin: true`
- Project: `viewer`, `editor`, `admin` roles; derived `admin` from superadmin; derived `editor` from department match
- Task: roles derived from project relations + assignee relation; forbid rule on completed projects
- Added: `forbid` rule on Project with `$resource.archived: true` to enforce FR's archived project behavior

**Alternatives considered**: None — spec requires matching docs policy
