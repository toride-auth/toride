# Quickstart: Implementation Guide

This document describes how to implement each change. It serves as the implementation reference for task execution.

## Change 1: Rewrite `docs/guide/quickstart.md`

### Section: "3. Implement a Resolver"

**Before** (incorrect):
```typescript
import type { RelationResolver } from "toride";
const resolver: RelationResolver = {
  async getRoles(actor, resource) { ... },
  async getRelated(resource, relation) { ... },
  async getAttributes(ref) { ... },
};
```

**After** (correct):
```typescript
import { Toride, loadYaml } from "toride";

const engine = new Toride({
  policy: await loadYaml("./policy.yaml"),
  resolvers: {
    Task: async (ref) => {
      const task = await db.task.findById(ref.id);
      return {
        project: { type: "Project", id: task.projectId },
        assignee: { type: "User", id: task.assigneeId },
        status: task.status,
      };
    },
    Project: async (ref) => {
      const project = await db.project.findById(ref.id);
      return {
        status: project.status,
        department: project.department,
      };
    },
  },
});
```

### Section: Resolver explanation table

**Before**:
| Method | Purpose | When it's called |
|--------|---------|-----------------|
| `getRoles` | Look up direct role assignments | Every permission check |
| `getRelated` | Follow a relation to another resource | When evaluating derived roles |
| `getAttributes` | Fetch attributes for condition evaluation | When rules have conditions |

**After**:
Each resolver is a function per resource type that returns a flat object of attributes. Relation fields contain `ResourceRef` objects (`{ type, id }`). The engine calls a resolver when it needs to evaluate conditions or traverse relations for that resource type.

### Section: Policy example

Add to the Project resource's `derived_roles`:
```yaml
    derived_roles:
      - role: admin
        from_global_role: superadmin
      - role: editor
        actor_type: User
        when:
          $actor.department: $resource.department
```

This shows how roles originate without `getRoles` — through global roles and actor attribute conditions.

### Section: "How it works" (step-by-step)

**Before**:
1. Look up Alice's direct roles on Task 42 via `getRoles`
2. Follow the `project` and `assignee` relations via `getRelated`
3. ...

**After**:
1. Evaluate all `derived_roles` entries on Task 42 (from_role on project, from_relation assignee)
2. For relation-based derivation, resolve Task attributes via the `Task` resolver
3. Follow relations to related resources (Project, User) and check roles there recursively
4. Combine all derived roles into a deduplicated set
5. Expand grants for the combined role set
6. Evaluate any rules (e.g., the `forbid` rule for completed projects)
7. Return the final decision

### Section: Engine constructor

**Before**: `new Toride({ policy, resolver })` (singular)
**After**: `new Toride({ policy, resolvers: { ... } })` (plural, map)

## Change 2: Fix `docs/guide/getting-started.md`

### Line 75 area

**Before**: "A resolver that tells the engine how to look up roles, relations, and attributes from your database"

**After**: "Resource resolvers that tell the engine how to fetch attributes for each resource type from your database"

### Line 85 area

**Before**: `resolver.ts  # Relation resolver`

**After**: `resolver.ts  # Resource resolvers`

## Change 3: Delete `docs/spec.md`

Simply delete the file. No sidebar or cross-link cleanup needed (verified in research.md R4).
