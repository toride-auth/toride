# Quickstart: Nx Monorepo Optimization

## Prerequisites

- Node.js 20+ (current LTS)
- pnpm 10.x
- Existing monorepo with `pnpm-workspace.yaml`

## Setup (after implementation)

```bash
# Install dependencies (nx is added as devDependency)
pnpm install

# Verify Nx sees all projects
pnpm exec nx show projects

# Verify project graph
pnpm exec nx graph
```

## Common Commands

```bash
# Build all packages (respects dependency order, uses cache)
pnpm exec nx run-many -t build

# Test all packages
pnpm exec nx run-many -t test

# Lint all packages
pnpm exec nx run-many -t lint

# Build/test/lint only packages affected by changes (compared to main)
pnpm exec nx affected -t build test lint

# Build a specific package
pnpm exec nx build @toride/drizzle

# Show a project's configuration
pnpm exec nx show project @toride/drizzle

# Visualize dependency graph
pnpm exec nx graph

# Clear Nx cache
pnpm exec nx reset
```

## What Changed from Pre-Nx

| Before | After |
|--------|-------|
| `pnpm -r run build` | `pnpm exec nx run-many -t build` |
| `vitest run` (root) | `pnpm exec nx run-many -t test` |
| `tsc --build --noEmit` | `pnpm exec nx run-many -t lint` |
| Run everything always | `nx affected` runs only what changed |
| No build caching | Repeated builds are instant (cache hit) |

## Root package.json Scripts

The root `package.json` scripts are updated so `pnpm build`, `pnpm test`, and `pnpm lint` use Nx under the hood:

```json
{
  "scripts": {
    "build": "nx run-many -t build",
    "test": "nx run-many -t test",
    "lint": "nx run-many -t lint"
  }
}
```
