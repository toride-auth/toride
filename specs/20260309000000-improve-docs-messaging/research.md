# Research: Improve Official Docs Messaging

## Decision 1: Hero Tagline Direction

**Decision**: Draft 2-3 options emphasizing YAML-first, type-safe, database-agnostic authorization
**Rationale**: Current tagline ("Define policies in YAML, resolve relations from your database, and let the engine handle the rest") centers the database as a core requirement. The new tagline must convey three balanced pillars without mentioning databases.
**Alternatives considered**:
- Single-pillar tagline (just YAML): Too narrow, misses the relation-aware strength
- Technical specification style: Too dry for a hero section

**Proposed options** (to be refined during implementation):
1. "Type-safe authorization policies in YAML — database-agnostic, relation-aware, with partial evaluation built in."
2. "Define your authorization model in YAML. Bring any data source. Let the engine handle role propagation and data filtering."
3. "Declarative YAML policies with type safety, relation-aware role derivation, and zero infrastructure requirements."

## Decision 2: In-Memory Resolver Pattern

**Decision**: Use plain TypeScript objects/Maps as the data source in the primary quickstart example
**Rationale**: The existing quickstart uses `db.task.findById()` and `db.project.findById()` — implying an ORM/database. An in-memory version with plain objects proves zero-infrastructure claim and lowers the barrier to trying Toride.
**Alternatives considered**:
- Using a Map: Slightly more realistic but adds unnecessary complexity for a quickstart
- Using a JSON file: Still introduces I/O, not minimal enough

**Pattern**:
```typescript
// In-memory data — no database needed
const projects = {
  "proj-1": { status: "active", department: "engineering" },
};

const tasks = {
  "task-42": { projectId: "proj-1", assigneeId: "alice", status: "open" },
};

const engine = new Toride({
  policy: await loadYaml("./policy.yaml"),
  resolvers: {
    Project: async (ref) => {
      const project = projects[ref.id];
      return { status: project.status, department: project.department };
    },
    Task: async (ref) => {
      const task = tasks[ref.id];
      return {
        project: { type: "Project", id: task.projectId },
        assignee: { type: "User", id: task.assigneeId },
        status: task.status,
      };
    },
  },
});
```

## Decision 3: "Why Toride" Page Structure

**Decision**: Technical & concise style with 5 sections, each with a short explanation and a code/YAML example
**Rationale**: User preference for "let the tech speak for itself" style. Similar to Zod/tRPC docs approach.
**Alternatives considered**:
- Narrative/persuasive (Prisma-style): User rejected
- Comparison-style: User rejected; spec also prohibits naming competitors

**Page outline**:
1. **YAML as the Single Source of Truth** — Show a complete policy snippet, explain that the authorization model lives in YAML, not scattered across code
2. **Type Safety via Codegen** — Show codegen output, explain compile-time validation of resolvers
3. **Database-Agnostic by Design** — Show in-memory resolver, explain that resolvers are just functions
4. **Relation-Based Policies** — Show 3+ level hierarchy (Org → Project → Task) in YAML, explain automatic role propagation
5. **Partial Evaluation** — Show constraint generation, explain how it enables data filtering with any adapter

## Decision 4: Canonical Terminology

**Decision**: Use "data source" consistently across all docs
**Rationale**: Clarified in spec session — "data source" is the canonical term
**Alternatives considered**:
- "data provider": Too abstract, sounds like a framework concept
- "data access layer": Too enterprise/architectural
- "backend": Too vague, could mean server vs client

**Usage patterns**:
- "Resolvers return attributes from any data source"
- "Bring your own data source"
- "Whether your data source is a database, REST API, or in-memory store"

## Decision 5: Partial Evaluation Page Framing

**Decision**: Keep "database" where technically accurate but add conditional framing
**Rationale**: Partial evaluation genuinely targets database queries (WHERE clauses). Removing "database" entirely would be inaccurate. Instead, frame it as "when you use a database" to make it clear it's an optional capability.
**Alternatives considered**:
- Replace all "database" with "data store": Inaccurate — partial evaluation specifically generates SQL-style constraints
- Leave unchanged: Violates FR-010

**Framing pattern**: "When your data source is a database, partial evaluation lets you push authorization logic into your queries as WHERE clauses."

## Decision 6: Concept Page Framing Updates

**Decision**: Add "single source of truth" framing to intro paragraphs only; do not restructure pages
**Rationale**: User preference for minimal changes. Existing page structure is good; just needs updated framing language.
**Alternatives considered**:
- Full rewrite: User rejected (overkill)
- Add callout boxes: User rejected (light restructuring)

**Changes**:
- Policy Format intro: Add sentence about YAML being the single source of truth
- Roles & Relations intro: Add note about all derivation patterns being declared in YAML
- Roles & Relations "Resolving Relations" section: Show in-memory example alongside current db example, or replace db example with in-memory + note about databases
