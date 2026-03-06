# Toride (砦): Relation-Aware Authorization Engine

## Architecture Specification v1.1

---

## 1. Problem Statement & Design Goals

### What Exists Today

| System | Strengths | Weaknesses |
|--------|-----------|------------|
| **CASL** | Simple JS API, isomorphic, great DX | No relations, static conditions, no partial eval |
| **Oso/Polar** | Resource blocks, ReBAC, partial eval | Deprecated OSS, Rust/WASM, custom DSL |
| **Cedar** | Formal verification, `permit`/`forbid`, `when` | No in-process TS, no relation traversal |
| **Zanzibar** (SpiceDB, Permify, OpenFGA) | Massive scale, relation graphs | External service, no ABAC |
| **OPA/Rego** | General-purpose, mature | Not authz-specific, Rego learning curve |

### What Toride Provides

A **framework-agnostic TypeScript library** that combines:

- **From Polar**: Resource-centric organization, derived roles, relation-based role derivation, global roles
- **From Cedar**: `permit`/`forbid` rules with `when` conditions
- **From Zanzibar**: Relation-based role derivation across resource hierarchies
- **From CASL**: Isomorphic JS, zero infrastructure, type-safe API
- **From Oso data filtering**: Partial evaluation → constraint AST → your ORM

**Non-goals**: Custom DSL parser, external service, Google-scale consistency, recursive relation traversal (v1).

---

## 2. Policy Format

### 2.1 Design Principles

1. **Valid YAML/JSON** — every policy must parse as standard YAML or JSON
2. **Explicit over clever** — no magic strings, no hidden inheritance
3. **Co-located** — everything about a resource lives in its block
4. **Reads well** — structured, scannable by a human
5. **Serializable** — storable in a DB, versionable, diffable

### 2.2 Top-Level Structure

A Toride policy has four top-level sections:

```yaml
version: "1"

actors:
  # Actor type declarations with attributes

global_roles:
  # Roles derived from actor attributes, not tied to any resource

resources:
  # Resource blocks with roles, permissions, relations, grants, derived_roles, rules

tests:
  # Optional: declarative test cases for policy validation
```

### 2.3 Actor Declarations

Actors define the types of entities that can perform actions. Each actor type declares its attributes.

```yaml
actors:
  User:
    attributes:
      id: string
      email: string
      department: string
      isSuperAdmin: boolean
      isLead: boolean

  ServiceAccount:
    attributes:
      id: string
      scope: string
      service: string
```

Multiple actor types are supported. The engine uses actor type to determine which global roles and derived role conditions apply.

### 2.4 Global Roles

Global roles are derived from actor attributes and actor type. They are not tied to any specific resource instance. Each global role specifies which actor type it applies to and the conditions under which it is assumed.

```yaml
global_roles:
  superadmin:
    actor_type: User
    when:
      $actor.isSuperAdmin: true

  department_lead:
    actor_type: User
    when:
      all:
        - $actor.isLead: true
        - $actor.department: { exists: true }

  readonly_service:
    actor_type: ServiceAccount
    when:
      $actor.scope: read

  admin_service:
    actor_type: ServiceAccount
    when:
      any:
        - $actor.scope: admin
        - $actor.scope: system
```

The `when` block supports the full condition syntax (equality, operators, `any`, `all`, cross-references).

### 2.5 Resource Blocks

```yaml
resources:

  Organization:
    roles: [viewer, member, admin, owner]
    permissions: [read, update, delete, invite, manage_billing]

    grants:
      viewer: [read]
      member: [read]
      admin:  [read, update, invite]
      owner:  [all]                    # 'all' = every permission on this resource

    derived_roles:
      - role: owner
        from_global_role: superadmin


  Project:
    roles: [viewer, editor, admin]
    permissions: [read, update, delete, create_task, manage_members]

    relations:
      org:  { resource: Organization, cardinality: one }
      team: { resource: Team, cardinality: one }

    grants:
      viewer: [read]
      editor: [read, update, create_task]
      admin:  [all]

    derived_roles:
      # From global role
      - role: admin
        from_global_role: superadmin

      # From role on related resource
      - role: admin
        from_role: admin
        on_relation: org

      - role: viewer
        from_role: member
        on_relation: org

      - role: editor
        from_role: lead
        on_relation: team

      # From actor attribute + actor type
      - role: viewer
        actor_type: User
        when:
          $actor.department: engineering

      # ServiceAccount with matching service → viewer
      - role: viewer
        actor_type: ServiceAccount
        when:
          $actor.service: $resource.serviceName

    rules:
      - effect: permit
        roles: [viewer]
        permissions: [read]
        when:
          resource.isPublic: true

      - effect: forbid
        permissions: [delete]
        when:
          resource.archived: true

    field_access:
      budget:    { read: [admin], update: [admin] }
      status:    { read: [viewer, editor, admin], update: [editor, admin] }


  Task:
    roles: [viewer, editor]
    permissions: [read, update, delete, assign, change_status]

    relations:
      project:  { resource: Project, cardinality: one }
      assignee: { resource: User, cardinality: one }

    grants:
      viewer: [read]
      editor: [read, update, delete, assign, change_status]

    derived_roles:
      # From global roles
      - role: editor
        from_global_role: superadmin

      - role: viewer
        from_global_role: readonly_service

      # From role on related resource
      - role: editor
        from_role: editor
        on_relation: project

      - role: viewer
        from_role: viewer
        on_relation: project

      # From relation identity (being the assignee → editor)
      - role: editor
        from_relation: assignee

      # Actor attribute with complex conditions
      - role: editor
        actor_type: User
        when:
          any:
            - $actor.isSuperAdmin: true
            - all:
                - $actor.department: $resource.department
                - $actor.isLead: true

    rules:
      - effect: forbid
        permissions: [update, delete, assign, change_status]
        when:
          resource.project.status: completed


  Document:
    roles: [viewer, editor, owner]
    permissions: [read, edit, delete, share, comment]

    relations:
      project:     { resource: Project, cardinality: one }
      creator:     { resource: User, cardinality: one }
      shared_with: { resource: User, cardinality: many }

    grants:
      viewer: [read, comment]
      editor: [read, comment, edit]
      owner:  [all]

    derived_roles:
      - role: viewer
        from_role: viewer
        on_relation: project

      - role: editor
        from_role: editor
        on_relation: project

      # Relation identity → role
      - role: owner
        from_relation: creator

      - role: viewer
        from_relation: shared_with

      # Global role
      - role: owner
        from_global_role: superadmin

    rules:
      - effect: permit
        roles: [viewer]
        permissions: [read]
        when:
          resource.visibility: public

      - effect: forbid
        roles: [editor]
        permissions: [edit]
        when:
          resource.status: draft
          $actor.id: { neq: $resource.creatorId }
```

### 2.6 Anatomy of a Resource Block

Every resource block has these sections. Only `roles` and `permissions` are required:

```yaml
SomeResource:
  # What roles exist on this resource (REQUIRED)
  roles: [...]

  # What actions can be performed (REQUIRED)
  permissions: [...]

  # Connections to other resources
  relations:
    name: { resource: Type, cardinality: one|many }

  # Which roles grant which permissions (explicit, no inheritance)
  # Use 'all' to grant every permission defined on this resource
  grants:
    role: [permission, ...]

  # How roles are derived (5 patterns)
  derived_roles:
    # Pattern 1: From a global role
    - role: local_role
      from_global_role: global_role_name

    # Pattern 2: From a role on a related resource
    - role: local_role
      from_role: remote_role
      on_relation: relation_name

    # Pattern 3: From a relation identity (being the related entity)
    - role: local_role
      from_relation: relation_name

    # Pattern 4: From actor attributes + type
    - role: local_role
      actor_type: ActorType        # optional: restricts to specific actor type
      when: { ... }                # conditions on $actor and/or $resource

    # Pattern 5: Combinations (e.g., restrict a relation derivation to an actor type)
    - role: local_role
      from_role: remote_role
      on_relation: relation_name
      actor_type: User

  # Conditional permit/forbid rules (ABAC layer)
  rules:
    - effect: permit|forbid
      roles: [...]                   # optional: restrict rule to specific roles
      permissions: [...]
      when: { ... }

  # Field-level access control
  field_access:
    field_name: { read: [role, ...], update: [role, ...] }
```

---

## 3. Role Resolution

### 3.1 How Roles Are Resolved

When checking "Does actor X have role Y on resource Z?", Toride checks **four sources**:

```
1. DIRECT ASSIGNMENT
   └─ resolver.getRoles(actor, resource) → ["editor"]
      (your DB: role_assignments table)

2. DERIVED FROM ROLE ON RELATED RESOURCE
   └─ derived_roles: role "editor" from_role "editor" on_relation "project"
      └─ resolver.getRelated(task, "project") → Project:7
          └─ Does actor have "editor" on Project:7? (recurse from step 1)

3. DERIVED FROM RELATION IDENTITY
   └─ derived_roles: role "owner" from_relation "creator"
      └─ resolver.getRelated(document, "creator") → User:42
          └─ Is actor.id === User:42.id? → actor has "owner" role

4. DERIVED FROM GLOBAL ROLE
   └─ derived_roles: role "admin" from_global_role "superadmin"
      └─ Actor has global role "superadmin"? (check actor type + attribute conditions)

5. DERIVED FROM ACTOR ATTRIBUTES
   └─ derived_roles: role "viewer" actor_type User when $actor.department: engineering
      └─ Actor is User AND department === "engineering"? → actor has "viewer"
```

Then permissions are checked:

```
6. GRANTS
   └─ actor has role "editor" → grants: editor: [read, update, create_task]
       → actor can "read", "update", and "create_task"

7. CONDITIONAL RULES
   └─ Any matching "permit" rule? → add those permissions
   └─ Any matching "forbid" rule? → remove those permissions (always wins)
```

### 3.2 Decision Precedence

```
FORBID rules (condition-matched)     →  DENIED  (always wins)
        ↑ overrides
PERMIT via grants                    →  ALLOWED
PERMIT rules (condition-matched)     →  ALLOWED
        ↑ overrides
Nothing matched                      →  DENIED  (default deny)
```

### 3.3 Permit Rules Require a Role

Permit rules can only grant additional permissions to actors who **already have at least one role** on the resource. An actor with no role gets nothing, even if a permit rule's conditions match.

For "public access" patterns (anyone can read), assign a conventional role like `everyone` or `public` to all actors via the resolver.

### 3.4 Forbid Rules Are Direct Only

Forbid rules only apply to the resource they are defined on. They do not propagate through relations to child resources. If you need to forbid actions on Tasks when the parent Organization is frozen, write a rule on Task that checks `resource.project.org.frozen`.

### 3.5 Forbid Rules Require a Role

Forbid rules are only evaluated for actors who have at least one role on the resource. If an actor has no roles, they are already denied by default — evaluating forbid rules would be redundant. This optimization also avoids unnecessary resolver calls for condition evaluation.

### 3.6 Role Evaluation Strategy: Exhaustive

The engine always evaluates **all** derivation paths for every role, even after finding a match. This means:

- `can()` and `explain()` use the same code path — no behavioral divergence
- `explain()` shows every reason a role was granted, not just the first one found
- Performance cost is negligible for typical policies (3-5 derived role entries per resource)

### 3.7 Actor Type and Derived Role Matching

When a `derived_roles` entry without an `actor_type` filter references `$actor.x` in its `when` condition, the engine checks whether the actor's declared type (from the `actors` section) declares attribute `x`:

- **If the actor type declares the attribute**: The condition is evaluated normally
- **If the actor type does NOT declare the attribute**: The derived role entry is **silently skipped** for that actor type

This prevents accidental matches when actor types have different attribute schemas. To apply a derived role to multiple actor types with different attributes, use separate entries with explicit `actor_type` filters.

---

## 4. Condition Expressions

### 4.1 Simple Conditions

```yaml
when:
  # Shorthand: bare primitives (string, number, boolean) mean equality
  resource.isPublic: true
  resource.status: active

  # Cross-reference between actor and resource
  $actor.id: $resource.ownerId
  $actor.department: $resource.department
```

All conditions in a `when` block are ANDed together.

**Important**: The shorthand only works for primitive values (strings, numbers, booleans). Object values must use explicit operators.

### 4.2 Null/Undefined Semantics

Cross-references follow **strict null semantics**: `undefined`/`null` never equals anything, including another `undefined`/`null`. This ensures missing data never accidentally grants access.

```yaml
# If actor.department is undefined and resource.department is undefined:
$actor.department: $resource.department  # → false (strict: undefined !== undefined)
```

### 4.3 Operators

```yaml
when:
  # Equality (explicit)
  resource.status: { eq: active }

  # Comparison
  resource.priority: { gt: 3 }
  resource.priority: { gte: 3, lte: 10 }     # range (AND)

  # Set operations
  resource.status: { in: [draft, review] }
  resource.tags: { includes: urgent }          # array contains value

  # Cross-reference in 'in' operator
  resource.status: { in: $actor.allowedStatuses }  # dynamic whitelist from actor attribute

  # Existence
  resource.publishedAt: { exists: true }
  resource.deletedAt: { exists: false }

  # Pattern
  resource.email: { endsWith: "@acme.com" }
  resource.name: { startsWith: "draft-" }
  resource.description: { contains: "urgent" }

  # Negation
  resource.locked: { neq: true }

  # Cross-reference with operator
  $actor.clearanceLevel: { gte: $resource.requiredClearance }

  # Nested property access (triggers relation resolution)
  resource.project.status: active
  resource.project.org.plan: { in: [pro, enterprise] }

  # Environment
  $env.now: { lt: $resource.deadline }
```

### 4.4 Nested Property Depth

Nested property access like `resource.project.org.plan` triggers relation resolution at each step. A configurable depth limit prevents accidental performance cliffs.

- Default: 3 levels deep
- Configurable via `Toride({ maxConditionDepth: 5 })`

Note: This is separate from the role derivation chain depth limit (see Section 12).

### 4.5 Cardinality: many in Conditions

When a condition traverses a `cardinality: many` relation (e.g., `resource.shared_with.department`), the semantics are **ANY (exists)**: the condition is true if **at least one** related entity satisfies it. This maps naturally to SQL `EXISTS`/`JOIN`.

```yaml
# True if ANY of the shared_with users has department "engineering"
resource.shared_with.department: engineering
```

### 4.6 Logical Combinators

```yaml
# OR
when:
  any:
    - $actor.id: $resource.ownerId
    - $actor.isSuperAdmin: true

# Nested AND inside OR
when:
  any:
    - all:
        - resource.visibility: internal
        - $actor.department: $resource.department
    - resource.visibility: public
```

### 4.7 Custom Evaluators (Escape Hatch)

For logic that cannot be expressed in conditions:

```yaml
rules:
  - effect: permit
    roles: [editor]
    permissions: [access]
    when:
      custom: businessHours

  - effect: forbid
    permissions: [remote_access]
    when:
      custom: outsideGeoFence
```

Registered in code:

```typescript
const engine = new Toride({
  policy: await loadYaml("./policy.yaml"),
  resolver: myResolver,
  customEvaluators: {
    businessHours: (ctx) => {
      const hour = ctx.env.now.getHours();
      return hour >= 9 && hour < 17;
    },
    outsideGeoFence: (ctx) => {
      return !isWithinRadius(ctx.actor.location, ctx.resource.location, 50);
    },
  },
});
```

**Error handling in custom evaluators**: If a custom evaluator throws an error:
- In a **permit** rule: The permit does not apply (no access granted)
- In a **forbid** rule: The forbid is treated as **matched** (access denied) — fail-closed, consistent with resolver error behavior

**Partial evaluation**: When `buildConstraints()` encounters a custom evaluator, it emits an `{ type: "unknown", name: "businessHours" }` constraint node. The adapter decides how to handle it (e.g., fetch all and post-filter).

---

## 5. Relation Resolver

The user-provided bridge between Toride and the data layer.

```typescript
interface RelationResolver {
  /**
   * What roles does this actor have on this specific resource?
   * This is the DIRECT assignment check — your role_assignments table.
   */
  getRoles(
    actor: ActorRef,
    resource: ResourceRef
  ): Promise<string[]>;

  /**
   * Resolve a named relation on a resource.
   *
   * Examples:
   *   getRelated({ type: "Task", id: "42" }, "project")
   *     → { type: "Project", id: "7" }
   *   getRelated({ type: "Document", id: "1" }, "shared_with")
   *     → [{ type: "User", id: "3" }, { type: "User", id: "5" }]
   */
  getRelated(
    resource: ResourceRef,
    relationName: string
  ): Promise<ResourceRef | ResourceRef[]>;

  /**
   * Fetch resource attributes for condition evaluation.
   * Called lazily — only when a rule has conditions referencing resource fields.
   */
  getAttributes(
    ref: ResourceRef
  ): Promise<Record<string, unknown>>;
}
```

### Error Handling

If any resolver method throws (DB down, relation not found, timeout), the authorization check returns **denied** (fail closed). Resolver errors never grant access.

### Per-Check Caching

Within a single `can()` call, Toride caches all resolver results (`getRoles`, `getRelated`, `getAttributes`) by `(type, id)` key. If multiple derived roles check the same relation, or if the same resource's attributes are needed for both a derived_role condition and a rule condition, the resolver is called only once. The cache is automatically cleared after the check completes.

For `canBatch()`, the cache is **shared across all checks** in the batch. If Task:1 and Task:2 both reference Project:7, `getRelated` and `getAttributes` for Project:7 are called only once.

### Cycle Detection

Cycle detection uses **path-based tracking**: the engine tracks the actual resolution path (e.g., `Task:42 → Project:7 → Org:1`). Only if the same `(resourceType, resourceId)` pair appears twice in one resolution path does the engine **throw an error**. DAG-shaped policies (multiple paths converging on the same resource without cycles) are valid.

### Prisma Example

```typescript
const resolver: RelationResolver = {
  async getRelated(resource, relation) {
    switch (`${resource.type}.${relation}`) {
      case "Task.project": {
        const task = await prisma.task.findUniqueOrThrow({
          where: { id: resource.id },
          select: { projectId: true },
        });
        return { type: "Project", id: task.projectId };
      }
      case "Task.assignee": {
        const task = await prisma.task.findUniqueOrThrow({
          where: { id: resource.id },
          select: { assigneeId: true },
        });
        return { type: "User", id: task.assigneeId };
      }
      case "Document.shared_with": {
        const shares = await prisma.documentShare.findMany({
          where: { documentId: resource.id },
          select: { userId: true },
        });
        return shares.map(s => ({ type: "User", id: s.userId }));
      }
      case "Project.org": {
        const project = await prisma.project.findUniqueOrThrow({
          where: { id: resource.id },
          select: { orgId: true },
        });
        return { type: "Organization", id: project.orgId };
      }
      default:
        throw new Error(`Unknown relation: ${resource.type}.${relation}`);
    }
  },

  async getRoles(actor, resource) {
    const assignments = await prisma.roleAssignment.findMany({
      where: {
        userId: actor.id,
        resourceType: resource.type,
        resourceId: resource.id,
      },
      select: { role: true },
    });
    return assignments.map(a => a.role);
  },

  async getAttributes(ref) {
    const model = ref.type.charAt(0).toLowerCase() + ref.type.slice(1);
    return await (prisma as any)[model].findUniqueOrThrow({
      where: { id: ref.id },
    });
  },
};
```

---

## 6. Partial Evaluation (Data Filtering)

### 6.1 The Problem

```typescript
// ❌ Naive: O(n) checks — doesn't scale
const allTasks = await prisma.task.findMany();
const readable = [];
for (const task of allTasks) {
  if (await engine.can(user, "read", { type: "Task", id: task.id })) {
    readable.push(task);
  }
}
```

### 6.2 Toride's Approach

Toride partially evaluates the policy and emits a **Constraint AST** — a structured tree describing what must be true about a resource for the actor to have the requested permission. The user then translates this AST to their ORM query.

```typescript
// ✅ Efficient: emit constraints, translate to Prisma WHERE clause
const result = await engine.buildConstraints(actor, "read", "Task");
if (result.unrestricted) {
  // Actor can read ALL tasks (e.g., superadmin)
  return prisma.task.findMany();
}
if (result.forbidden) {
  // Actor cannot read ANY tasks
  return [];
}
const where = engine.translateConstraints(result.constraints, prismaTaskAdapter);
const tasks = await prisma.task.findMany({ where });
```

### 6.3 buildConstraints() Return Type

`buildConstraints()` returns a **wrapper with sentinel flags** rather than a raw Constraint:

```typescript
type ConstraintResult =
  | { unrestricted: true }              // Actor can access ALL resources of this type
  | { forbidden: true }                 // Actor cannot access ANY resources of this type
  | { constraints: Constraint }         // Actor can access resources matching these constraints
```

This allows callers to optimize the common cases (superadmin, no access) without requiring the adapter to handle `always`/`never` nodes.

### 6.4 Constraint Evaluation

Toride does NOT pre-resolve relations into ID lists. Instead, it emits nested `relation` constraints and `has_role` constraints that the adapter translates to efficient JOINs/subqueries. Reference adapters for Prisma and Drizzle are provided.

### 6.5 Partial Evaluation of Known Values

During `buildConstraints()`:

- **`$actor` references**: Inlined with concrete values from the actor's attributes. E.g., `$actor.department: $resource.department` becomes `{ type: "field_eq", field: "department", value: "engineering" }`
- **`$env` references**: Inlined with concrete values passed at call time. E.g., `$env.now: { lt: $resource.deadline }` becomes `{ type: "field_gt", field: "deadline", value: "2024-01-15T..." }`
- **Relation-based derived roles**: Emit `has_role` constraint nodes (see below)

### 6.6 Constraint AST Types

The Constraint AST is a **public stable API** with semver guarantees. Breaking changes require a major version bump.

```typescript
type Constraint =
  // Field conditions
  | { type: "field_eq";       field: string; value: unknown }
  | { type: "field_neq";      field: string; value: unknown }
  | { type: "field_gt";       field: string; value: unknown }
  | { type: "field_gte";      field: string; value: unknown }
  | { type: "field_lt";       field: string; value: unknown }
  | { type: "field_lte";      field: string; value: unknown }
  | { type: "field_in";       field: string; values: unknown[] }
  | { type: "field_nin";      field: string; values: unknown[] }
  | { type: "field_exists";   field: string; exists: boolean }
  | { type: "field_includes"; field: string; value: unknown }
  | { type: "field_contains"; field: string; value: string }

  // Relation constraint
  // "This resource's FK field points to a related resource
  //  that itself satisfies a nested constraint"
  | { type: "relation";
      field: string;                // FK field (e.g., "projectId")
      resourceType: string;         // related type (e.g., "Project")
      constraint: Constraint;       // what must be true on the related resource
    }

  // Role constraint (for relation-based derived roles in partial eval)
  // "The related resource has a role assignment for this actor"
  | { type: "has_role";
      actorId: string;              // the actor's ID
      actorType: string;            // the actor's type
      role: string;                 // the required role
    }

  // Custom evaluator (escape hatch — adapter decides handling)
  | { type: "unknown"; name: string }

  // Combinators
  | { type: "and"; children: Constraint[] }
  | { type: "or";  children: Constraint[] }
  | { type: "not"; child: Constraint }

  // Terminal (used internally, not emitted to adapters via translateConstraints)
  | { type: "always" }              // unconditionally true
  | { type: "never" }               // unconditionally false
```

### 6.7 ConstraintAdapter Interface

The user implements this to translate constraints to their ORM:

```typescript
interface ConstraintAdapter<TQuery> {
  /** Translate a leaf constraint into your query language. */
  translate(constraint: LeafConstraint): TQuery;

  /** Handle a relation constraint — produce a JOIN or subquery. */
  relation(field: string, resourceType: string, childQuery: TQuery): TQuery;

  /** Handle a has_role constraint — produce a role assignment check. */
  hasRole(actorId: string, actorType: string, role: string): TQuery;

  /** Handle an unknown constraint (custom evaluator). */
  unknown(name: string): TQuery;

  /** Combinators. */
  and(queries: TQuery[]): TQuery;
  or(queries: TQuery[]): TQuery;
  not(query: TQuery): TQuery;
}
```

### 6.8 Prisma Adapter Example

```typescript
import { Prisma } from "@prisma/client";

type PrismaWhere = Prisma.TaskWhereInput;

const prismaTaskAdapter: ConstraintAdapter<PrismaWhere> = {
  translate(c) {
    switch (c.type) {
      case "field_eq":
        return { [c.field]: c.value };
      case "field_neq":
        return { [c.field]: { not: c.value } };
      case "field_in":
        return { [c.field]: { in: c.values } };
      case "field_gt":
        return { [c.field]: { gt: c.value } };
      case "field_exists":
        return c.exists
          ? { [c.field]: { not: null } }
          : { [c.field]: null };
      case "field_contains":
        return { [c.field]: { contains: c.value } };
      default:
        throw new Error(`Unhandled constraint: ${c.type}`);
    }
  },

  relation(field, resourceType, childQuery) {
    const relationName = field.replace("Id", "");
    return { [relationName]: childQuery };
  },

  hasRole(actorId, actorType, role) {
    return {
      roleAssignments: {
        some: {
          userId: actorId,
          role: role,
        },
      },
    };
  },

  unknown(name) {
    // Custom evaluators can't be translated to SQL
    // Return a no-op and post-filter in application code
    return {};
  },

  and(queries) {
    return { AND: queries };
  },
  or(queries) {
    return { OR: queries };
  },
  not(query) {
    return { NOT: query };
  },
};
```

### 6.9 Usage

```typescript
// Get the constraint result
const result = await engine.buildConstraints(actor, "read", "Task");

if (result.unrestricted) {
  // Superadmin: no WHERE clause needed
  return prisma.task.findMany({ orderBy: { createdAt: "desc" }, take: 20 });
}

if (result.forbidden) {
  // No access at all
  return [];
}

// Translate to Prisma WHERE clause
const where = engine.translateConstraints(result.constraints, prismaTaskAdapter);

// Compose with your own filters
const tasks = await prisma.task.findMany({
  where: { AND: [where, { status: "active" }] },
  orderBy: { createdAt: "desc" },
  take: 20,
});
```

---

## 7. TypeScript API

### 7.1 Setup

```typescript
import { Toride, loadYaml } from "toride";

const engine = new Toride({
  policy: await loadYaml("./policies/main.yaml"),
  resolver: myRelationResolver,
});
```

### 7.2 Core Types

```typescript
// All IDs are strings. Users convert their IDs as needed.
interface ActorRef {
  type: string;       // "User", "ServiceAccount"
  id: string;
  attributes: Record<string, unknown>;
}

interface ResourceRef {
  type: string;       // "Task", "Project", etc.
  id: string;
}
```

### 7.3 Core Checks

```typescript
// Boolean check
const allowed = await engine.can(actor, "update", { type: "Task", id: "42" });

// With environment context (per-check)
const allowed = await engine.can(actor, "update", task, {
  env: { now: new Date(), ip: req.ip },
});

// What can this actor do on this resource?
const actions = await engine.permittedActions(actor, { type: "Task", id: "42" });
// → ["read", "update", "change_status"]

// What roles does this actor have on this resource?
const roles = await engine.resolvedRoles(actor, { type: "Task", id: "42" });
// → ["editor", "viewer"]
// Includes both direct and derived roles. Uses the same per-check cache as can().

// Batch (shared cache across all checks in the batch)
const results = await engine.canBatch(actor, [
  { action: "read",   resource: { type: "Task", id: "1" } },
  { action: "update", resource: { type: "Task", id: "2" } },
  { action: "delete", resource: { type: "Task", id: "3" } },
]);
// → [true, true, false]

// Field-level check
const canReadSalary = await engine.canField(
  actor, "read", { type: "Employee", id: "42" }, "salary"
);
```

### 7.4 Partial Evaluation

```typescript
// Constraint result (with sentinel flags)
const result = await engine.buildConstraints(actor, "read", "Task");

// Translate with adapter (only when result has constraints)
if (!result.unrestricted && !result.forbidden) {
  const where = engine.translateConstraints(result.constraints, prismaAdapter);
}
```

### 7.5 Explain / Debug

```typescript
const decision = await engine.explain(actor, "delete", { type: "Task", id: "42" });
// → {
//   allowed: false,
//   resolvedRoles: {
//     direct: [],
//     derived: [
//       { role: "editor", via: "from_role editor on_relation project (Project:7)" },
//       { role: "viewer", via: "from_global_role readonly_service" },
//     ]
//   },
//   grantedPermissions: ["read", "update", "delete", "assign", "change_status"],
//   matchedRules: [
//     {
//       effect: "forbid",
//       matched: true,
//       rule: { effect: "forbid", permissions: [...], when: { ... } },
//       resolvedValues: { "resource.project.status": "completed" },
//     }
//   ],
//   finalDecision: "DENIED: forbid rule matched",
// }
```

`explain()` is available in all environments (dev and production). It uses the same exhaustive role evaluation as `can()`, so it always shows every derivation path. Useful for audit logging and debugging production authorization issues.

### 7.6 Audit Events

Toride emits events asynchronously (fire-and-forget) after authorization decisions:

```typescript
const engine = new Toride({
  policy,
  resolver,
  onDecision: (event) => {
    auditLog.write({
      actor: event.actor,
      action: event.action,
      resource: event.resource,
      allowed: event.allowed,
      roles: event.resolvedRoles,
      matchedRules: event.matchedRules,
      timestamp: event.timestamp,
    });
  },
  onQuery: (event) => {
    // Fired for buildConstraints() calls
    auditLog.write({
      actor: event.actor,
      action: event.action,
      resourceType: event.resourceType,
      resultType: event.resultType,  // "unrestricted" | "forbidden" | "constrained"
      timestamp: event.timestamp,
    });
  },
});
```

- `onDecision` fires for `can()`, `canBatch()`, `canField()` calls
- `onQuery` fires for `buildConstraints()` calls

Events are non-blocking. If the listener throws, it does not affect the authorization result.

### 7.7 Policy Loading

```typescript
// YAML
import { loadYaml } from "toride";
const policy = await loadYaml("./policies/main.yaml");

// JSON
import { loadJson } from "toride";
const policy = await loadJson("./policies/main.json");

// Hot-reload: users implement their own reload logic
const watcher = fs.watch("./policy.yaml", async () => {
  const updated = await loadYaml("./policy.yaml");
  engine.setPolicy(updated);
});

// Merge policies (additive union only)
import { mergePolicies } from "toride";
const merged = mergePolicies(basePolicy, tenantOverrides);
engine.setPolicy(merged);
```

**`setPolicy()` concurrency**: Policy swap is atomic. In-flight `can()` calls that already started use the old policy (they captured a reference at the start of evaluation). New calls use the new policy. No mixed-policy results.

`mergePolicies()` performs additive union: roles merge, grants merge (union of permissions per role), rules are appended (concatenated). If both policies define the same resource with conflicting grants, a validation error is thrown. Conflicting rules (e.g., forbid vs permit on the same permissions) are silently appended — the forbid-wins precedence handles resolution at evaluation time.

### 7.8 Policy Validation

Policy is validated **strictly at load time**. `loadYaml()` / `loadJson()` throws if the policy has inconsistencies:

- Role used in grants but not declared in `roles`
- Permission used in grants but not declared in `permissions`
- Relation referenced in `derived_roles` but not declared in `relations`
- Unknown operator in conditions
- Circular relation references detectable at parse time
- **`$actor.x` references validated against actor declarations**: If a condition references `$actor.someField`, the engine checks that the relevant actor type(s) declare that attribute. This catches typos early.

Error messages include the **logical path** to the offending node:

```
ValidationError: resources.Task.derived_roles[2].on_relation references unknown relation "projects" (did you mean "project"?)
```

### 7.9 Type Safety

```typescript
import { createToride } from "toride";

type Actions = "read" | "update" | "delete" | "create_task" | "assign";
type Resources = "Organization" | "Project" | "Task" | "Document";

const engine = createToride<Actions, Resources>({
  policy: await loadYaml("./policy.yaml"),
  resolver: myResolver,
});

await engine.can(actor, "read", task);     // ✅
await engine.can(actor, "fly", task);       // ❌ Type error
```

For full type safety from policy files, use `@toride/codegen`:

```bash
npx toride-codegen ./policy.yaml -o ./generated/toride-types.ts
```

### 7.10 Codegen Output

`@toride/codegen` generates:

1. **Action and resource union types**
2. **A fully typed `RelationResolver` interface** with exact relation names, return types matching cardinality, and attribute shapes derived from the policy

```typescript
// generated/toride-types.ts

export type Actions = "read" | "update" | "delete" | "create_task" | "assign" | "change_status" | /* ... */;
export type Resources = "Organization" | "Project" | "Task" | "Document";

export interface RelationMap {
  Task: {
    project: { type: "Project"; cardinality: "one" };
    assignee: { type: "User"; cardinality: "one" };
  };
  Document: {
    project: { type: "Project"; cardinality: "one" };
    creator: { type: "User"; cardinality: "one" };
    shared_with: { type: "User"; cardinality: "many" };
  };
  Project: {
    org: { type: "Organization"; cardinality: "one" };
    team: { type: "Team"; cardinality: "one" };
  };
  // ...
}

// Typed resolver interface — TypeScript errors if you miss a relation
export interface TypedRelationResolver {
  getRelated<R extends keyof RelationMap>(
    resource: ResourceRef & { type: R },
    relation: keyof RelationMap[R]
  ): Promise</* ResourceRef or ResourceRef[] based on cardinality */>;

  getRoles(actor: ActorRef, resource: ResourceRef): Promise<string[]>;
  getAttributes(ref: ResourceRef): Promise<Record<string, unknown>>;
}
```

If you add a new relation to the policy and re-run codegen, TypeScript will error on your resolver until you handle it.

### 7.11 Client-Side Sync

```typescript
// Server: build a snapshot of permissions for specific resources
const snapshot = await engine.snapshot(actor, [
  { type: "Project", id: "7" },
  { type: "Task", id: "42" },
  { type: "Task", id: "43" },
]);
// → {
//   "Project:7":  ["read", "update", "create_task"],
//   "Task:42":    ["read", "update", "change_status"],
//   "Task:43":    ["read"],
// }

// Client: instant sync checks from snapshot
import { TorideClient } from "toride/client";
const client = new TorideClient(snapshot);
client.can("update", { type: "Task", id: "42" }); // true (sync, 0ms)
client.can("delete", { type: "Task", id: "42" }); // false (sync, 0ms)
client.can("read", { type: "Task", id: "99" });   // false (unknown resource → safe default)
```

**Snapshot behavior**:
- Snapshots evaluate conditions against the resource's **current** attributes at snapshot time. Conditional permissions that are currently true are included.
- Resources not in the snapshot return `false` (consistent with server-side default-deny)
- Snapshots are for **UI hints only** (show/hide buttons). The server is always the authoritative source and re-checks on actual mutations. Staleness is expected and harmless because the server is the final authority.

### 7.12 Exports

Toride uses **named exports only** (no default export). This is tree-shakeable, explicit, and avoids CommonJS/ESM interop issues.

```typescript
import { Toride, createToride, loadYaml, loadJson, mergePolicies } from "toride";
import { TorideClient } from "toride/client";
```

---

## 8. Declarative Policy Tests

Tests can be written inline in the policy file or in separate YAML test files. Tests use inline mocks — no real resolver or database needed.

### 8.1 Inline Tests

```yaml
# In the policy file itself
tests:
  - name: "editor can update tasks"
    actor: { type: User, id: alice, attributes: { department: engineering } }
    roles: { "Task:42": [editor] }
    action: update
    resource: { type: Task, id: "42" }
    expected: allow

  - name: "viewer cannot delete tasks"
    actor: { type: User, id: bob }
    roles: { "Task:42": [viewer] }
    action: delete
    resource: { type: Task, id: "42" }
    expected: deny

  - name: "superadmin can delete via global role"
    actor: { type: User, id: admin, attributes: { isSuperAdmin: true } }
    roles: {}
    action: delete
    resource: { type: Task, id: "42" }
    expected: allow

  - name: "forbid rule blocks update on completed project"
    actor: { type: User, id: alice, attributes: {} }
    roles: { "Task:42": [editor] }
    relations: { "Task:42": { project: { type: Project, id: "7" } } }
    attributes: { "Project:7": { status: completed } }
    action: update
    resource: { type: Task, id: "42" }
    expected: deny
```

### 8.2 Test Assertions

Tests assert the **final decision** only (`expected: allow` or `expected: deny`). Intermediate state like resolved roles or matched rules is not asserted — this keeps tests focused on behavior and prevents brittleness when refactoring role derivation logic.

For detailed inspection of intermediate state, use `explain()` in code.

### 8.3 Global Role Handling in Tests

Global roles are **always derived from actor attributes** in tests, the same as in production. There is no mock override for global roles. This ensures tests verify the full derivation chain including global role conditions.

### 8.4 Separate Test Files

```yaml
# policy.test.yaml
policy: ./policy.yaml

tests:
  - name: "org admin gets project admin via derived role"
    actor: { type: User, id: alice }
    roles: { "Organization:1": [admin] }
    relations: { "Project:5": { org: { type: Organization, id: "1" } } }
    action: delete
    resource: { type: Project, id: "5" }
    expected: allow
```

### 8.5 Test File Organization

For large policies (100+ resources), the recommended convention is to organize test files by resource:

```
policies/
  main.yaml
  tests/
    organization.test.yaml
    project.test.yaml
    task.test.yaml
    document.test.yaml
```

Run with: `npx toride test ./policy.yaml` or `npx toride test ./policy.test.yaml`

The CLI also supports glob patterns: `npx toride test './tests/**/*.test.yaml'`

---

## 9. Field-Level Access Control

The optional `field_access` section on resources controls which roles can read or update specific fields. Field access is **purely role-based** — it maps roles to field permissions with no condition support. Attribute-based field restrictions are achieved through derived_roles with `when` conditions, which then get mapped via field_access.

```yaml
Employee:
  roles: [viewer, manager, hr_admin]
  permissions: [read, update, delete]

  grants:
    viewer:   [read]
    manager:  [read, update]
    hr_admin: [all]

  field_access:
    salary:        { read: [hr_admin, manager], update: [hr_admin] }
    ssn:           { read: [hr_admin] }
    performance:   { read: [manager, hr_admin], update: [manager, hr_admin] }
    name:          { read: [viewer, manager, hr_admin], update: [manager, hr_admin] }
```

API:

```typescript
// Can this actor read the salary field?
await engine.canField(actor, "read", { type: "Employee", id: "42" }, "salary");
// → true/false

// Which fields can this actor read?
await engine.permittedFields(actor, "read", { type: "Employee", id: "42" });
// → ["name", "performance"]  (for a manager)
```

Fields not listed in `field_access` are accessible to any role that has the corresponding resource-level permission.

---

## 10. Role Resolution Walkthrough

**Scenario**: Can `alice` do `update` on `Task:42`?

**Given**:
- Alice has no direct role on Task:42
- Alice has `editor` role on Project:7
- Task:42's project relation points to Project:7
- Task:42's project's status is "active"

**Step 1: Check direct assignment**
```
resolver.getRoles(alice, Task:42) → []  (no direct role)
```

**Step 2: Check derived roles (exhaustive — all paths evaluated)**
```
derived_roles[0]: "editor from_global_role superadmin"
  → Is alice a User with isSuperAdmin === true? → NO

derived_roles[1]: "viewer from_global_role readonly_service"
  → Is alice a ServiceAccount? → NO (alice is User, skip)

derived_roles[2]: "editor from_role editor on_relation project"
  → resolver.getRelated(Task:42, "project") → Project:7
  → Does alice have "editor" on Project:7?
    → resolver.getRoles(alice, Project:7) → ["editor"]  ✅
  → alice gets derived "editor" on Task:42

derived_roles[3]: "viewer from_role viewer on_relation project"
  → resolver.getRelated(Task:42, "project") → Project:7 (cached!)
  → Does alice have "viewer" on Project:7?
    → resolver.getRoles(alice, Project:7) → ["editor"] (cached!)
    → "editor" ≠ "viewer" → NO (unless Project has derived viewer from editor)

derived_roles[4]: "editor from_relation assignee"
  → resolver.getRelated(Task:42, "assignee") → User:bob
  → alice.id !== bob → NO

derived_roles[5]: "editor actor_type User when ..."
  → Evaluate conditions → NO (doesn't match)

All paths evaluated. alice has: ["editor"] (derived)
```

**Step 3: Check grants**
```
alice has "editor" → grants: editor: [read, update, delete, assign, change_status]
→ "update" is in the list ✅
```

**Step 4: Check forbid rules**
```
"forbid [update, ...] when resource.project.status: completed"
→ resolver.getAttributes(Project:7) → { status: "active" }
→ "active" !== "completed" → forbid does NOT match
```

**Step 5: Result**
```
alice has "editor" (derived from Project:7) which grants "update"
No forbid rules matched
→ ALLOWED ✅
```

---

## 11. Package Structure

Toride is organized as core + plugins:

| Package | Description |
|---------|-------------|
| `toride` | Core engine: policy parser, role resolution, `can()`, `buildConstraints()`, `explain()`, `resolvedRoles()`, `snapshot()`, `loadYaml()`, `loadJson()`, `mergePolicies()`, client |
| `@toride/codegen` | CLI: `toride-codegen policy.yaml` generates TypeScript types and typed resolver interface from policy files |
| `@toride/prisma` | Reference ConstraintAdapter for Prisma |
| `@toride/drizzle` | Reference ConstraintAdapter for Drizzle |

Framework middleware (Express, Hono, Fastify, etc.) is provided as documentation examples, not packages. Library packages may be added in the future.

---

## 12. Configuration

```typescript
const engine = new Toride({
  // Required
  policy: await loadYaml("./policy.yaml"),
  resolver: myRelationResolver,

  // Optional
  maxConditionDepth: 3,               // default: 3 (for nested property access in conditions)
  maxDerivedRoleDepth: 5,             // default: 5 (for derived role chain traversal)
  customEvaluators: { ... },          // escape hatch for custom logic
  onDecision: (event) => { ... },     // async audit callback for can/canBatch/canField
  onQuery: (event) => { ... },        // async audit callback for buildConstraints
});
```

### Depth Limits

Two separate depth limits control traversal:

- **`maxConditionDepth`** (default: 3): Limits nested property access in conditions (e.g., `resource.project.org.plan` is 3 levels). Prevents accidental performance cliffs from deeply nested condition chains.
- **`maxDerivedRoleDepth`** (default: 5): Limits how many hops the engine follows for derived role chains (e.g., Task → Project → Org → ParentOrg). Separate from condition depth because role chains are typically a different concern.

---

## 13. Performance

### Target

- **Sub-millisecond** for `can()` checks where resolver returns from cache/memory (no DB round-trips)
- Toride's engine overhead (policy parsing, condition evaluation, role resolution logic) is negligible
- Total end-to-end latency depends on the resolver's data access patterns

### Optimizations

- Per-check caching prevents duplicate resolver calls within a single `can()` or `canBatch()` call
- Shared cache across `canBatch()` checks maximizes resolver call reuse
- `all` in grants resolves dynamically at check time — no pre-expansion overhead

### Grants: `all` Keyword

The `all` keyword in grants resolves **dynamically** at check time to the current set of permissions on the resource. If a policy is updated via `setPolicy()` adding new permissions, existing `all` grants automatically include the new permissions without re-processing.

---

## 14. Implementation Phases

### Phase 1: Core Engine
- YAML/JSON policy parser + JSON Schema validation (strict at load time, with logical path error messages)
- Actor declarations with multiple actor types
- Actor attribute validation: `$actor.x` references checked against actor declarations
- Global roles section with condition evaluation
- Resource block model (roles, permissions, grants with dynamic `all` keyword)
- All 5 derived role patterns (from_global_role, from_role+on_relation, from_relation, actor_type+when, combinations)
- Actor type matching for derived roles: skip entries referencing undeclared attributes
- Condition evaluator (all operators including `contains`, `$actor`/`$resource`/`$env`, `any`/`all`, cross-references including `in: $actor.arrayField`)
- Strict null semantics (undefined !== undefined)
- Exhaustive role evaluation (all derivation paths, always)
- Direct role checking via `resolver.getRoles()`
- Relation traversal with path-based cycle detection + separate depth limits (conditions and role chains)
- Per-check evaluation cache (shared across `canBatch()`)
- Fail-closed on resolver errors and custom evaluator errors in forbid rules
- `can()`, `canBatch()`, `permittedActions()`, `resolvedRoles()` APIs
- `explain()` API (same code path as `can()`, shows all derivation paths)
- `loadYaml()`, `loadJson()`
- Async audit events (`onDecision` callback)
- Forbid and permit rules only evaluated for actors with at least one role

### Phase 2: Partial Evaluation & Data Filtering
- `ConstraintResult` wrapper type with `unrestricted`/`forbidden`/`constraints` sentinels
- Constraint AST types including `has_role` node (public stable API)
- Inline `$actor` and `$env` values during partial evaluation
- `has_role` constraint for relation-based derived roles (adapter handles role assignment queries)
- Policy partial evaluator (emits relation and has_role constraints)
- `ConstraintAdapter` interface with `hasRole()` method
- `buildConstraints()` and `translateConstraints()`
- `unknown` constraint node for custom evaluators
- Reference adapters: `@toride/prisma`, `@toride/drizzle`
- `mergePolicies()` (additive union, silent append for rules, forbid-wins handles conflicts)
- Async query events (`onQuery` callback)

### Phase 3: DX & Ecosystem
- Field-level access control (`field_access`, `canField()`, `permittedFields()`) — role-based only
- Client-side `snapshot()` + `TorideClient` (conditional permissions included, unknown resources return false)
- `@toride/codegen` — generates action/resource types AND fully typed `RelationResolver` interface
- Declarative YAML tests (`tests:` section + separate test files, allow/deny assertions only, global roles always derived)
- CLI: `toride validate` (errors only), `toride validate --strict` (includes static analysis warnings)
- CLI: `toride test` with glob pattern support
- Custom evaluator escape hatch
- `setPolicy()` for runtime policy updates (atomic swap)
- Documentation with framework middleware examples (Express, Hono, Fastify, tRPC)
- Documentation with test file organization convention (one test file per resource)
- Static analysis (unreachable rules, unused roles) via `--strict` flag

---

## 15. Comparison: Sourced from Each System

| Capability | Source | How Toride does it |
|-----------|--------|-------------------|
| Resource blocks | Polar | YAML blocks with co-located roles, permissions, relations |
| Derived roles via relations | Polar, Zanzibar | `derived_roles` with `from_role`/`on_relation` |
| Relation-to-role mapping | Polar | `derived_roles` with `from_relation` |
| Global roles from attributes | Polar | `global_roles` top-level section with `actor_type` + `when` |
| Actor-attribute role derivation | Polar | `derived_roles` with `actor_type` + `when` |
| `permit`/`forbid` with conditions | Cedar | `rules` with `effect`, `when` |
| Default deny | Cedar | No match = denied |
| Forbid-wins precedence | Cedar | Forbid overrides all permits |
| Partial evaluation → constraint AST | Oso | `buildConstraints()` returns stable AST with sentinel wrapper |
| User-programmable data filtering | Oso | `ConstraintAdapter` interface with `hasRole()` |
| Relation graph traversal | Zanzibar | `RelationResolver` walks graph with path-based cycle detection |
| Transitive role derivation | Zanzibar | Org:admin → Project:admin → Task:editor (chained via derived_roles) |
| Isomorphic (server + client) | CASL | Async server + sync `TorideClient` from snapshot |
| Type safety | CASL | Generics + codegen with typed resolver from policy files |
| Zero infrastructure | CASL | In-process, no external service |
| Explain/audit | Oso, Cedar | `explain()` + async decision and query events |
| Custom evaluators | OPA | Escape hatch for arbitrary logic |
| Declarative policy tests | Polar | `tests:` section with inline mocks |
| Multiple actor types | Polar | `actors:` section with per-type attributes |
| Field-level access | Custom | `field_access` section per resource |

---

## 16. Open Questions (Deferred)

1. **Recursive relations**: Folder-in-folder trees. Deferred from v1. If needed, add `recursive: true` to relations with `maxDepth`.

2. **Deny inheritance**: If `forbid` matches on a parent, does it propagate to children? Currently: no (direct only). May add opt-in propagation later.

3. **Framework middleware packages**: Currently examples only. May ship `@toride/express`, `@toride/hono` etc. if demand warrants.

4. **Policy diffing**: Tool to show what permissions change between two policy versions.

---

## Appendix A: Design Decisions Log

Decisions made during specification review, for future reference:

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Role evaluation strategy | Exhaustive (evaluate all paths) | Simpler, consistent can()/explain(), negligible perf cost |
| `all` keyword in grants | Dynamic (resolves at check time) | New permissions auto-included when policy changes |
| canBatch() cache | Shared across batch | Maximizes resolver call reuse for shared relations |
| Partial eval cross-references | Inline actor/env values | Simple, produces clean SQL-friendly constraints |
| Cycle detection | Path-based (runtime) | Allows valid DAGs, catches real cycles |
| mergePolicies() conflicts | Silent append | Forbid-wins is the documented contract |
| Snapshot conditionals | Include (evaluate at snapshot time) | Accurate snapshot, staleness is harmless |
| Actor type attribute matching | Skip if undeclared | Prevents accidental matches, safe |
| Test global roles | Always derived from attributes | Tests verify full derivation chain |
| setPolicy() concurrency | Atomic swap | No mixed-policy results |
| buildConstraints() return type | Wrapper with sentinel | Caller optimizes common cases without adapter |
| Forbid eval without roles | Skip (no roles = already denied) | Saves unnecessary resolver calls |
| String operators | Add `contains` (no regex) | Useful without ReDoS risk |
| `in` operator | Support cross-ref ($actor.arrayField) | Enables dynamic whitelists |
| Validation errors | Logical path only | Clear enough without line numbers |
| Grants all_except | Not supported (explicit only) | Keep grants simple |
| Audit for buildConstraints | Separate onQuery callback | Different event shape than decisions |
| Performance target | Sub-millisecond (cached) | Engine overhead should be negligible |
| Test assertions | allow/deny only | Behavior-focused, not implementation-bound |
| Depth limits | Separate (conditions + role chains) | Different concerns, different defaults |
| Package exports | Named exports only | Tree-shakeable, no CJS/ESM interop issues |
| CLI static analysis | Combined: validate --strict | One command, flag-controlled |
| Test organization | Convention in docs | Flexible, not enforced |
| Relation-based partial eval | has_role constraint node | Adapter handles role schema, engine stays generic |
| has_role node content | Actor ID + type only | Minimal info, adapter knows its own schema |
| Permission inheritance | Flat/independent | Derived roles via relations solve cross-resource grants |
| Naming convention | snake_case YAML, camelCase TS | Each follows ecosystem norms |
| Null semantics | Strict (undefined !== undefined) | Missing data never grants access |
| Codegen | Full typed resolver interface | Maximum type safety, compile-time enforcement |
| Field access | Role-based only (no conditions) | Conditions live in derived_roles, clean separation |
| Cardinality many in conditions | ANY (exists) semantics | Maps to SQL EXISTS/JOIN |
| Custom evaluator errors in forbid | Fail-closed (forbid matches) | Consistent with resolver error behavior |
| Multi-tenancy | Resolver's responsibility | Engine stays tenant-agnostic |
| Client unknown resources | Return false | Consistent with default-deny |
| resolvedRoles() API | First-class method | Clean, focused, useful for debugging and UI |

---

## Appendix B: Complete Example Policy

```yaml
version: "1"

actors:
  User:
    attributes:
      id: string
      email: string
      department: string
      isSuperAdmin: boolean
      isLead: boolean

  ServiceAccount:
    attributes:
      id: string
      scope: string
      service: string

global_roles:
  superadmin:
    actor_type: User
    when:
      $actor.isSuperAdmin: true

  department_lead:
    actor_type: User
    when:
      all:
        - $actor.isLead: true
        - $actor.department: { exists: true }

  readonly_service:
    actor_type: ServiceAccount
    when:
      $actor.scope: read

resources:

  Organization:
    roles: [viewer, member, admin, owner]
    permissions: [read, update, delete, invite, manage_billing]

    grants:
      viewer: [read]
      member: [read]
      admin:  [read, update, invite]
      owner:  [all]

    derived_roles:
      - role: owner
        from_global_role: superadmin

  Team:
    roles: [member, lead]
    permissions: [read, update, add_member]

    relations:
      org: { resource: Organization, cardinality: one }

    grants:
      member: [read]
      lead:   [read, update, add_member]

    derived_roles:
      - role: member
        from_role: member
        on_relation: org

      - role: lead
        from_role: admin
        on_relation: org

      - role: lead
        from_global_role: superadmin

  Project:
    roles: [viewer, editor, admin]
    permissions: [read, update, delete, create_task, manage_members]

    relations:
      org:  { resource: Organization, cardinality: one }
      team: { resource: Team, cardinality: one }

    grants:
      viewer: [read]
      editor: [read, update, create_task]
      admin:  [all]

    derived_roles:
      - role: admin
        from_global_role: superadmin

      - role: admin
        from_role: admin
        on_relation: org

      - role: viewer
        from_role: member
        on_relation: org

      - role: editor
        from_role: lead
        on_relation: team

      - role: viewer
        actor_type: User
        when:
          $actor.department: engineering

    rules:
      - effect: permit
        roles: [viewer]
        permissions: [read]
        when:
          resource.isPublic: true

      - effect: forbid
        permissions: [delete]
        when:
          resource.archived: true

    field_access:
      budget: { read: [admin], update: [admin] }

  Task:
    roles: [viewer, editor]
    permissions: [read, update, delete, assign, change_status]

    relations:
      project:  { resource: Project, cardinality: one }
      assignee: { resource: User, cardinality: one }

    grants:
      viewer: [read]
      editor: [read, update, delete, assign, change_status]

    derived_roles:
      - role: editor
        from_global_role: superadmin

      - role: viewer
        from_global_role: readonly_service

      - role: editor
        from_role: editor
        on_relation: project

      - role: viewer
        from_role: viewer
        on_relation: project

      - role: editor
        from_relation: assignee

      - role: editor
        actor_type: User
        when:
          any:
            - all:
                - $actor.department: $resource.department
                - $actor.isLead: true

    rules:
      - effect: forbid
        permissions: [update, delete, assign, change_status]
        when:
          resource.project.status: completed

  Document:
    roles: [viewer, editor, owner]
    permissions: [read, edit, delete, share, comment]

    relations:
      project:     { resource: Project, cardinality: one }
      creator:     { resource: User, cardinality: one }
      shared_with: { resource: User, cardinality: many }

    grants:
      viewer: [read, comment]
      editor: [read, comment, edit]
      owner:  [all]

    derived_roles:
      - role: viewer
        from_role: viewer
        on_relation: project

      - role: editor
        from_role: editor
        on_relation: project

      - role: owner
        from_relation: creator

      - role: viewer
        from_relation: shared_with

      - role: owner
        from_global_role: superadmin

    rules:
      - effect: permit
        roles: [viewer]
        permissions: [read]
        when:
          resource.visibility: public

      - effect: forbid
        roles: [editor]
        permissions: [edit]
        when:
          resource.status: draft
          $actor.id: { neq: $resource.creatorId }

tests:
  - name: "editor can update tasks"
    actor: { type: User, id: alice, attributes: { department: engineering } }
    roles: { "Task:42": [editor] }
    action: update
    resource: { type: Task, id: "42" }
    expected: allow

  - name: "viewer cannot delete tasks"
    actor: { type: User, id: bob, attributes: {} }
    roles: { "Task:42": [viewer] }
    action: delete
    resource: { type: Task, id: "42" }
    expected: deny

  - name: "superadmin gets editor via global role"
    actor: { type: User, id: admin, attributes: { isSuperAdmin: true } }
    roles: {}
    action: update
    resource: { type: Task, id: "42" }
    expected: allow

  - name: "forbid blocks update on completed project task"
    actor: { type: User, id: alice, attributes: {} }
    roles: { "Task:42": [editor] }
    relations: { "Task:42": { project: { type: Project, id: "7" } } }
    attributes: { "Project:7": { status: completed } }
    action: update
    resource: { type: Task, id: "42" }
    expected: deny

  - name: "document creator is owner"
    actor: { type: User, id: alice, attributes: {} }
    roles: {}
    relations: { "Document:1": { creator: { type: User, id: alice } } }
    action: delete
    resource: { type: Document, id: "1" }
    expected: allow

  - name: "readonly service account can view tasks"
    actor: { type: ServiceAccount, id: svc1, attributes: { scope: read } }
    roles: {}
    action: read
    resource: { type: Task, id: "42" }
    expected: allow
```
