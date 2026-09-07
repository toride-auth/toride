# Toride repository quickstart

## What this repository is

Toride is a TypeScript monorepo for relation-aware authorization. Applications define policy in YAML/JSON, resolve resource relationships and attributes at runtime, and ask the core engine for decisions. The same policy can produce generated TypeScript types, database-list constraints, field permissions, and client-facing permission snapshots.

The repository publishes four packages:

- [`toride`](architecture/overview.md#core-runtime): policy parsing/validation, role evaluation, `can()`/`explain()`, field access, snapshots, and partial evaluation.
- [`@toride/codegen`](integrations/packages.md#codegen): generates strongly typed policy bindings.
- [`@toride/prisma`](integrations/packages.md#prisma): translates constraint ASTs to Prisma-compatible `where` objects.
- [`@toride/drizzle`](integrations/packages.md#drizzle): translates constraints to an intermediate Drizzle query description.

## Start here

1. Install Node 20+ and pnpm 10.30.3, then run `pnpm install --frozen-lockfile`.
2. Read [Architecture](architecture/overview.md) to understand package boundaries and dependency direction.
3. Read [Authorization domain](domain/authorization.md) before changing policy or evaluation behavior.
4. Follow [Policy and query workflows](workflows/policy-and-query.md) for the normal policy → decision/query path.
5. Use [Integration packages](integrations/packages.md) and `examples/prisma-app/` for an end-to-end application.
6. Run the checks in [Operations and testing](operations/testing.md) before submitting changes.

The user-facing documentation site is under [`docs/`](../docs/), while this wiki is an engineering map of source and change-sensitive behavior. The root README is intentionally brief and points users to the published docs site.

## Major sections

- [Architecture](architecture/overview.md) — workspace, package responsibilities, and runtime boundaries.
- [Authorization domain](domain/authorization.md) — policy concepts and fail-closed decision rules.
- [Key workflows](workflows/policy-and-query.md) — loading, validation, authorization, partial evaluation, and client sync.
- [Integrations](integrations/packages.md) — codegen, Prisma, Drizzle, and the example app.
- [Operations and testing](operations/testing.md) — commands, CI, release order, and change guidance.
- [Source map](source-map.md) — practical file navigation.

## Current repository state

The documentation was initialized at commit `d236e71` (`chore: remove unused code and obsolete helper files`). The working tree is not clean: it contains intentional-looking changes to tooling/configuration, `CLAUDE.md`, and the Prisma example, plus untracked OpenWiki/agent files. Treat those changes as active work and inspect `git diff` before relying on them. Do not infer that deleted legacy workflow files are absent from repository history; they are present in `HEAD` and can be inspected with `git show HEAD:<path>`.

Recent product progression is useful context: basic policy/permission checks (`26eeaf0`), derived roles (`52d5e9d`), forbid-wins rules (`b70bd19`), partial evaluation (`f3a7571`), client snapshots (`9c10614`), field access (`7fc95e2`), deep type safety (`d0800c6`), and the simplified ok-based constraint API (`29af9d3`). These recent changes make public types, result shapes, generated schema, and type tests compatibility-sensitive.

## Backlog

- **Detailed policy language reference:** `docs/concepts/` is the authoritative user-facing source; this wiki captures runtime semantics but does not reproduce every condition operator.
- **Legacy developer workflow tooling:** `.fdsx/`, `.specify/`, `.takt/`, and `.worktree/` have large current deletions and are not part of the core runtime; document them only if the cleanup is reversed or their replacement becomes an engineering concern.
- **Modified Prisma example route:** `examples/prisma-app/src/routes/projects.tsx` is dirty in the current checkout; compare its diff before documenting route-specific behavior.
