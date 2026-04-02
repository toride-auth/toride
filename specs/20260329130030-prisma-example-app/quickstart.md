# Quickstart: Prisma Example App

**Date**: 2026-03-29

## Prerequisites

- Node.js 20+ LTS
- pnpm (any recent version)

## Setup

```bash
# Navigate to the example app
cd examples/prisma-app

# Install dependencies
pnpm install

# Generate type-safe schema types from policy.yaml
pnpm codegen

# Create the SQLite database and apply schema
pnpm prisma db push

# Seed the database with sample data
pnpm prisma db seed

# Start the development server
pnpm dev
```

Open http://localhost:3000 in your browser.

## Verify It Works

1. You should see a project list page with projects visible to the default user
2. Use the dropdown in the header to switch between Alice, Bob, and Charlie
3. Each user should see a different set of projects:
   - **Alice**: Project Alpha only (viewer)
   - **Bob**: Project Alpha (editor) + Project Beta (viewer) + engineering projects via department match
   - **Charlie**: All non-archived projects (superadmin)
4. Click into a project to see tasks with permission-aware controls

## Key Commands

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start dev server with auto-restart |
| `pnpm start` | Start without watch mode |
| `pnpm codegen` | Regenerate types from policy.yaml |
| `pnpm prisma db push` | Apply schema changes |
| `pnpm prisma db seed` | Reset and re-seed data |
| `pnpm prisma studio` | Open Prisma's data browser |

## Reset

```bash
# Re-seed the database (idempotent — clears and re-inserts)
pnpm prisma db seed
```
