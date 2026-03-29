# HTTP Route Contracts: Prisma Example App

**Date**: 2026-03-29

## Routes

### GET /

Redirect to `/projects`.

**Response**: 302 → `/projects`

---

### GET /projects

List all projects the current user can read.

**Authorization**: `buildConstraints(actor, "read", "Project")` → Prisma WHERE clause
**Response**: HTML page with project cards. Each card shows name, department, status, and permitted actions.
**Empty state**: "No accessible projects" message when user has no read access.

---

### GET /projects/:id

Show project detail with task list.

**Authorization**: `can(actor, "read", { type: "Project", id })` → 403 if denied
**Response**: HTML page with:
- Project info (name, department, status, permitted actions)
- Create task form (visible only if `create_task` in permitted actions)
- Task list with per-task edit/delete controls based on `snapshot()` permissions
**Error states**:
- 404: Project not found
- 403: Permission denied HTML page

---

### POST /projects/:id/tasks

Create a new task in a project.

**Authorization**: `can(actor, "create_task", { type: "Project", id })` → 403 if denied
**Request body** (form-encoded):
- `title` (string, required, trimmed)
- `description` (string, optional)
**Response**:
- 201: HTML fragment (`<li class="task-item">...</li>`) for HTMX `beforeend` swap
- 400: HTML error fragment if title empty
- 403: HTML error fragment if unauthorized
**HTMX**: `hx-post`, `hx-target="#task-list"`, `hx-swap="beforeend"`

---

### PUT /tasks/:taskId

Update a task's title and/or status.

**Authorization**: `can(actor, "update", { type: "Task", id })` → 403 if denied
**Request body** (form-encoded):
- `title` (string, optional, trimmed)
- `status` (string, optional, must be one of: todo, in_progress, done)
**Response**:
- 200: HTML fragment (`<li class="task-item">...</li>`) replacing the existing row via HTMX `outerHTML` swap
- 403: HTML error fragment if unauthorized (including archived project forbid)
**HTMX**: `hx-put`, `hx-target="#task-{taskId}"`, `hx-swap="outerHTML"`

---

### DELETE /tasks/:taskId

Delete a task.

**Authorization**: `can(actor, "delete", { type: "Task", id })` → 403 if denied
**Response**:
- 200: Empty body (HTMX `outerHTML` swap removes the element)
- 403: HTML error fragment if unauthorized
**HTMX**: `hx-delete`, `hx-target="#task-{taskId}"`, `hx-swap="outerHTML"`, `hx-confirm="Delete this task?"`

---

### POST /switch-user

Switch the current user via cookie.

**Request body** (form-encoded):
- `userId` (string)
**Response**: 204 with `HX-Redirect: /projects` header
**Side effect**: Sets `currentUser` cookie
**HTMX**: `hx-post`, `hx-trigger="change"`, `hx-swap="none"`
