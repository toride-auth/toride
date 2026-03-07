---
name: nx-affected
description: Smart build/test/lint runner for Nx monorepos. Detects what changed, shows dependency impact via Nx MCP, and runs only affected targets. Use whenever the user wants to build, test, or lint after making changes, asks "what's affected?", says "run affected", "test my changes", "build what changed", "lint affected", or any variation of running tasks on changed packages. Also trigger when the user asks what downstream packages are impacted by their changes. Always prefer this over raw `nx affected` commands — it adds dependency context and dry-run summaries.
argument-hint: [build|test|lint|all]
allowed-tools: Read, Bash, Glob, Grep, Agent
---

# nx-affected

Run build, test, and/or lint only on packages affected by current changes, with full dependency context from Nx MCP.

## Why This Skill Exists

In a monorepo, running everything after a small change is wasteful. But knowing *what* is affected requires understanding the dependency graph. This skill bridges that gap: it detects changes, queries Nx for the impact, shows a clear summary, and executes only what's needed.

## Workflow

### 1. Detect Changes

Run these in parallel:

```bash
git diff --name-only HEAD          # unstaged changes
git diff --name-only --cached      # staged changes
git status --porcelain -uno        # modified tracked files
```

Group changed files by package (map file paths to `packages/*` directories). If on a feature branch, also consider `git diff --name-only main...HEAD` to capture all branch changes.

### 2. Map Impact via Nx

Use the `nx:nx-workspace` skill to:
- Identify which projects own the changed files
- Resolve downstream dependents (e.g., changing `toride` core affects `@toride/codegen`, `@toride/drizzle`, `@toride/prisma`)
- List available targets for affected projects

Present a compact summary:

```
Changes detected in:
  packages/toride/src/engine.ts
  packages/toride/src/types.ts

Affected packages (2 direct + 3 downstream = 5 total):
  toride          (changed directly)     [build, test, lint]
  @toride/codegen (depends on toride)    [build, test, lint]
  @toride/drizzle (depends on toride)    [build, test, lint]
  @toride/prisma  (depends on toride)    [build, test, lint]
```

If nothing changed, report "No changes detected — nothing to run." and stop.

### 3. Determine Targets

From the user's argument:
- Empty or `all` → run `build`, `test`, `lint` (in dependency order)
- Specific targets (e.g., `test`, `build lint`) → run only those
- Ambiguous input → ask ONE question via AskUserQuestion

### 4. Dry-Run Summary

Before executing, show what will happen:

```
Will run: build, test, lint
On: 4 affected packages
Command: pnpm exec nx affected -t build test lint --base=main
```

### 5. Execute

Determine the correct base ref:
- On a feature branch → `--base=main`
- On main → `--base=HEAD~1`

Run via Bash:
```bash
pnpm exec nx affected -t <targets> --base=<ref>
```

### 6. Report

Summarize results:
- Per-package pass/fail for each target
- Cache hits (if visible in output)
- Total execution time
- On failure: show the relevant error output and suggest what to fix

## Edge Cases

- **No git changes**: Check if there are uncommitted changes. If truly nothing, report it.
- **Changes outside packages/**: Note they don't affect any Nx project.
- **All packages affected**: This is normal when core changes — just confirm and proceed.
- **Nx cache hits everything**: Report "All targets cached — no work needed."
