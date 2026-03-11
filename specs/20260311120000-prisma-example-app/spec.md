# Feature Specification: Prisma Example App

**Feature Branch**: `add-example`
**Created**: 2026-03-11
**Status**: Draft
**Input**: User description: "add a simple node.js app that uses toride with prisma"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse Projects and Tasks as Different Users (Priority: P1)

A developer exploring toride opens the example app and sees a task board UI. They can switch between pre-seeded users (e.g., Alice/viewer, Bob/editor, Charlie/admin) using a user switcher in the header. Each user sees only the projects and tasks they are authorized to view. Action buttons (edit, delete) appear or disappear based on the current user's permissions, demonstrating how toride enforces authorization at the data layer via Prisma WHERE clauses.

**Why this priority**: This is the core showcase — without it, the example app has no value. It demonstrates the primary use case of toride + Prisma: role-based data filtering.

**Independent Test**: Can be fully tested by starting the app, switching users, and verifying that the visible projects/tasks change per user. Delivers immediate understanding of how toride authorization works.

**Acceptance Scenarios**:

1. **Given** the app is running with seed data, **When** a developer selects "Alice (viewer)" from the user switcher, **Then** they see only projects Alice has read access to, and no edit/delete buttons appear on any resource.
2. **Given** the app is running with seed data, **When** a developer selects "Charlie (admin)" from the user switcher, **Then** they see all non-archived projects and tasks, with full CRUD action buttons visible.
3. **Given** a project is archived, **When** any user views the project list, **Then** the archived project does not appear regardless of role.

---

### User Story 2 - Create, Update, and Delete Tasks with Authorization (Priority: P2)

A developer can perform CRUD operations on tasks through the UI. When an authorized user (editor or admin) creates, updates, or deletes a task, the operation succeeds. When an unauthorized user attempts the same operation, the server returns an authorization error and the UI displays a clear rejection message.

**Why this priority**: Demonstrates that toride doesn't just filter reads — it enforces authorization on mutations too. This is essential for showing real-world usage.

**Independent Test**: Can be tested by logging in as an editor, successfully creating/editing a task, then switching to a viewer and attempting the same operations to see them rejected.

**Acceptance Scenarios**:

1. **Given** the current user is "Bob (editor)" on a project, **When** Bob creates a new task in that project, **Then** the task is created and appears in the task list.
2. **Given** the current user is "Bob (editor)" on a project, **When** Bob updates a task's title, **Then** the change is saved and displayed.
3. **Given** the current user is "Alice (viewer)", **When** Alice attempts to create a task, **Then** the server rejects the request and the UI shows an authorization error.
4. **Given** a task belongs to an archived project, **When** an editor attempts to update or delete the task, **Then** the operation is forbidden (enforced by the policy rule).

---

### User Story 3 - Zero-Friction Setup (Priority: P2)

A developer clones the repository, runs a few commands, and has the example app running with pre-populated data. The setup requires no external services (no PostgreSQL, no Docker).

**Why this priority**: If setup is painful, developers won't try the example. SQLite + seed data eliminates all friction.

**Independent Test**: Can be tested by following the README instructions on a fresh clone — the app should be running with data visible in under 2 minutes.

**Acceptance Scenarios**:

1. **Given** a fresh clone of the repository, **When** the developer runs `pnpm install`, `pnpm prisma db push`, `pnpm prisma db seed`, and `pnpm dev`, **Then** the app starts and displays seed data.
2. **Given** the app is set up, **When** the developer visits the app URL in a browser, **Then** they see a project/task board with pre-populated data and a user switcher.

---

### User Story 4 - Understand the Code as a Learning Resource (Priority: P3)

A developer reads the example app's source code to understand how to integrate toride with Prisma in their own project. The code is well-structured, follows the patterns from the official docs, and includes clear comments at key integration points (engine setup, resolver creation, constraint building, authorization checks).

**Why this priority**: The example app serves as a reference implementation. If the code is hard to follow, it fails its educational purpose.

**Independent Test**: A developer unfamiliar with toride can read the source code and identify where/how authorization is configured, how resolvers are set up, and how permissions are checked — without needing to refer to external docs.

**Acceptance Scenarios**:

1. **Given** a developer opens the example source code, **When** they look at the engine setup file, **Then** they can identify the policy loading, resolver registration, and adapter creation within a single file.
2. **Given** a developer opens a route handler, **When** they read the handler code, **Then** they can see how `engine.can()` and `engine.buildConstraints()` are used to enforce authorization.

---

### Edge Cases

- What happens when a user has no roles on any project? They see an empty project list with a message indicating no accessible projects.
- What happens when a task's parent project is deleted? Cascade delete removes the task (handled by Prisma schema).
- What happens when the seed data is run multiple times? The seed script is idempotent — it clears existing data before inserting.
- What happens when an unauthorized user crafts a direct POST/PUT/DELETE request (bypassing UI)? The server-side authorization check still rejects it.

## Clarifications

### Session 2026-03-11

- Q: Are 'archived' and 'completed' project states the same or separate? → A: Same status — a single `archived` boolean flag that both hides the project from lists and forbids task mutations.
- Q: Single page or multi-page navigation? → A: Multi-page — project list page → project detail page with tasks.
- Q: How should the user switcher persist the selected user? → A: Cookie-based (`userId` cookie). Server reads cookie on each request to resolve current user.
- Q: Should htmx be used for interactions or full page reloads? → A: htmx with partial page updates for CRUD operations and user switching.
- Q: Should tasks have their own status field? → A: Yes — tasks have a status enum (todo/in_progress/done).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The app MUST be located in `examples/prisma-app/` and NOT be a pnpm workspace member (it is a standalone project).
- **FR-002**: The app MUST use Hono as the HTTP server with JSX for server-rendered HTML pages, and htmx (loaded via CDN) for partial page updates on CRUD operations and user switching.
- **FR-003**: The app MUST use Prisma with SQLite as the database, requiring no external services.
- **FR-004**: The app MUST include a seed script that populates the database with sample users, projects, and tasks with various role assignments.
- **FR-005**: The app MUST use the same policy structure as the official docs quickstart (Projects with viewer/editor/admin roles, Tasks with relation-based role derivation from projects).
- **FR-005a**: The app MUST use a multi-page layout: a project list page (`/`) and a project detail page (`/projects/:id`) showing the project's tasks.
- **FR-006**: The app MUST display a user switcher that allows selecting between pre-seeded users with different roles. The selected user is persisted via a `userId` cookie; the server reads this cookie on each request to resolve the current user context.
- **FR-007**: The app MUST filter project and task lists using `engine.buildConstraints()` + `createPrismaAdapter()` to generate Prisma WHERE clauses, demonstrating query-level authorization.
- **FR-008**: The app MUST enforce authorization on create, update, and delete operations using `engine.can()` before executing the mutation.
- **FR-009**: The app MUST show/hide action buttons (edit, delete, create) based on the current user's permissions using `engine.permittedActions()`.
- **FR-010**: The app MUST display clear feedback when an operation is rejected due to insufficient permissions.
- **FR-011**: The app MUST use `createPrismaResolver()` from `@toride/prisma` for engine resolvers.
- **FR-012**: The app MUST include a README with setup instructions (install, db push, seed, dev).

### Key Entities

- **User**: Represents an actor with attributes (department, isSuperAdmin flag). Pre-seeded with 3+ users spanning viewer, editor, and admin roles.
- **Project**: A container for tasks. Has roles (viewer, editor, admin), a department field, and an archived flag. Demonstrates attribute-based and global role derivation.
- **Task**: Belongs to a project (relation). Has an assignee (relation to User) and a status enum (`todo`, `in_progress`, `done`). Demonstrates relation-based role derivation and conditional rules (forbid mutations on archived projects).
- **Role Assignment**: Maps users to roles on specific projects. Drives the direct role-based access control.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer can go from fresh clone to running app with seed data in under 5 setup commands.
- **SC-002**: Switching between 3+ pre-seeded users visibly changes which projects and tasks are displayed and which actions are available.
- **SC-003**: 100% of unauthorized mutation attempts (create, update, delete) are rejected with a clear error message.
- **SC-004**: The example app demonstrates at least 3 toride features: role-based filtering (`buildConstraints`), permission checks (`can`), and permitted actions (`permittedActions`).
- **SC-005**: The example code is self-contained — it depends only on `toride`, `@toride/prisma`, `hono`, `@prisma/client`, and standard Node.js APIs.
