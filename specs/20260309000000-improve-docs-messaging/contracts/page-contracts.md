# Page Contracts: Docs Messaging

This feature produces static Markdown pages for a VitePress site. The "contracts" are the content structure and messaging constraints each page must satisfy.

## Landing Page Contract (`docs/index.md`)

**Format**: VitePress home layout frontmatter

```yaml
hero:
  name: Toride
  text: "Relation-aware authorization for TypeScript"
  tagline: "<must convey: YAML type safety, database-agnostic, relation-aware>"
  actions:
    - { theme: brand, text: "Why Toride", link: "/guide/why-toride" }
    - { theme: alt, text: "Get Started", link: "/guide/getting-started" }
    - { theme: alt, text: "View on GitHub", link: "<github-url>" }

features:
  - title: "<YAML + Type Safety pillar>"
    details: "<emphasize YAML policies, codegen type safety>"
  - title: "<Database-Agnostic pillar>"
    details: "<emphasize resolvers as functions, any data source>"
  - title: "<Relation-Aware pillar>"
    details: "<emphasize declarative role derivation through YAML relations>"
```

**Constraints**:
- Zero occurrences of "database" in tagline
- Three feature cards mapping to three pillars
- "Why Toride" is primary (brand) action

## Why Toride Contract (`docs/guide/why-toride.md`)

**Format**: Standard Markdown page

```markdown
# Why Toride

<1-2 sentence positioning>

## YAML as the Single Source of Truth
<explanation + YAML snippet>

## Type Safety via Codegen
<explanation + codegen example>

## Database-Agnostic by Design
<explanation + in-memory resolver example>

## Relation-Based Policies
<3+ level hierarchy YAML example (Org → Project → Task)>
<explanation of automatic role propagation>

## Partial Evaluation
<explanation + constraint generation example>
```

**Constraints**:
- Zero competitor product names
- YAML hierarchy example must show 3+ levels
- Technical & concise tone throughout

## Quickstart Contract (`docs/guide/quickstart.md`)

**Format**: Step-by-step tutorial

```markdown
## 3. Create the Engine with Resolvers
<in-memory resolver example (plain objects, no db calls)>
<explanation: resolvers are functions, work with any data source>

## 4. Run Your First Permission Check
<same as current>

## 5. Real-World: Database Resolvers
<db-based resolver example>
<framing: "In production, your resolvers will typically query a database">
```

**Constraints**:
- In-memory example MUST come before database example
- In-memory example must be runnable without any database
- Database section clearly labeled as optional/real-world pattern

## Sidebar Contract (`docs/.vitepress/config.ts`)

```typescript
sidebar: [
  {
    text: "Guide",
    items: [
      { text: "Why Toride", link: "/guide/why-toride" },  // FIRST
      { text: "Getting Started", link: "/guide/getting-started" },
      { text: "Quickstart", link: "/guide/quickstart" },
    ],
  },
  // ... rest unchanged
]
```

## Banned Phrases (all non-integration pages)

- "from your database"
- "connects to your database"
- "fetch from your database"
- "your database" (in any phrasing implying requirement)

## Required Terminology

- Use "data source" (not "data provider", "data access layer", "backend")
- Use "resolvers are functions" (not "resolvers connect to")
- Use "when your data source is a database" (not "when you connect to your database")
