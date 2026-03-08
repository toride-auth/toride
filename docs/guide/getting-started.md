# Getting Started

Toride is a relation-aware authorization engine for TypeScript. You define policies in YAML, provide a resolver that connects to your database, and the engine handles permission checks — including partial evaluation for data filtering.

## Prerequisites

- Node.js 20 or later
- A TypeScript project
- A package manager (pnpm, npm, or yarn)

## Installation

### Core Package

Install the core `toride` package to get started:

::: code-group

```bash [pnpm]
pnpm add toride
```

```bash [npm]
npm install toride
```

```bash [yarn]
yarn add toride
```

:::

### ORM Adapters (Optional)

If you need data filtering (partial evaluation), install the adapter for your ORM:

::: code-group

```bash [Prisma]
pnpm add @toride/prisma
```

```bash [Drizzle]
pnpm add @toride/drizzle
```

:::

These adapters translate authorization constraints into database-level WHERE clauses so you can efficiently filter data based on permissions.

### Code Generation (Optional)

For type-safe resolvers generated from your policy file, install the codegen package as a dev dependency:

```bash
pnpm add -D @toride/codegen
```

This generates TypeScript types from your YAML policy, ensuring your resolver implementation stays in sync with your policy definitions.

## Package Overview

| Package | Description |
|---------|-------------|
| `toride` | Core authorization engine — policy loading, permission checks, partial evaluation |
| `@toride/prisma` | Prisma adapter — converts constraints to Prisma `where` clauses |
| `@toride/drizzle` | Drizzle adapter — converts constraints to Drizzle `where` clauses |
| `@toride/codegen` | Code generation — produces typed resolver interfaces from YAML policies |

## Project Setup

A typical Toride project has three parts:

1. **A YAML policy file** that defines your authorization rules (actors, resources, roles, permissions, and conditions)
2. **Resource resolvers** that tell the engine how to fetch attributes for each resource type from your database
3. **The engine** that evaluates permission checks against the policy using the resolver

Here is a minimal project structure:

```
my-app/
├── policy.yaml          # Authorization policy
├── src/
│   ├── auth/
│   │   ├── resolver.ts  # Resource resolvers
│   │   └── engine.ts    # Engine setup
│   └── ...
└── package.json
```

## Next Steps

Ready to build your first authorization check? Head to the [Quickstart](/guide/quickstart) guide for a step-by-step walkthrough.
