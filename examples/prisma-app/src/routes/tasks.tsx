import { Hono } from "hono";
import { TorideClient } from "toride";
import { prisma } from "../db.js";
import { engine } from "../engine.js";
import { toActorRef } from "../types.js";
import type { AppEnv, AppSchema } from "../types.js";
import { TaskItem } from "../components/TaskItem.js";

const app = new Hono<AppEnv>();

const VALID_STATUS_VALUES = ["todo", "in_progress", "done"] as const;

// ---------------------------------------------------------------------------
// PATTERN: Parent resource permission check for create mutations
//
// When creating a child resource (e.g., a Task under a Project), the permission
// check is performed on the PARENT resource, not the child (which doesn't exist yet).
//
// can(actor, "create_task", { type: "Project", id }) checks whether the actor
// has the create_task permission on the parent Project. This is the standard
// pattern for "create child resource" authorization — the parent's permission
// governs whether the actor can create children under it.
// ---------------------------------------------------------------------------

app.post("/projects/:id/tasks", async (c) => {
  const user = c.get("currentUser");
  const actor = toActorRef(user);
  const projectId = c.req.param("id");

  const canCreate = await engine.can(actor, "create_task", {
    type: "Project",
    id: projectId,
  });

  if (!canCreate) {
    return c.html(
      <li class="task-item error">You do not have permission to create tasks in this project.</li>,
      403,
    );
  }

  const body = await c.req.parseBody();
  const title = typeof body.title === "string" ? body.title.trim() : "";

  if (!title) {
    return c.html(
      <li class="task-item error">Task title is required.</li>,
      400,
    );
  }

  const description =
    typeof body.description === "string" ? body.description.trim() : null;

  const task = await prisma.task.create({
    data: {
      title,
      description,
      projectId,
      status: "todo",
    },
    include: { assignee: { select: { name: true } } },
  });

  const snap = await engine.snapshot(actor, [
    { type: "Task" as const, id: task.id },
  ]);
  const client = new TorideClient<AppSchema>(snap);
  const permittedActions = client.permittedActions({ type: "Task", id: task.id });

  return c.html(
    <TaskItem
      task={{
        id: task.id,
        title: task.title,
        status: task.status,
        assignee: task.assignee,
      }}
      permittedActions={permittedActions}
    />,
    201,
  );
});

// ---------------------------------------------------------------------------
// PATTERN: Guard-then-act for single-resource mutations
//
// For update and delete mutations, we first check can(actor, "update", ref)
// or can(actor, "delete", ref), then perform the mutation only if allowed.
// This is the "guard pattern" — deny first, mutate second.
//
// The engine automatically traverses relations defined in the policy. For
// example, when checking update on a Task, the engine will follow the Task->
// Project relation and apply any forbid rules from policy.yaml (e.g.,
// $resource.project.archived: true). This means archived project tasks
// cannot be updated or deleted even though Task itself has no archived field.
// ---------------------------------------------------------------------------

app.put("/tasks/:taskId", async (c) => {
  const user = c.get("currentUser");
  const actor = toActorRef(user);
  const taskId = c.req.param("taskId");

  const canUpdate = await engine.can(actor, "update", {
    type: "Task",
    id: taskId,
  });

  if (!canUpdate) {
    return c.html(
      <li class="task-item error">You do not have permission to update this task.</li>,
      403,
    );
  }

  const body = await c.req.parseBody();
  const updateData: { title?: string; status?: string } = {};

  if (typeof body.title === "string" && body.title.trim()) {
    updateData.title = body.title.trim();
  }

  if (typeof body.status === "string" && VALID_STATUS_VALUES.includes(body.status as typeof VALID_STATUS_VALUES[number])) {
    updateData.status = body.status;
  }

  if (Object.keys(updateData).length === 0) {
    return c.html(
      <li class="task-item error">No valid fields to update.</li>,
      400,
    );
  }

  const task = await prisma.task.update({
    where: { id: taskId },
    data: updateData,
    include: { assignee: { select: { name: true } } },
  });

  const snap = await engine.snapshot(actor, [
    { type: "Task" as const, id: task.id },
  ]);
  const client = new TorideClient<AppSchema>(snap);
  const permittedActions = client.permittedActions({ type: "Task", id: task.id });

  return c.html(
    <TaskItem
      task={{
        id: task.id,
        title: task.title,
        status: task.status,
        assignee: task.assignee,
      }}
      permittedActions={permittedActions}
    />,
  );
});

app.delete("/tasks/:taskId", async (c) => {
  const user = c.get("currentUser");
  const actor = toActorRef(user);
  const taskId = c.req.param("taskId");

  const canDelete = await engine.can(actor, "delete", {
    type: "Task",
    id: taskId,
  });

  if (!canDelete) {
    return c.html(
      <li class="task-item error">You do not have permission to delete this task.</li>,
      403,
    );
  }

  await prisma.task.delete({ where: { id: taskId } });

  return c.body(null, 200);
});

export default app;
