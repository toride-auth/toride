# Quickstart: In-Memory Resolver Example Draft

This document drafts the in-memory resolver example for the quickstart page (Step 3 rewrite).

## In-Memory Resolver (Primary Example)

```typescript
import { Toride, loadYaml } from "toride";

// In-memory data — no database needed
const projects: Record<string, any> = {
  "proj-1": { status: "active", department: "engineering" },
};

const tasks: Record<string, any> = {
  "task-42": {
    projectId: "proj-1",
    assigneeId: "alice",
    status: "open",
  },
};

const engine = new Toride({
  policy: await loadYaml("./policy.yaml"),
  resolvers: {
    Task: async (ref) => {
      const task = tasks[ref.id];
      return {
        project: { type: "Project", id: task.projectId },
        assignee: { type: "User", id: task.assigneeId },
        status: task.status,
      };
    },
    Project: async (ref) => {
      const project = projects[ref.id];
      return {
        status: project.status,
        department: project.department,
      };
    },
  },
});

export { engine };
```

### Framing Text

> Each resolver is a function that returns attributes for a resource instance. Relation fields contain `ResourceRef` objects (`{ type, id }`) that the engine follows when traversing relations. Your resolvers can fetch data from any source — here we use plain objects, but you could use a REST API, GraphQL endpoint, file system, or database.

## Real-World: Database Resolvers (Follow-Up Section)

```typescript
// When your data source is a database, resolvers look like this:
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

### Framing Text

> In production, your resolvers will typically query a database. The resolver interface is the same — only the data source changes. For type-safe resolvers generated from your policy, see [Codegen](/integrations/codegen). For query-level filtering with an ORM, see [Prisma](/integrations/prisma) or [Drizzle](/integrations/drizzle) integration.
