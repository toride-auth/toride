# Data Model: Improve Official Docs Messaging

This feature modifies documentation files (Markdown + VitePress config). There are no traditional data entities. This document catalogs the pages as entities with their change requirements.

## Page Inventory

### Landing Page (`docs/index.md`)

| Field | Current | Target |
|-------|---------|--------|
| Hero tagline | "Define policies in YAML, resolve relations from your database, and let the engine handle the rest — including partial evaluation for data filtering." | New tagline conveying 3 pillars without "database" |
| Hero actions | Get Started, View on GitHub | Why Toride, Get Started, View on GitHub |
| Feature card 1 | "YAML Policies" — declarative rules | Keep (good) |
| Feature card 2 | "Relation-Aware" — derive roles through relations | Keep (good) |
| Feature card 3 | "Partial Evaluation" — "Generate database-level WHERE clauses" | Rewrite: database-agnostic / bring your own data source |

**Note**: Current feature cards miss "type safety" and "database-agnostic" as distinct selling points. Need to rebalance to show the 3 pillars from FR-002: (1) YAML + type safety, (2) database-agnostic, (3) relation-aware.

### Getting Started (`docs/guide/getting-started.md`)

| Section | Current Issue | Fix |
|---------|--------------|-----|
| Intro paragraph (line 3) | "connects to your database" | "return attributes from any data source" |
| ORM Adapters heading | Already says "(Optional)" | Good — keep |
| ORM Adapters body (line 49) | "database-level WHERE clauses" | "query-level constraints" or "WHERE clauses for your ORM" |
| Project Setup item 2 (line 75) | "from your database" | "from any data source" |

### Quickstart (`docs/guide/quickstart.md`)

| Section | Current | Target |
|---------|---------|--------|
| Step 3 | Single db-based resolver example | In-memory resolver first (plain objects) |
| New section | N/A | "Real-World: Database Resolvers" after step 4 |
| Comment line 98 | "Replace the db calls with your actual database queries" | Remove (in-memory example is self-contained) |
| What's Next links | "database-level filtering" | "query-level filtering" |

### Why Toride (`docs/guide/why-toride.md`) — NEW

| Section | Content |
|---------|---------|
| Intro | One-paragraph positioning statement |
| §1 YAML as Single Source of Truth | Policy snippet + explanation |
| §2 Type Safety via Codegen | Codegen example + compile-time checks |
| §3 Database-Agnostic by Design | In-memory resolver + "resolvers are just functions" |
| §4 Relation-Based Policies | 3-level hierarchy YAML (Org → Project → Task) |
| §5 Partial Evaluation | Constraint generation example |

### Policy Format (`docs/concepts/policy-format.md`)

| Section | Change |
|---------|--------|
| Intro (line 3) | Add "single source of truth" framing |
| What's Next (line 310) | "filter data at the database level" → "push authorization into data-layer queries" |

### Roles & Relations (`docs/concepts/roles-and-relations.md`)

| Section | Change |
|---------|--------|
| Intro (line 3) | Add note about all patterns being declared in YAML |
| Resolving Relations (line 57) | Replace `db.*` example with in-memory example, add note that resolvers work with any data source |
| What's Next (line 342) | "filter data at the database level" → "push authorization into data-layer queries" |

### Partial Evaluation (`docs/concepts/partial-evaluation.md`)

| Section | Change |
|---------|--------|
| Intro (line 3) | Add "when your data source is a database" framing |
| Throughout | Change "your database" → "your data store" where it appears |
| Constraint adapter (line 104) | "your database's query format" → "your data store's query format" |

### Conditions & Rules (`docs/concepts/conditions-and-rules.md`)

| Section | Change |
|---------|--------|
| What's Next (line 471) | "translate conditions into database queries" → "translate conditions into data-layer queries" |

### Client-Side Hints (`docs/concepts/client-side-hints.md`)

| Section | Change |
|---------|--------|
| What's Next (line 263) | "filter data at the database level" → "push authorization into data-layer queries" |

### VitePress Config (`docs/.vitepress/config.ts`)

| Section | Change |
|---------|--------|
| Sidebar Guide items | Add `{ text: "Why Toride", link: "/guide/why-toride" }` as first item |
| Nav Guide link | Update to `/guide/why-toride` (first guide page) |

## Validation Rules

- Zero occurrences of "from your database" in any non-integration `.md` file
- Zero occurrences of "connects to your database" in any non-integration `.md` file
- "data source" used as canonical term (not "data provider", "data access layer")
- "Why Toride" page contains no competitor product names
- "Why Toride" page contains YAML example with 3+ level hierarchy
