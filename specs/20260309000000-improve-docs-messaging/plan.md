# Implementation Plan: Improve Official Docs Messaging

**Branch**: `improve-docs-messaging` | **Date**: 2026-03-09 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/20260309000000-improve-docs-messaging/spec.md`

## Summary

Rewrite the VitePress docs site messaging to accurately position Toride as a type-safe, database-agnostic, YAML-first authorization engine. Replace all database-centric language with data-source-agnostic alternatives, rewrite the quickstart to lead with in-memory resolvers, create a new "Why Toride" page, and add YAML expressiveness framing to concept pages.

## Technical Context

**Language/Version**: TypeScript (VitePress config), Markdown (content)
**Primary Dependencies**: VitePress 1.6.4 (standalone in `docs/`)
**Storage**: N/A (static Markdown files)
**Testing**: Manual verification — text search for banned phrases, visual review of rendered pages
**Target Platform**: Static site (GitHub Pages)
**Project Type**: Documentation site (docs-only change, no engine code)
**Performance Goals**: N/A
**Constraints**: No structural changes to VitePress config beyond adding sidebar entry and hero action
**Scale/Scope**: 7 Markdown files to modify, 1 new file to create, 1 config file to update

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Principle | Relevant? | Status | Notes |
|-----------|-----------|--------|-------|
| I. Security-First / Fail-Closed | No | PASS | Docs-only change, no engine behavior affected |
| II. Type-Safe Library / Zero Infrastructure | Yes | PASS | This change *reinforces* this principle — removes language implying database dependency, emphasizes "user provides data access via RelationResolver" |
| III. Explicit Over Clever | No | PASS | Docs-only change |
| IV. Stable Public API / Semver | No | PASS | No API changes |
| V. Test-First | No | PASS | Docs-only change; acceptance tests are text searches and visual checks |

**Gate result**: PASS — no violations. This feature directly supports Constitution Principle II by aligning documentation with the "zero infrastructure" and "user provides data access" design.

## Project Structure

### Documentation (this feature)

```text
specs/20260309000000-improve-docs-messaging/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output (page inventory)
├── quickstart.md        # Phase 1 output (in-memory example draft)
└── contracts/           # Phase 1 output (page contracts)
```

### Source Code (repository root)

```text
docs/
├── index.md                          # Landing page (MODIFY)
├── guide/
│   ├── getting-started.md            # Getting Started (MODIFY)
│   ├── quickstart.md                 # Quickstart (MODIFY — major rewrite)
│   └── why-toride.md                 # Why Toride (NEW)
├── concepts/
│   ├── policy-format.md              # Policy Format (MODIFY — framing)
│   ├── roles-and-relations.md        # Roles & Relations (MODIFY — framing)
│   ├── conditions-and-rules.md       # Conditions & Rules (MODIFY — link text)
│   ├── partial-evaluation.md         # Partial Evaluation (MODIFY — framing)
│   └── client-side-hints.md          # Client-Side Hints (MODIFY — link text)
└── .vitepress/
    └── config.ts                     # Sidebar/nav config (MODIFY)
```

**Structure Decision**: Existing VitePress docs structure. One new file (`why-toride.md`), rest are edits.

## Change Inventory

### Tier 1: Core Messaging (P1)

| File | Change | FRs |
|------|--------|-----|
| `docs/index.md` | Rewrite hero tagline (remove "from your database"), rewrite feature cards to show 3 balanced strengths, add "Why Toride" hero action | FR-001, FR-002, FR-003, FR-014 |
| `docs/guide/getting-started.md` | Rewrite intro paragraph, change "connects to your database" → data-access function framing, change "from your database" → "from any data source", reframe ORM adapters as optional | FR-004, FR-010, FR-013 |
| `docs/guide/quickstart.md` | Add in-memory resolver example first, move current db example to "Real-World: Database Resolvers" section | FR-005, FR-006 |

### Tier 2: New Content & Concept Framing (P2)

| File | Change | FRs |
|------|--------|-----|
| `docs/guide/why-toride.md` | New page: 5 value propositions, 3+ level YAML hierarchy example, no competitor names | FR-007, FR-008, FR-009 |
| `docs/concepts/policy-format.md` | Add "single source of truth" framing to intro paragraph, update "What's Next" link text | FR-012, FR-010 |
| `docs/concepts/roles-and-relations.md` | Add "single source of truth" framing, update "Resolving Relations" section to show in-memory example first, update "What's Next" link text | FR-012, FR-010, FR-013 |

### Tier 3: Sweep (P2)

| File | Change | FRs |
|------|--------|-----|
| `docs/concepts/partial-evaluation.md` | Reframe as "when you use a database" rather than implying database is required, update "your database" → "your data store" | FR-010, FR-011 (edge case) |
| `docs/concepts/conditions-and-rules.md` | Update "What's Next" link text | FR-010 |
| `docs/concepts/client-side-hints.md` | Update "What's Next" link text | FR-010 |
| `docs/.vitepress/config.ts` | Add "Why Toride" as first Guide sidebar item, update Guide nav link | FR-014 |

## Database-Centric Language Audit

All occurrences of database-centric language in non-integration docs:

| File | Line | Current Text | Replacement |
|------|------|-------------|-------------|
| `index.md` | 7 | "resolve relations from your database" | Remove; rewrite tagline |
| `index.md` | 22 | "Generate database-level WHERE clauses" | "Generate query-level WHERE clauses" or similar |
| `getting-started.md` | 3 | "connects to your database" | "return attributes from any data source" |
| `getting-started.md` | 49 | "database-level WHERE clauses" | "query-level constraints" |
| `getting-started.md` | 75 | "from your database" | "from any data source" |
| `quickstart.md` | 98 | "Replace the db calls with your actual database queries" | Remove (in-memory example won't have db calls) |
| `quickstart.md` | 218 | "database-level filtering" | "query-level filtering" |
| `policy-format.md` | 310 | "filter data at the database level" | "push authorization into data-layer queries" |
| `roles-and-relations.md` | 342 | "filter data at the database level" | "push authorization into data-layer queries" |
| `conditions-and-rules.md` | 471 | "translate conditions into database queries" | "translate conditions into data-layer queries" |
| `client-side-hints.md` | 263 | "filter data at the database level" | "push authorization into data-layer queries" |
| `partial-evaluation.md` | multiple | Various "database" mentions | Reframe with "when you use a database" conditionals |

## Design Decisions

1. **Hero tagline**: Draft 2-3 options during implementation; keep under ~120 chars
2. **In-memory quickstart**: Reuse existing Project/Task domain model with plain objects instead of `db.*` calls
3. **"Why Toride" tone**: Technical & concise — code examples and bullet points, no marketing prose
4. **Concept page changes**: Framing updates only — add "single source of truth" intros, don't restructure
5. **Canonical term**: Always use "data source" (per spec clarification), never "data provider" or "data access layer"
6. **Partial evaluation page**: Keep "database" where technically accurate but frame as "when you use a database" rather than implying it's required

## Complexity Tracking

> No constitution violations — table not needed.
