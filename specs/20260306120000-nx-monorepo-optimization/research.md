# Research: Nx Monorepo Optimization

## Decision 1: Nx Installation & Configuration Approach

**Decision**: Install only the `nx` package (no `@nx/workspace` or plugins). Use `nx/presets/npm.json` preset for package-based monorepo.

**Rationale**: The `nx` package alone provides task running, caching, affected detection, and project graph — everything needed for a package-based setup. `@nx/workspace` is for integrated monorepos with code generators. No Nx plugins needed since tsup and vitest are orchestrated via package.json scripts.

**Alternatives considered**:
- `@nx/vite` plugin for auto-inferred vitest targets — rejected because it adds unnecessary dependency and the manual config is trivial for 4 packages
- `@nx/workspace` — rejected as it's designed for integrated monorepos, not package-based

## Decision 2: Target Configuration Strategy

**Decision**: Use `targetDefaults` in `nx.json` for build/test/lint configuration. No per-package `project.json` files.

**Rationale**: All 4 packages use identical tooling (tsup for build, vitest for test, tsc for lint). `targetDefaults` in nx.json avoids repeating the same config in each package. Per-package overrides can use the `nx` key in `package.json` if needed (e.g., tags).

**Alternatives considered**:
- Explicit `project.json` per package — rejected as it duplicates info already in `package.json`
- Per-package `nx` key overrides for targets — rejected because all packages share the same target shape

## Decision 3: Cache Inputs & Outputs

**Decision**: Use named inputs (`default`, `production`) with the following outputs:
- `build`: `{projectRoot}/dist` (tsup output)
- `test`: no persistent output to cache (vitest produces stdout only, no coverage dir configured)
- `lint`: no persistent output

**Rationale**: tsup outputs to `./dist` in each package. vitest and tsc --build --noEmit produce no file output worth caching — only the exit code matters (Nx caches that automatically).

**Alternatives considered**:
- Caching coverage output — not configured currently, can be added later if coverage reporting is needed

## Decision 4: CI Affected Detection

**Decision**: Use `nrwl/nx-set-shas@v4` action for determining base/head SHAs.

**Rationale**: It handles both PR and main branch push scenarios correctly. On PRs, it compares against the fork point from main. On main branch pushes, it compares against the last successful CI run. Requires `fetch-depth: 0` for full git history.

**Alternatives considered**:
- Manual `--base=origin/main --head=HEAD` — rejected because it doesn't handle main branch pushes correctly and may miss the right comparison point

## Decision 5: Per-Package AI Context Strategy

**Decision**: Drop AGENTS.md and per-package CLAUDE.md files. Update root CLAUDE.md with Nx-aware monorepo navigation instructions. Ensure each package.json has a meaningful `description` field.

**Rationale**: For 4 packages with consistent tooling, AGENTS.md would duplicate information already available in `package.json` (name, description, dependencies, scripts) and queryable via `nx show project <name>`. The root CLAUDE.md can instruct AI agents to use Nx commands for discovery.

**Alternatives considered**:
- Per-package AGENTS.md with CLAUDE.md symlinks — rejected as unnecessary maintenance overhead for a small monorepo with consistent patterns

## Decision 6: Nx Version

**Decision**: Use latest stable Nx v21.x.

**Rationale**: User preference. Latest version has best support for modern Node.js and pnpm.

## Key Technical Details

### nx.json Structure

```json
{
  "extends": "nx/presets/npm.json",
  "defaultBase": "main",
  "namedInputs": {
    "default": ["{projectRoot}/**/*"],
    "production": ["default", "!{projectRoot}/**/*.spec.ts", "!{projectRoot}/**/*.test.ts"]
  },
  "targetDefaults": {
    "build": {
      "cache": true,
      "dependsOn": ["^build"],
      "inputs": ["production", "^production"],
      "outputs": ["{projectRoot}/dist"]
    },
    "test": {
      "cache": true,
      "inputs": ["default", "^production"]
    },
    "lint": {
      "cache": true,
      "inputs": ["default", "^production"]
    }
  }
}
```

### Project Tags (via package.json `nx` key)

```json
{
  "nx": {
    "tags": ["type:core"]
  }
}
```

Tag scheme: `type:core` (toride), `type:integration` (drizzle, prisma), `type:codegen` (codegen).

### CI Workflow Key Requirements

- `actions/checkout@v4` with `fetch-depth: 0` and `filter: tree:0`
- `pnpm/action-setup@v4` for pnpm
- `actions/setup-node` with `node-version: 20` and pnpm cache
- `nrwl/nx-set-shas@v4` before affected commands
- Single `pnpm exec nx affected -t lint test build` command
