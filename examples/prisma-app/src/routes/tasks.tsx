import { Hono } from "hono";
import { prisma } from "../db.js";
import { engine } from "../engine.js";
import { toActorRef } from "../types.js";
import type { AppEnv } from "../types.js";
import { TaskItem } from "../components/TaskItem.js";

const app = new Hono<AppEnv>();

// ---------------------------------------------------------------------------
// PATTERN: can() for mutation authorization
//
// All mutation routes follow the same pattern:
//   1. Build the actor ref from the current user
//   2. Call engine.can(actor, action, resourceRef) BEFORE performing the mutation
//   3. If denied, return a 403 with an HTML error fragment (for htmx to display)
//   4. If allowed, perform the mutation, then re-check permittedActions()
//      on the result so the returned HTML fragment has correct button visibility
//
// This is the "guard then act" pattern — authorization is always checked before
// any database writes. The engine's default-deny semantics mean that if a role
// or permission isn't explicitly granted, can() returns false.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// PATTERN: Parent resource permission check for child creation
//
// Creating a Task requires "create_task" permission on the parent Project,
// not on the Task itself. This is because the Task doesn't exist yet, so
// there's no Task resource to check against. The policy grants "create_task"
// to Project editors and admins.
// ---------------------------------------------------------------------------
app.post("/projects/:id/tasks", async (c) => {
  const user = c.get("currentUser");
  const actor = toActorRef(user);
  const projectId = c.req.param("id");

  // Check create_task on the parent Project — not on a Task, since it
  // doesn't exist yet. Alice (viewer on Alpha) will be denied here;
  // Bob (editor on Alpha) will be allowed.
  const allowed = await engine.can(actor, "create_task", {
    type: "Project",
    id: projectId,
  });

  // ---------------------------------------------------------------------------
  // PATTERN: 403 error fragment for htmx
  //
  // When authorization fails, we return an HTML fragment with a 403 status.
  // htmx will swap this fragment into the page, showing the error inline
  // rather than redirecting. This keeps the UX smooth while clearly
  // communicating the authorization failure.
  // ---------------------------------------------------------------------------
  if (!allowed) {
    return c.html(
      <li class="task-item">
        <div class="error">Permission denied: you cannot create tasks in this project.</div>
      </li>,
      403,
    );
  }

  const body = await c.req.parseBody();
  const title = typeof body.title === "string" ? body.title.trim() : "";

  if (!title) {
    return c.html(
      <li class="task-item">
        <div class="error">Title is required.</div>
      </li>,
      400,
    );
  }

  const description =
    typeof body.description === "string" && body.description.trim()
      ? body.description.trim()
      : null;

  const task = await prisma.task.create({
    data: {
      title,
      description,
      status: "todo",
      projectId,
    },
    include: { assignee: { select: { name: true } } },
  });

  // ---------------------------------------------------------------------------
  // PATTERN: permittedActions after mutation
  //
  // After creating/updating a resource, call permittedActions() on the result
  // so the returned HTML fragment renders the correct edit/delete buttons.
  // The actor who just created the task will typically have full control,
  // but the engine still evaluates the policy to be sure (e.g., forbid rules
  // on archived projects could restrict actions even for the creator).
  // ---------------------------------------------------------------------------
  const permittedActions = await engine.permittedActions(actor, {
    type: "Task",
    id: task.id,
  });

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
// PATTERN: Direct resource permission check
//
// Unlike task creation (which checks the parent Project), update and delete
// check permissions on the Task itself. The engine resolves the Task's
// relations (project, assignee) via the custom resolver in engine.ts, then
// evaluates derived roles:
//   - editor on the parent Project -> editor on the Task
//   - assignee of the Task -> editor on the Task
//
// The policy also has a cross-resource forbid rule: mutations on tasks
// whose parent project is archived are forbidden via
// "$resource.project.archived: true". The engine follows the project
// relation ref to check this.
// ---------------------------------------------------------------------------
app.put("/tasks/:taskId", async (c) => {
  const user = c.get("currentUser");
  const actor = toActorRef(user);
  const taskId = c.req.param("taskId");

  // can("update", Task) evaluates the actor's roles on this specific task,
  // including roles derived from the parent project and assignee relation
  const allowed = await engine.can(actor, "update", {
    type: "Task",
    id: taskId,
  });

  if (!allowed) {
    return c.html(
      <li class="task-item" id={`task-${taskId}`}>
        <div class="error">Permission denied: you cannot update this task.</div>
      </li>,
      403,
    );
  }

  const body = await c.req.parseBody();
  const title = typeof body.title === "string" ? body.title.trim() : undefined;
  const status =
    typeof body.status === "string" &&
    ["todo", "in_progress", "done"].includes(body.status)
      ? body.status
      : undefined;

  const task = await prisma.task.update({
    where: { id: taskId },
    data: {
      ...(title ? { title } : {}),
      ...(status ? { status } : {}),
    },
    include: { assignee: { select: { name: true } } },
  });

  // Re-evaluate permitted actions after the update — the mutation may have
  // changed attributes that affect authorization (e.g., reassigning the task)
  const permittedActions = await engine.permittedActions(actor, {
    type: "Task",
    id: task.id,
  });

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

// ---------------------------------------------------------------------------
// Delete follows the same can() guard pattern as update.
// On success, it returns an empty body so htmx's hx-swap="outerHTML"
// removes the task row from the DOM entirely.
// ---------------------------------------------------------------------------
app.delete("/tasks/:taskId", async (c) => {
  const user = c.get("currentUser");
  const actor = toActorRef(user);
  const taskId = c.req.param("taskId");

  // Same authorization check as update — the "delete" permission is granted
  // to editors (via project role or assignee relation)
  const allowed = await engine.can(actor, "delete", {
    type: "Task",
    id: taskId,
  });

  if (!allowed) {
    return c.html(
      <li class="task-item" id={`task-${taskId}`}>
        <div class="error">Permission denied: you cannot delete this task.</div>
      </li>,
      403,
    );
  }

  await prisma.task.delete({ where: { id: taskId } });

  return c.body(null, 200);
});

export default app;
