# Data Model: Nx Monorepo Optimization

This feature doesn't introduce application-level entities. The "data model" consists of configuration files and their relationships.

## Configuration Entities

### Nx Workspace Configuration (`nx.json`)

| Field | Type | Description |
|-------|------|-------------|
| extends | string | Preset to extend (`nx/presets/npm.json`) |
| defaultBase | string | Default branch for affected comparison (`main`) |
| namedInputs | Record<string, InputDef[]> | Reusable input definitions for caching |
| targetDefaults | Record<string, TargetConfig> | Default configuration per target name |

### Project Metadata (`package.json` → `nx` key)

| Field | Type | Description |
|-------|------|-------------|
| tags | string[] | Classification tags (e.g., `type:core`) |
| includedScripts | string[] | Optional: limit which scripts Nx sees as targets |

### Target Configuration (in `targetDefaults`)

| Field | Type | Description |
|-------|------|-------------|
| cache | boolean | Whether to cache this target's output |
| dependsOn | string[] | Targets that must run first (e.g., `^build` = build dependencies first) |
| inputs | InputDef[] | Files/patterns that affect cache validity |
| outputs | string[] | Paths produced by this target (cached/restored) |

## Relationships

```
nx.json
├── targetDefaults.build → applies to all package.json "build" scripts
├── targetDefaults.test  → applies to all package.json "test" scripts
└── targetDefaults.lint  → applies to all package.json "lint" scripts

packages/toride/package.json
├── nx.tags: ["type:core"]
├── dependencies: (none — this is the core)
└── depended on by: codegen, drizzle, prisma

packages/codegen/package.json
├── nx.tags: ["type:codegen"]
└── dependencies: toride (workspace:*)

packages/drizzle/package.json
├── nx.tags: ["type:integration"]
└── dependencies: toride (workspace:*)

packages/prisma/package.json
├── nx.tags: ["type:integration"]
└── dependencies: toride (workspace:*)
```

## Project Dependency Graph

```
toride (core)
├── codegen (depends on toride)
├── drizzle (depends on toride)
└── prisma  (depends on toride)
```

All satellite packages depend on `toride` core. No satellite-to-satellite dependencies exist.
