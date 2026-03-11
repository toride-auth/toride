# Quickstart: Prisma Example App

## Prerequisites

- Node.js 20+ LTS
- pnpm (any recent version)

## Setup

```bash
# Navigate to the example app
cd examples/prisma-app

# Install dependencies
pnpm install

# Create the database and apply schema
pnpm prisma db push

# Seed the database with sample data
pnpm prisma db seed

# Start the development server
pnpm dev
```

Open http://localhost:3000 in your browser.

## What You'll See

A task board application with:

1. **User Switcher** (header) — switch between Alice (viewer), Bob (editor), and Charlie (admin)
2. **Project List** — filtered by the current user's read permissions
3. **Task List** — per project, filtered by permissions, with conditional CRUD buttons

## Try These Scenarios

### Role-Based Filtering
- Select **Alice** → sees only Project Alpha (viewer role)
- Select **Bob** → sees Project Alpha (editor) and Project Beta (viewer)
- Select **Charlie** → sees all non-archived projects (superadmin)
- **Project Gamma** (archived) is hidden from everyone

### Mutation Authorization
- As **Bob** on Project Alpha → create, edit, and delete tasks
- As **Alice** on Project Alpha → try to create a task → see authorization error
- As **Bob** → try to edit "Legacy cleanup" in archived Project Gamma → forbidden

### Department-Based Access
- **Bob** (engineering dept) automatically gets editor-like access to engineering projects via derived roles

## Key Files to Read

| File | What It Shows |
|------|--------------|
| `policy.yaml` | The authorization policy (roles, permissions, derived roles, rules) |
| `src/engine.ts` | Toride engine setup with Prisma resolvers and adapter |
| `src/routes/projects.tsx` | Route handlers showing `buildConstraints()` and `permittedActions()` |
| `src/routes/tasks.tsx` | CRUD routes showing `can()` for mutation authorization |
| `prisma/schema.prisma` | Data model with RoleAssignment table |
| `prisma/seed.ts` | Sample data setup |

## Resetting Data

```bash
# Re-seed the database (idempotent — clears and re-inserts)
pnpm prisma db seed
```
