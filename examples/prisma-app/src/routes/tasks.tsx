import { Hono } from "hono";
import { prisma } from "../db.js";
import { engine } from "../engine.js";
import { toActorRef } from "../types.js";
import type { AppEnv } from "../types.js";
import { TaskItem } from "../components/TaskItem.js";

const app = new Hono<AppEnv>();

/**
 * POST /projects/:id/tasks — Create a new task in a project.
 * Checks create_task permission on the parent Project before creating.
 * Returns an HTML fragment for HTMX to append to the task list.
 */
app.post("/projects/:id/tasks", async (c) => {
  const user = c.get("currentUser");
  const actor = toActorRef(user);
  const projectId = c.req.param("id");

  // Authorize: can the user create tasks in this project?
  const allowed = await engine.can(actor, "create_task", {
    type: "Project",
    id: projectId,
  });

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

  // Determine permitted actions on the newly created task
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

/**
 * PUT /tasks/:taskId — Update a task's title and/or status.
 * Checks update permission on the Task before modifying.
 * Returns an HTML fragment replacing the existing task row.
 */
app.put("/tasks/:taskId", async (c) => {
  const user = c.get("currentUser");
  const actor = toActorRef(user);
  const taskId = c.req.param("taskId");

  // Authorize: can the user update this task?
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

  // Re-evaluate permitted actions after update
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

/**
 * DELETE /tasks/:taskId — Delete a task.
 * Checks delete permission on the Task before removing.
 * Returns empty response so HTMX removes the row.
 */
app.delete("/tasks/:taskId", async (c) => {
  const user = c.get("currentUser");
  const actor = toActorRef(user);
  const taskId = c.req.param("taskId");

  // Authorize: can the user delete this task?
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
