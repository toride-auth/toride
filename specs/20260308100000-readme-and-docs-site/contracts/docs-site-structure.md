# Contract: Documentation Site Structure

**Date**: 2026-03-08

## URL Structure

All URLs are relative to the base path `/toride/`.

| URL Path | File | Description |
|----------|------|-------------|
| `/` | `docs/index.md` | Landing page with hero |
| `/guide/getting-started` | `docs/guide/getting-started.md` | Installation and setup |
| `/guide/quickstart` | `docs/guide/quickstart.md` | Step-by-step first auth check |
| `/concepts/policy-format` | `docs/concepts/policy-format.md` | YAML policy structure |
| `/concepts/roles-and-relations` | `docs/concepts/roles-and-relations.md` | Role types and derivation |
| `/concepts/conditions-and-rules` | `docs/concepts/conditions-and-rules.md` | Permit/forbid rules, ABAC |
| `/concepts/partial-evaluation` | `docs/concepts/partial-evaluation.md` | Data filtering with constraints |
| `/concepts/client-side-hints` | `docs/concepts/client-side-hints.md` | Permission snapshots |
| `/integrations/prisma` | `docs/integrations/prisma.md` | @toride/prisma adapter |
| `/integrations/drizzle` | `docs/integrations/drizzle.md` | @toride/drizzle adapter |
| `/integrations/codegen` | `docs/integrations/codegen.md` | @toride/codegen CLI |

## Sidebar Navigation Contract

```
Guide
├── Getting Started
└── Quickstart

Concepts
├── Policy Format
├── Roles & Relations
├── Conditions & Rules
├── Partial Evaluation
└── Client-Side Hints

Integrations
├── Prisma
├── Drizzle
└── Codegen
```

## Landing Page Contract

The landing page (`docs/index.md`) uses VitePress frontmatter for the hero layout:

- **name**: Toride
- **tagline**: Relation-aware authorization for TypeScript
- **description**: Brief value proposition (1-2 sentences)
- **CTA button**: "Get Started" linking to `/guide/getting-started`
- **Secondary button**: "View on GitHub" linking to the repository
- **No code examples on landing page** (per spec clarification)

## GitHub Actions Workflow Contract

**File**: `.github/workflows/deploy-docs.yml`

**Triggers**:
- `push` to `main` branch with path filter `docs/**`
- `workflow_dispatch` (manual)

**Permissions**:
- `contents: read`
- `pages: write`
- `id-token: write`

**Jobs**:
1. `build`: Checkout → setup pnpm → setup Node 20 → configure pages → install deps in `docs/` → build VitePress → upload artifact
2. `deploy`: Deploy to GitHub Pages using `actions/deploy-pages@v4`

**Concurrency**: `pages` group, no cancel-in-progress
