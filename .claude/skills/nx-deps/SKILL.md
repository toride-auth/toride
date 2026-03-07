---
name: nx-deps
description: Interactive package dependency explorer for Nx monorepos. Shows what a package depends on, what depends on it, available targets, tags, and configuration — all via Nx MCP tools. Use whenever the user asks about package dependencies, project structure, "what depends on X", "show me the dep graph", "explore package Y", "what does changing X affect", or wants to understand how packages relate in the monorepo. Also trigger when the user is confused about build order, circular deps, or wants to know what targets a package supports.
argument-hint: [package-name]
allowed-tools: Read, Bash, Glob, Grep, Agent
---

# nx-deps

Explore package dependencies, targets, and configuration for any project in the monorepo using Nx MCP.

## Why This Skill Exists

Understanding how packages relate in a monorepo is essential for making safe changes. This skill provides an interactive, MCP-powered exploration experience — richer than raw `nx show project` because it adds dependency trees, impact analysis, and follow-up actions.

## Workflow

### 1. Resolve the Package

From the user's argument:
- **Full name provided** (e.g., `@toride/drizzle`): use directly
- **Short name** (e.g., `drizzle`): fuzzy-match against all project names via `nx:nx-workspace` skill
- **Empty**: use `nx:nx-workspace` to list all projects and ask the user to pick via AskUserQuestion
- **Ambiguous match**: show candidates and ask for clarification

### 2. Gather Project Data

Use the `nx:nx-workspace` skill to retrieve:
- Full name, root path, tags
- Direct dependencies (workspace and external)
- Transitive dependencies (if relevant)
- Dependents (what packages depend on this one)
- Available targets with their configuration

### 3. Present the Overview

Use a compact, scannable format:

```
@toride/drizzle
  Path: packages/drizzle
  Tags: type:integration

Depends on:
  toride (workspace)

Depended on by:
  (none)

Targets:
  build  → tsup (cached, depends on ^build)
  test   → vitest (cached)
  lint   → tsc --noEmit (cached, depends on ^build)
```

### 4. Dependency Tree

Render an ASCII tree showing the package's position in the graph:

```
toride (core)
├── @toride/codegen
├── @toride/drizzle  ← you are here
└── @toride/prisma
```

For packages with deeper dependency chains, show the full tree.

### 5. Impact Analysis

Summarize what happens if this package changes:

```
Impact: Changing @toride/drizzle affects 0 downstream packages.
         Only this package needs rebuild/retest.
```

Or for core:

```
Impact: Changing toride affects 3 downstream packages.
         All packages need rebuild/retest.
```

### 6. Offer Follow-up Actions

After the overview, ask via AskUserQuestion what the user wants next:

- **Run a target** — hand off to `nx:nx-run-tasks` skill
- **Explore another package** — loop back to step 1
- **Show full config** — display raw Nx project configuration (inputs, outputs, executor details)
- **Done** — stop

## Edge Cases

- **Package not found**: suggest closest matches and ask again
- **Circular dependency detected**: flag it prominently — this is likely a bug
- **External-only deps**: note them but focus on workspace relationships
- **New package not yet in graph**: suggest running `pnpm install` first
