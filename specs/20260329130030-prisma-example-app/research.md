# Research: Prisma Example App

**Date**: 2026-03-29
**Feature**: [spec.md](./spec.md) | [plan.md](./plan.md)

## Resolved Decisions

### 1. Package Independence Strategy

**Decision**: Fully independent — own `pnpm-lock.yaml`, not listed in `pnpm-workspace.yaml`
**Rationale**: Mirrors how a real user would set up a toride+Prisma project. The example should work when cloned or copied out of the monorepo. Using published npm versions (`^0.3.0`) reinforces this.
**Alternatives considered**:
- Part of pnpm workspace (rejected: blurs the boundary between library and example; `pnpm install` at root would install example deps)

### 2. Web Framework: Hono

**Decision**: Hono ^4.7.0 with @hono/node-server
**Rationale**: Already used in reference implementation. Lightweight, TypeScript-first, supports JSX natively (no React needed). `hono/jsx` provides server-side JSX rendering without a build step.
**Alternatives considered**:
- Express (heavier, no built-in JSX support)
- Fastify (more complex setup for a demo)
- Plain Node.js http (too low-level for a teaching example)

### 3. Interactivity: HTMX via CDN

**Decision**: HTMX 2.x loaded from unpkg CDN
**Rationale**: Zero build step for client-side interactivity. HTMX's declarative attributes (`hx-post`, `hx-swap`, `hx-target`) make the authorization-driven UI behavior visible in the HTML markup. New users can see how permission checks translate to UI behavior without understanding a JS framework.
**Alternatives considered**:
- React/Vue SPA (overkill for a demo; obscures the server-side authorization patterns)
- Vanilla JS fetch (more boilerplate, less visible in HTML)
- Alpine.js (similar to HTMX but less suited for HTML fragment swapping)

### 4. Database: SQLite via Prisma

**Decision**: SQLite with `file:./prisma/dev.db`, Prisma ^6.4.0
**Rationale**: Zero-configuration database. No external server needed. Aligns with SC-001 (5-minute setup). Prisma's migration/seed tooling handles schema setup and sample data.
**Alternatives considered**:
- PostgreSQL (requires external server, violates zero-config goal)
- In-memory SQLite (data lost on restart, poor demo experience)

### 5. Dev Server: tsx watch

**Decision**: `tsx watch src/index.tsx` for development
**Rationale**: Direct TypeScript execution without a build step. Watch mode provides auto-restart on changes. Keeps the development workflow simple (no tsup/esbuild config needed for the example).
**Alternatives considered**:
- ts-node (slower, more configuration)
- Build + node (unnecessary build step for a dev-focused example)

### 6. Generated Code Strategy

**Decision**: `src/generated/policy.ts` is gitignored and produced by `pnpm codegen` during setup
**Rationale**: Per clarification session — teaches users the codegen workflow. The `codegen` script in package.json (`toride-codegen policy.yaml -o src/generated/policy.ts`) demonstrates how to integrate codegen into their own projects.
**Alternatives considered**:
- Committed to git (rejected: per user decision; misses the opportunity to teach codegen workflow)

### 7. CSS Strategy

**Decision**: Inline CSS in Layout component via `<style>` tag
**Rationale**: No build step, no external CSS file to manage. The styles are minimal and focused on making the demo look clean enough to be presentable. This is standard for Hono JSX server-rendered apps.
**Alternatives considered**:
- Tailwind CSS (requires build tooling, adds complexity)
- External CSS file (adds a static file serving concern)

### 8. Toride Version Compatibility

**Decision**: Use `^0.3.0` for toride, @toride/prisma, and @toride/codegen
**Rationale**: Current published versions. The caret range allows patch updates. All three packages are at the same version, matching the monorepo's coordinated release.
**Alternatives considered**:
- Pinned exact versions (too strict for an example; users would need to update manually)
- `latest` tag (unstable, could break)
