---
description: CLI (toride-codegen) and programmatic API (generateTypes), generated type reference (Actions, Resources, RoleMap, PermissionMap, RelationMap, ResolverMap), watch mode.
---

# Codegen

`@toride/codegen` generates TypeScript type declarations from your Toride policy file. This gives you compile-time safety for resource names, roles, permissions, and relations -- so typos and mismatches are caught before runtime.

## Installation

::: code-group

```bash [pnpm]
pnpm add -D @toride/codegen
```

```bash [npm]
npm install -D @toride/codegen
```

```bash [yarn]
yarn add -D @toride/codegen
```

:::

::: tip
Install as a dev dependency since codegen only runs at build time, not at runtime.
:::

## Quick Start

### 1. Run the CLI

```bash
npx toride-codegen policy.yaml -o src/generated/policy-types.ts
```

This reads your policy file and writes generated TypeScript types to the output path.

### 2. Use the generated types

Pass `GeneratedSchema` to the engine and use `ResolverMap` to check resolver output.

```typescript
import { Toride } from "toride";
import type { GeneratedSchema, ResolverMap } from "./generated/policy-types.js";

const resolvers: ResolverMap = {
	Project: async (ref) => {
		const project = await db.project.findUnique({ where: { id: ref.id } });
		if (!project) return null;
		return { status: project.status };
	},
};

const engine = new Toride<GeneratedSchema>({ policy, resolvers });
```

The generated file imports `Resolvers` and `TorideSchema` from `toride` and emits `export type ResolverMap = Resolvers<GeneratedSchema>`. It does not define a separate complete-attribute contract. Resolver output contains partial declared attributes and declared relation refs, or `null` for a missing resource.

Relations accept one ref, a readonly array, or `null`, including actor-only targets. Wrong attribute types and wrong relation targets fail compilation. Regenerate existing files with the CLI to migrate the resolver alias.

## CLI Reference

```
Usage: toride-codegen <policy-file> -o <output-file> [--watch]

Arguments:
  policy-file          Path to policy YAML or JSON file

Options:
  -o, --output <path>  Output file path (required)
  --watch              Re-generate on policy file change
  -h, --help           Show this help message
```

### Watch Mode

Use `--watch` to automatically regenerate types whenever your policy file changes:

```bash
npx toride-codegen policy.yaml -o src/generated/policy-types.ts --watch
```

This is useful during development when you are iterating on your policy.

### JSON Policies

The CLI also accepts JSON policy files:

```bash
npx toride-codegen policy.json -o src/generated/policy-types.ts
```

## Programmatic API

You can also use the generator programmatically:

```typescript
import { generateTypes } from "@toride/codegen";
import { loadYaml } from "toride";
import { readFileSync, writeFileSync } from "node:fs";

const content = readFileSync("policy.yaml", "utf-8");
const policy = await loadYaml(content);
const types = generateTypes(policy);

writeFileSync("src/generated/policy-types.ts", types, "utf-8");
```

The `generateTypes()` function takes a parsed `Policy` object and returns a string of TypeScript source code.

## Generated Types Reference

| Type | Description |
|------|-------------|
| `Actions` | Union of all unique permission strings across all resources |
| `Resources` | Union of all resource type names |
| `RoleMap` | Interface mapping each resource to its role union type |
| `PermissionMap` | Interface mapping each resource to its permission union type |
| `RelationMap` | Interface mapping each resource to an object of relation name to target type |
| `ResolverMap` | Alias for `Resolvers<GeneratedSchema>` |
| `GeneratedSchema` | Unified schema for the engine and resolvers |
| `ActorTypes` | Union of actor type names |
| `ResourceAttributeMap` | Declared resource attribute types |
| `ActorAttributeMap` | Declared actor attribute types |

### Handling Edge Cases

- **Empty resources**: If the policy has no resources, `Actions` and `Resources` are typed as `never`.
- **No relations**: Resources without relations get `Record<string, never>` in the `RelationMap`.
- **Unsafe identifiers**: The generator validates all resource names, roles, permissions, and relation names. If any contain characters outside `[A-Za-z_][A-Za-z0-9_]*`, it throws an error to prevent code injection.

## Adding to Your Build

A common pattern is to add a `codegen` script to your `package.json`:

```json
{
  "scripts": {
    "codegen": "toride-codegen policy.yaml -o src/generated/policy-types.ts",
    "codegen:watch": "toride-codegen policy.yaml -o src/generated/policy-types.ts --watch",
    "build": "pnpm codegen && tsc"
  }
}
```

Add the generated file to `.gitignore` if you prefer to regenerate on each build, or commit it if you want diffs to be visible in pull requests.

## What's Next

- [Policy Format](/concepts/policy-format) -- understand the YAML policy structure that codegen reads
- [Roles & Relations](/concepts/roles-and-relations) -- learn about the roles and relations that codegen generates types for
- [Prisma Integration](/integrations/prisma) -- use the Prisma adapter for data filtering
- [Drizzle Integration](/integrations/drizzle) -- use the Drizzle adapter for data filtering
- [Partial Evaluation](/concepts/partial-evaluation) -- understand how constraints work with the generated types
