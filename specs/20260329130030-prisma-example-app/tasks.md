# Tasks: Prisma Example App

**Input**: Design documents from `/specs/20260329130030-prisma-example-app/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/routes.md, quickstart.md

**Tests**: No automated tests (per FR-014). Verification is manual via README scenarios.

**Organization**: Tasks are grouped by user story. Setup and foundational phases create shared infrastructure; user story phases build on top independently.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

All paths relative to `examples/prisma-app/`.

---

## Phase 1: Setup

**Purpose**: Create the standalone project scaffolding with all configuration files

- [ ] T001 Create `examples/prisma-app/` directory, `package.json` (with dependencies: hono ^4.7.0, @hono/node-server ^1.13.0, @prisma/client ^6.4.0, toride ^0.3.0, @toride/prisma ^0.3.0; devDeps: @toride/codegen ^0.3.0, prisma ^6.4.0, tsx ^4.19.0, typescript ^5.7.0; scripts: dev, start, codegen, prisma), `tsconfig.json` (strict, ES2022, JSX react-jsx with hono/jsx), and `.gitignore` (node_modules, dist, prisma/dev.db, src/generated/)
- [ ] T002 Create Prisma schema at `prisma/schema.prisma` with all 4 entities (User, Project, Task, RoleAssignment) per data-model.md, and seed script at `prisma/seed.ts` per data-model.md seed data section (3 users, 3 projects, 3 role assignments, 6 tasks)
- [ ] T003 Create authorization policy at `policy.yaml` matching the reference implementation: actors (User with id, email, department, isSuperAdmin), global_roles (superadmin), resources (Project with viewer/editor/admin roles, derived roles for superadmin/department/role-assignment, archived forbid rule; Task with viewer/editor roles, derived from project relation and assignee relation, archived project forbid rule)

---

## Phase 2: Foundational

**Purpose**: Core infrastructure that ALL user stories depend on — engine, types, database, middleware

**CRITICAL**: No user story work can begin until this phase is complete

- [ ] T004 Create shared infrastructure files: `src/db.ts` (Prisma client singleton), `src/types.ts` (AppSchema re-export from generated types, User type, AppEnv Hono env type, toActorRef helper), `src/engine.ts` (load policy YAML, create Prisma adapter via createPrismaAdapter, custom Project resolver with role assignment ID arrays, custom Task resolver with project/assignee ResourceRefs, Toride engine construction). Add tutorial-style inline comments explaining each toride pattern per FR-010.
- [ ] T005 Create `src/middleware.ts` (user resolution middleware: read currentUser cookie, load all users for switcher dropdown, fallback to first user, handle unseeded DB with error message) and `src/components/Layout.tsx` (HTML shell with header, user switcher dropdown via HTMX hx-post to /switch-user, inline CSS styles per reference implementation)

**Checkpoint**: Foundation ready — `pnpm install && pnpm codegen && pnpm prisma db push && pnpm prisma db seed` should succeed. Engine and middleware compile.

---

## Phase 3: User Story 1 — Browse Projects by Role (P1) + User Story 5 — Switch Users (P1)

**Goal**: Project list page filtered by authorization + user switcher. These two P1 stories are combined because the user switcher is tested via the project list.

**Independent Test**: Start app → see project list → switch users → see different projects for Alice (Alpha only), Bob (Alpha + Beta + engineering), Charlie (all non-archived)

- [ ] T006 [US1] [US5] Create `src/components/ProjectList.tsx` (project cards with name, department, status badge, permitted actions display; empty state message), `src/routes/projects.tsx` GET `/` handler (buildConstraints for read+Project, handle forbidden/unrestricted/constrained cases via translateConstraints+adapter, snapshot+TorideClient for batched permittedActions, render Layout+ProjectList), and `src/index.tsx` (Hono app, apply userMiddleware, mount project routes at /projects, POST /switch-user with cookie set + HX-Redirect, root redirect to /projects, serve on port 3000). Add tutorial-style inline comments per FR-010 explaining buildConstraints, translateConstraints, snapshot, and TorideClient patterns.

**Checkpoint**: App starts, project list works, user switching works. Core authorization demo functional.

---

## Phase 4: User Story 2 — View Project Detail with Permission-Aware Task List (P1)

**Goal**: Project detail page showing tasks with conditional edit/delete controls based on permissions

**Independent Test**: Navigate to `/projects/:id` → see project info + tasks → verify controls differ per user role

- [ ] T007 [US2] Create `src/components/ProjectDetail.tsx` (project info card with permitted actions, conditional create task form, task list container) and `src/components/TaskItem.tsx` (task row with title, status badge, assignee name, conditional edit form with title input + status select + Save button via hx-put, conditional delete button via hx-delete with hx-confirm). Add GET `/projects/:id` handler to `src/routes/projects.tsx` (can() guard for read, 404 for missing project, 403 for denied, fetch tasks with assignee, single snapshot() for project + all tasks, TorideClient for per-resource permittedActions, render Layout+ProjectDetail+TaskItems). Add tutorial-style inline comments per FR-010 explaining can() guard pattern and snapshot batching.

**Checkpoint**: Project detail page works with permission-aware task controls. All P1 stories complete.

---

## Phase 5: User Story 3 — Create Tasks (P2) + User Story 4 — Update/Delete Tasks (P2)

**Goal**: Full task CRUD with authorization guards. Combined because they share `src/routes/tasks.tsx` and the TaskItem component already has edit/delete UI from Phase 4.

**Independent Test**: As Bob on Alpha: create task (succeeds), edit task (succeeds), delete task (succeeds). As Alice on Alpha: create form hidden, direct POST returns 403. As anyone on archived Gamma: mutations forbidden.

- [ ] T008 [US3] [US4] Create `src/routes/tasks.tsx` with three handlers: POST `/projects/:id/tasks` (can() guard for create_task on parent Project, validate title, create task, permittedActions on result, return TaskItem fragment with 201), PUT `/tasks/:taskId` (can() guard for update on Task, update title/status, permittedActions on result, return TaskItem fragment), DELETE `/tasks/:taskId` (can() guard for delete on Task, delete, return empty 200). Mount task routes in `src/index.tsx`. Add tutorial-style inline comments per FR-010 explaining parent resource permission check pattern, guard-then-act pattern, and cross-resource forbid rule for archived projects.

**Checkpoint**: All user stories complete. Full CRUD with authorization working.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: README, documentation links, and UX improvements

- [ ] T009 Create `README.md` with: project title, prerequisites, setup instructions (including `pnpm codegen` step per FR-012), "What You'll See" section, "Try These Scenarios" section (role-based filtering, mutation authorization, department-based access per spec acceptance scenarios), key files table, reset instructions, and link to toride docs site per clarification
- [ ] T010 Polish pass: verify all inline code comments are tutorial-quality (explain "why this pattern" not just "what"), improve empty states, ensure status badges are consistent, verify form reset after task creation, add user department/role context info in header per plan polish opportunities

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 (Setup)**: No dependencies — start immediately
- **Phase 2 (Foundational)**: Depends on Phase 1
- **Phase 3 (US1+US5)**: Depends on Phase 2
- **Phase 4 (US2)**: Depends on Phase 3 (needs project routes and components)
- **Phase 5 (US3+US4)**: Depends on Phase 4 (needs TaskItem component and project detail page)
- **Phase 6 (Polish)**: Depends on Phase 5

### User Story Dependencies

- **US1 + US5** (project list + user switcher): After Foundational — no other story dependencies
- **US2** (project detail): After US1 (extends project routes file, adds components)
- **US3 + US4** (task CRUD): After US2 (needs project detail page and TaskItem component)

### Within Each Phase

Tasks within a phase are sequential (single developer, shared files).

---

## Implementation Strategy

### MVP First (Phase 1-3)

1. Complete Phase 1: Setup — project scaffolding
2. Complete Phase 2: Foundational — engine, middleware, types
3. Complete Phase 3: US1+US5 — project list + user switching
4. **STOP and VALIDATE**: Switch between users, verify different project lists
5. Demo-ready with core authorization concept

### Full Delivery (Phase 1-6)

1. Phases 1-3: MVP (project list + user switching)
2. Phase 4: Add project detail with permission-aware tasks
3. Phase 5: Add task CRUD with mutation authorization
4. Phase 6: README and polish
5. **VALIDATE**: Walk through all README scenarios end-to-end

---

## Takt Usage

```bash
# Phase 1: Setup
takt run planner "Phase 1: Create examples/prisma-app scaffolding — package.json, tsconfig.json, .gitignore, prisma schema+seed, policy.yaml"

# Phase 2: Foundational
takt run planner "Phase 2: Create shared infrastructure — db.ts, types.ts, engine.ts with toride setup, middleware.ts, Layout.tsx"

# Phase 3: US1+US5
takt run planner "Phase 3: Implement project list with buildConstraints filtering, user switcher, and app entry point"

# Phase 4: US2
takt run planner "Phase 4: Implement project detail page with permission-aware task list using snapshot+TorideClient"

# Phase 5: US3+US4
takt run planner "Phase 5: Implement task CRUD routes with can() authorization guards"

# Phase 6: Polish
takt run planner "Phase 6: Create README with setup instructions and try-these-scenarios guide, polish pass"
```

---

## Notes

- All file paths are relative to `examples/prisma-app/`
- No automated tests per FR-014
- Generated files (`src/generated/`) are gitignored per clarification
- Reference implementation at `.ai-tmp/example/` should be used as a guide for each task
- Commit after each phase checkpoint
- Per-story tasks are coarse (one task per story) since this is a single-developer example app with tightly coupled files
