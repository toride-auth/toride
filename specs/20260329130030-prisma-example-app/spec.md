# Feature Specification: Prisma Example App

**Feature Branch**: `prisma-example`
**Created**: 2026-03-29
**Status**: Draft
**Input**: User description: "create an example app. here's an example implementation in `.ai-tmp/example`"

## Clarifications

### Session 2026-03-29

- Q: Should the example app include automated tests? → A: No automated tests — manual verification only via README scenarios
- Q: Should generated type file (src/generated/policy.ts) be committed or generated during setup? → A: Generated during setup — add `pnpm codegen` to README setup steps
- Q: Should the example README and docs site cross-link? → A: Example README links to docs site only (one-directional)

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse Projects by Role (Priority: P1)

A developer evaluating toride visits the example app and sees a list of projects filtered by their current user's permissions. They switch between pre-seeded users (Alice, Bob, Charlie) using a dropdown in the header and immediately see how the project list changes based on each user's roles and attributes.

**Why this priority**: This is the core demonstration of toride's `buildConstraints()` API — pushing authorization filtering down to the database. It's the first thing a new user sees and the primary value proposition of the library.

**Independent Test**: Can be fully tested by starting the app, loading the project list page, and switching users — each switch should show a different filtered set of projects.

**Acceptance Scenarios**:

1. **Given** the app is seeded with sample data, **When** a user with viewer role on one project visits the project list, **Then** they see only that project
2. **Given** the app is seeded with sample data, **When** a superadmin user visits the project list, **Then** they see all non-archived projects
3. **Given** a user has editor role via department match, **When** they visit the project list, **Then** engineering-department projects appear in their list
4. **Given** a project is archived, **When** any user visits the project list, **Then** the archived project does not appear

---

### User Story 2 - View Project Detail with Permission-Aware Task List (Priority: P1)

A developer clicks into a project and sees its tasks. Each task shows edit/delete controls only if the current user has the corresponding permissions. The project detail page also shows the user's permitted actions (read, update, delete, create_task) for that project.

**Why this priority**: Demonstrates the `snapshot()` + `TorideClient` pattern for batched permission checks and the `permittedActions()` API for conditional UI rendering — essential patterns for real-world apps.

**Independent Test**: Can be tested by navigating to a project detail page as different users and verifying that task action buttons appear/disappear based on role.

**Acceptance Scenarios**:

1. **Given** a user with editor role on a project, **When** they view the project detail, **Then** they see edit and delete controls on tasks
2. **Given** a user with viewer role on a project, **When** they view the project detail, **Then** they see tasks but no edit/delete controls
3. **Given** a user without read permission on a project, **When** they navigate to the project detail URL directly, **Then** they see a 403 permission denied message
4. **Given** a project with multiple tasks, **When** any authorized user views the detail, **Then** all tasks in the project are listed with appropriate per-task action controls

---

### User Story 3 - Create Tasks with Authorization (Priority: P2)

A developer with editor or admin role on a project can create new tasks from the project detail page. The create form appears only when the user has `create_task` permission. Submitting the form adds the task inline via HTMX without a full page reload.

**Why this priority**: Demonstrates the `can()` guard pattern for mutations and parent-resource permission checks (checking `create_task` on Project rather than on a non-existent Task).

**Independent Test**: Can be tested by attempting task creation as an editor (succeeds) and as a viewer (form hidden; direct POST returns 403).

**Acceptance Scenarios**:

1. **Given** a user with create_task permission on a project, **When** they view the project detail, **Then** a "Create Task" form is visible
2. **Given** a user with create_task permission, **When** they submit a valid task title, **Then** the new task appears in the task list without a page reload
3. **Given** a user without create_task permission, **When** they view the project detail, **Then** no create form is shown
4. **Given** an empty task title, **When** submitted, **Then** a validation error is displayed

---

### User Story 4 - Update and Delete Tasks with Authorization (Priority: P2)

A developer with editor role on a task (via project role or assignee relation) can update the task's title and status or delete it. These mutations are guarded by `can()` checks and return inline HTML fragments via HTMX.

**Why this priority**: Demonstrates direct resource permission checks, cross-resource forbid rules (archived project blocks task mutations), and the assignee-based derived role pattern.

**Independent Test**: Can be tested by editing/deleting tasks as different users and verifying authorization enforcement.

**Acceptance Scenarios**:

1. **Given** a user with update permission on a task, **When** they change the title or status and click Save, **Then** the task updates inline without a page reload
2. **Given** a user with delete permission on a task, **When** they click Delete and confirm, **Then** the task is removed from the list
3. **Given** a task in an archived project, **When** any user attempts to update or delete it, **Then** the operation is forbidden with a 403 error
4. **Given** a user who is the assignee of a task, **When** they attempt to edit it, **Then** the operation succeeds (assignee gets editor role)

---

### User Story 5 - Switch Between Users (Priority: P1)

A developer uses the user switcher dropdown in the header to impersonate different pre-seeded users. Switching users immediately redirects to the project list, which updates to reflect the new user's permissions.

**Why this priority**: The user switcher is the primary mechanism for exploring authorization behavior. Without it, the developer would need to manipulate cookies manually.

**Independent Test**: Can be tested by selecting each user in the dropdown and verifying the redirect and updated project list.

**Acceptance Scenarios**:

1. **Given** the app is running with seeded data, **When** a developer selects a different user from the dropdown, **Then** the page redirects to the project list filtered for that user
2. **Given** no cookie is set, **When** a developer visits the app for the first time, **Then** the first user in the database is selected by default

---

### Edge Cases

- What happens when the database has not been seeded? The app displays a clear message: "No users found. Run 'pnpm prisma db seed' first."
- What happens when a user navigates to a non-existent project ID? A 404 "Project not found" message is shown.
- What happens when a user's cookie references a deleted user ID? The app falls back to the first user in the database.
- What happens when a task creation POST is sent directly (bypassing the UI) by an unauthorized user? A 403 HTML error fragment is returned.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: App MUST display a list of projects filtered by the current user's authorization, using toride's `buildConstraints()` to push filtering to the database query
- **FR-002**: App MUST provide a user switcher in the header that allows selecting between pre-seeded users (Alice — viewer, Bob — editor, Charlie — superadmin)
- **FR-003**: App MUST show a project detail page with tasks, where edit/delete controls are conditionally rendered based on the user's `permittedActions()` for each task
- **FR-004**: App MUST guard all mutation routes (create, update, delete tasks) with `can()` authorization checks before performing database writes
- **FR-005**: App MUST enforce the archived project forbid rule — no read or mutation access to archived projects or their tasks
- **FR-006**: App MUST support derived roles: superadmin from global role, editor from department match, and viewer/editor/admin from direct role assignments
- **FR-007**: App MUST support relation-based role derivation for tasks — editor/viewer roles flow from the parent project, and editor role flows from the assignee relation
- **FR-008**: App MUST use HTMX for inline task CRUD operations (create, update, delete) without full page reloads
- **FR-009**: App MUST include a database seed script that creates sample users, projects, role assignments, and tasks demonstrating all authorization scenarios described in the README
- **FR-010**: App MUST include tutorial-style inline code comments explaining each toride pattern (buildConstraints, can, snapshot, TorideClient, permittedActions, translateConstraints)
- **FR-011**: App MUST include a README with setup instructions (including `pnpm codegen` step), feature descriptions, "try these scenarios" guidance, and a link to the toride docs site for deeper learning
- **FR-012**: App MUST use the `@toride/codegen` tool to generate type-safe schema types from `policy.yaml`; generated files are NOT committed to git and must be produced during setup via a `codegen` script
- **FR-013**: App MUST use the `@toride/prisma` adapter to translate constraint ASTs into Prisma WHERE clauses
- **FR-014**: App MUST NOT include automated tests — verification is manual via README scenarios

### Key Entities

- **User**: A person using the app, with attributes: name, email, department, and superadmin flag. Pre-seeded with three users representing different authorization profiles.
- **Project**: A container for tasks, with attributes: name, department, status, archived flag. Has role assignments linking users to roles (viewer, editor, admin).
- **Task**: A work item within a project, with attributes: title, description, status (todo, in_progress, done). Optionally assigned to a user. Inherits authorization from its parent project.
- **RoleAssignment**: A join record linking a user to a role on a specific project. Enables direct role-based access control alongside attribute-based derived roles.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer with no prior toride experience can clone the repo, follow the README setup steps, and have the app running locally within 5 minutes
- **SC-002**: Switching between all three pre-seeded users produces visibly different project lists, demonstrating role-based filtering
- **SC-003**: All authorization scenarios described in the README ("Try These Scenarios" section) are reproducible and produce the documented outcomes
- **SC-004**: Every toride API used in the app (buildConstraints, translateConstraints, can, permittedActions, snapshot, TorideClient) has at least one inline code comment explaining the pattern and why it's used
- **SC-005**: Task CRUD operations (create, update, delete) complete inline without full page reloads for authorized users
- **SC-006**: Unauthorized mutation attempts return clear, user-visible error messages (not raw stack traces or silent failures)

## Assumptions

- The app uses SQLite via Prisma for zero-configuration database setup (no external database server needed)
- The app uses Hono as the web framework with JSX for server-rendered HTML and HTMX for interactivity — matching the reference implementation's stack
- The app uses published npm package versions (e.g., `toride@^0.3.0`, `@toride/prisma@^0.3.0`) rather than workspace links
- The app lives at `examples/prisma-app` and is standalone — not managed by Nx or included in `nx run-many` commands
- Authentication is simulated via a cookie-based user switcher; no real login flow is needed
- The CSS is inline in the Layout component for simplicity (no build step for styles)
- Generated type files (src/generated/) are gitignored and produced by running `pnpm codegen` during setup
- No automated test suite is included; the app is verified manually via README-documented scenarios
- The example README links to the toride docs site for further reading; updating the docs site to link back is out of scope
