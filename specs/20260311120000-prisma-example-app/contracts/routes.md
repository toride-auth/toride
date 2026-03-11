# HTTP Route Contracts: Prisma Example App

The example app exposes the following Hono routes. All routes return server-rendered HTML (full pages or HTMX fragments).

## Page Routes (Full HTML)

### GET /

**Description**: Redirect to `/projects`
**Response**: 302 redirect

### GET /projects

**Description**: List projects the current user can read
**Auth**: Uses `engine.buildConstraints(actor, "read", "Project")` → Prisma WHERE clause
**Response**: Full HTML page with project cards. Each card shows conditional action buttons based on `engine.permittedActions()`.
**Cookie**: Reads `currentUser` cookie to determine actor

### GET /projects/:id

**Description**: Project detail page with task list
**Auth**: First checks `engine.can(actor, "read", { type: "Project", id })`. Then uses `engine.buildConstraints(actor, "read", "Task")` with additional `{ projectId: id }` filter for task listing.
**Response**: Full HTML page with project info and task list. Conditional action buttons per task based on `engine.permittedActions()`.
**Cookie**: Reads `currentUser` cookie

## HTMX Fragment Routes

### POST /switch-user

**Description**: Switch the active user
**Request body**: `userId` (form-encoded)
**Response**: Sets `currentUser` cookie, returns `HX-Redirect: /projects` header
**Auth**: None (this is the auth mechanism itself)

### POST /projects/:id/tasks

**Description**: Create a new task in a project
**Auth**: `engine.can(actor, "create_task", { type: "Project", id })`
**Request body**: `title`, `description` (form-encoded)
**Response success**: HTML fragment of the new task row (HTMX swaps into task list)
**Response error (403)**: HTML fragment with authorization error message

### PUT /tasks/:taskId

**Description**: Update a task
**Auth**: `engine.can(actor, "update", { type: "Task", id: taskId })`
**Request body**: `title`, `status` (form-encoded)
**Response success**: HTML fragment of the updated task row
**Response error (403)**: HTML fragment with authorization error message

### DELETE /tasks/:taskId

**Description**: Delete a task
**Auth**: `engine.can(actor, "delete", { type: "Task", id: taskId })`
**Response success**: Empty response (HTMX removes the row)
**Response error (403)**: HTML fragment with authorization error message

## Error Handling

All mutation routes follow the same pattern:

1. Read current user from cookie → 404 if not found
2. Call `engine.can()` with the actor, permission, and resource
3. If denied: return 403 with an HTML error message fragment
4. If allowed: execute the Prisma mutation, return success fragment

Error fragments use a consistent `<div class="error">` structure that HTMX can swap into a designated error container.
