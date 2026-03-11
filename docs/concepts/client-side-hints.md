---
description: Permission snapshots — engine.snapshot() on the server, TorideClient from toride/client for synchronous UI permission checks with default-deny semantics, React integration pattern.
---

# Client-Side Hints

Client-side hints let you send a **permission snapshot** from the server to the browser, so your frontend can make instant, synchronous permission checks to control UI rendering. Instead of calling the server for every "should I show this button?" decision, the client checks a local snapshot.

## The Problem

Frontend applications need to show or hide UI elements based on permissions: edit buttons, delete icons, admin panels. Without client-side hints, you either:

- Make API calls for every UI permission check (slow, lots of requests)
- Duplicate authorization logic in the frontend (error-prone, security risk)
- Over-fetch and show everything, then handle 403 errors (poor UX)

## The Solution: Permission Snapshots

Toride provides a two-part system:

1. **Server side**: Generate a `PermissionSnapshot` for the resources the user is viewing
2. **Client side**: Use `TorideClient` for instant synchronous permission checks

### Server: Generate a Snapshot

Use `engine.snapshot()` to build a permission map for a set of resources:

```typescript
import { Toride, loadYaml } from "toride";

const engine = new Toride({
  policy: await loadYaml("./policy.yaml"),
  resolvers: { /* ... */ },
});

const actor = {
  type: "User",
  id: "alice",
  attributes: { department: "engineering" },
};

// Generate a snapshot for the resources the user is viewing
const snapshot = await engine.snapshot(actor, [
  { type: "Project", id: "proj-1" },
  { type: "Project", id: "proj-2" },
  { type: "Task", id: "task-42" },
]);
```

The snapshot is a plain JavaScript object, keyed by `"Type:id"`, with arrays of permitted action strings:

```json
{
  "Project:proj-1": ["read", "update", "create_task"],
  "Project:proj-2": ["read"],
  "Task:task-42": ["read", "update", "delete"]
}
```

This object is JSON-serializable. Send it to the client via your API response, SSR props, or any transport mechanism.

### How `snapshot()` Works

Under the hood, `snapshot()` calls `permittedActions()` for each resource in the list. It evaluates all roles, grants, and [rules](/concepts/conditions-and-rules) for the actor on each resource, collecting every permitted action. The result is a complete picture of what the actor can do on those specific resource instances.

```typescript
// These are equivalent:
const snapshot = await engine.snapshot(actor, resources);

// Manual equivalent:
const snapshot = {};
for (const resource of resources) {
  const key = `${resource.type}:${resource.id}`;
  snapshot[key] = await engine.permittedActions(actor, resource);
}
```

### Client: Check Permissions Instantly

Import `TorideClient` from the `toride/client` subpath. This module has **zero server-side dependencies** and is safe to bundle in frontend code:

```typescript
import { TorideClient } from "toride/client";

// Receive the snapshot from the server (e.g., via API response)
const client = new TorideClient(snapshot);

// Synchronous permission checks -- no async, no server calls
client.can("update", { type: "Project", id: "proj-1" });  // true
client.can("delete", { type: "Project", id: "proj-1" });  // false
client.can("read", { type: "Task", id: "task-42" });      // true
```

`TorideClient` follows the same **default-deny** semantics as the server engine:

- Unknown resources (not in the snapshot) return `false`
- Unknown actions return `false`
- The snapshot is defensively copied on construction to prevent external mutation

### List Permitted Actions

You can also list all permitted actions for a resource:

```typescript
const actions = client.permittedActions({ type: "Project", id: "proj-1" });
// ["read", "update", "create_task"]
```

## Frontend Integration Patterns

### React Example

```typescript
import { TorideClient } from "toride/client";
import { createContext, useContext } from "react";

// Create a context for the permission client
const PermissionContext = createContext<TorideClient | null>(null);

function usePermissions() {
  const client = useContext(PermissionContext);
  if (!client) throw new Error("PermissionContext not provided");
  return client;
}

// Provider: initialize from API response
function App({ snapshot }) {
  const client = new TorideClient(snapshot);

  return (
    <PermissionContext.Provider value={client}>
      <ProjectList />
    </PermissionContext.Provider>
  );
}

// Consumer: check permissions in components
function ProjectActions({ projectId }) {
  const permissions = usePermissions();
  const resource = { type: "Project", id: projectId };

  return (
    <div>
      {permissions.can("update", resource) && (
        <button>Edit</button>
      )}
      {permissions.can("delete", resource) && (
        <button>Delete</button>
      )}
    </div>
  );
}
```

### API Response Pattern

Include the snapshot in your API response alongside the data:

```typescript
// Server-side API handler
app.get("/api/projects", async (req, res) => {
  const actor = getActorFromRequest(req);
  const projects = await listProjects(actor);

  // Build snapshot for the returned resources
  const resources = projects.map((p) => ({
    type: "Project" as const,
    id: p.id,
  }));
  const snapshot = await engine.snapshot(actor, resources);

  res.json({
    data: projects,
    permissions: snapshot,
  });
});
```

```typescript
// Client-side consumer
const response = await fetch("/api/projects");
const { data, permissions } = await response.json();

const client = new TorideClient(permissions);

// Now render the list with permission-aware UI
data.forEach((project) => {
  const canEdit = client.can("update", { type: "Project", id: project.id });
  // ...
});
```

### Server-Side Rendering (SSR)

Pass the snapshot as a serialized prop:

```typescript
// Server: generate snapshot and pass as prop
async function getServerSideProps(context) {
  const actor = getActorFromSession(context.req);
  const projects = await listProjects(actor);
  const resources = projects.map((p) => ({ type: "Project", id: p.id }));
  const snapshot = await engine.snapshot(actor, resources);

  return {
    props: {
      projects,
      snapshot,
    },
  };
}
```

## Snapshot Scope

The snapshot only contains permissions for the resources you explicitly list. This is intentional:

- **Security**: The client only learns about resources it already has access to see
- **Performance**: You control exactly how many resources are evaluated
- **Freshness**: Generate a new snapshot when the user navigates to a new view

### Refreshing Snapshots

Snapshots are point-in-time. If permissions change (e.g., a role is revoked), the client snapshot becomes stale. Common refresh strategies:

- **On navigation**: Generate a new snapshot when the user loads a new page or view
- **On mutation**: Refresh the snapshot after the user performs an action that might change permissions
- **Periodic polling**: Refresh on a timer for long-lived single-page applications

## Performance Considerations

`snapshot()` calls `permittedActions()` for each resource, which evaluates all declared permissions. The cost is:

- **O(n * m)** where n is the number of resources and m is the average number of permissions per resource type
- Role resolution and condition evaluation happen for each resource
- Resolver calls are cached within a single `permittedActions()` call

For large resource lists, consider paginating and only generating snapshots for the visible page.

## Security Notes

Client-side hints are for **UI rendering only**. They are not a security boundary:

- Always enforce authorization on the server for mutations and data access
- The snapshot tells the client what to show, but the server must still check `can()` on every API call
- A malicious client can ignore the snapshot -- server-side enforcement is the actual security layer

```typescript
// Server: always check permissions on mutations
app.post("/api/projects/:id", async (req, res) => {
  const actor = getActorFromRequest(req);
  const allowed = await engine.can(actor, "update", {
    type: "Project",
    id: req.params.id,
  });

  if (!allowed) {
    return res.status(403).json({ error: "Forbidden" });
  }

  // Proceed with the update...
});
```

## What's Next

- [Partial Evaluation](/concepts/partial-evaluation) -- push authorization into data-layer queries
- [Roles & Relations](/concepts/roles-and-relations) -- understand how roles are resolved for snapshots
- [Conditions & Rules](/concepts/conditions-and-rules) -- learn the rules that determine permissions
