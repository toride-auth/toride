# Tasks: Prisma Example App

**Input**: Design documents from `/specs/20260311120000-prisma-example-app/`
**Prerequisites**: plan.md, spec.md, data-model.md, contracts/routes.md, research.md, quickstart.md

**Tests**: None (demo app, manual verification only per spec)

**Organization**: US3 (zero-friction setup) is folded into Setup + Foundational phases. US1 (browse) and US2 (CRUD mutations) are merged into a single phase since they share routes, components, and engine infrastructure. US4 (learning resource) is a polish phase.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1+US2, US4)

---

## Phase 1: Setup (Project Scaffolding)

**Purpose**: Create the standalone example app directory and project configuration. Covers US3 (zero-friction setup) scaffolding.

- [x] T001 Create `examples/prisma-app/` directory structure with `src/`, `src/routes/`, `src/components/`, `prisma/` subdirectories
- [x] T002 Create `examples/prisma-app/package.json` with dependencies (hono, @hono/node-server, toride ^0.1.0, @toride/prisma ^0.1.0, @prisma/client, prisma, tsx, yaml) and scripts (dev: `tsx watch src/index.tsx`, start: `tsx src/index.tsx`, prisma seed: `tsx prisma/seed.ts`). Must NOT be a pnpm workspace member.
- [x] T003 [P] Create `examples/prisma-app/tsconfig.json` with `"jsx": "react-jsx"`, `"jsxImportSource": "hono/jsx"`, strict mode, ESNext module
- [x] T004 [P] Create `examples/prisma-app/.gitignore` with `node_modules/`, `dev.db`, `dev.db-journal`, generated Prisma client

**Checkpoint**: Directory structure exists, `pnpm install` succeeds in `examples/prisma-app/`

---

## Phase 2: Foundational (Schema, Engine, Seed)

**Purpose**: Core infrastructure that MUST be complete before route/component implementation. Covers US3 (zero-friction setup) data layer and engine.

**CRITICAL**: No US1/US2 work can begin until this phase is complete.

- [x] T005 Create `examples/prisma-app/prisma/schema.prisma` with SQLite datasource (`file:./dev.db`), User (id, name, email, department, isSuperAdmin), Project (id, name, department, status, archived), Task (id, title, description, status enum todo/in_progress/done, projectId FK, assigneeId FK), RoleAssignment (id, userId FK, projectId FK, role) with unique composite index on (userId, projectId, role). Use `@default(cuid())` for IDs. Cascade delete Task on Project delete, set null on User delete for assignee.
- [x] T006 [P] Create `examples/prisma-app/policy.yaml` matching docs quickstart pattern: Actor `User` with `department` and `isSuperAdmin` attributes; global role `superadmin` from `isSuperAdmin: true`; Project resource with viewer/editor/admin roles, derived admin from superadmin, derived editor from `$actor.department == $resource.department`, forbid rule on `$resource.archived: true`; Task resource with roles derived from project relation + assignee-based editor derivation, forbid mutations when `$resource.project.archived: true`. Use `createPrismaResolver` relation patterns.
- [x] T007 Create `examples/prisma-app/src/db.ts` — export a PrismaClient singleton. Simple module: `import { PrismaClient } from "@prisma/client"; export const prisma = new PrismaClient();`
- [x] T008 Create `examples/prisma-app/src/engine.ts` — toride engine setup: import `loadYaml` from `toride`, `createPrismaResolver` and `createPrismaAdapter` from `@toride/prisma`; load `policy.yaml`; create resolvers for Project and Task using `createPrismaResolver(prisma)`; create Prisma adapter via `createPrismaAdapter(prisma)`; export configured engine instance.
- [x] T009 Create `examples/prisma-app/src/middleware.ts` — Hono middleware that reads `currentUser` cookie (use `getCookie` from `hono/cookie`), queries User by ID from Prisma, attaches user to Hono context variable. Default to first user if no cookie. Return 404 if user not found.
- [x] T010 Create `examples/prisma-app/prisma/seed.ts` — idempotent seed script: deleteMany all tables (RoleAssignment, Task, Project, User order), then create 3 users (Alice/engineering, Bob/engineering, Charlie/ops+superadmin), 3 projects (Alpha/engineering/active, Beta/marketing/active, Gamma/engineering/completed+archived), role assignments (Alice→Alpha:viewer, Bob→Alpha:editor, Bob→Beta:viewer), 6 tasks per data-model.md. Use `prisma.$transaction` for atomicity.
- [x] T011 [P] Create `examples/prisma-app/src/components/Layout.tsx` — Hono JSX component: HTML shell with `<head>` containing htmx CDN script tag, inline CSS for task board styling. Body includes header with app title and user switcher dropdown (POST /switch-user via htmx `hx-post`). Accept `children`, `currentUser`, and `users` props.
- [x] T012 [P] Create `examples/prisma-app/README.md` with setup instructions matching quickstart.md: prerequisites (Node 20+, pnpm), 4 setup commands (install, db push, db seed, dev), what you'll see, try-these-scenarios section, key files table.

**Checkpoint**: `pnpm prisma db push` and `pnpm prisma db seed` succeed. Engine module exports correctly. Middleware resolves users from cookies.

---

## Phase 3: US1+US2 — Browse Projects/Tasks + CRUD with Authorization (Priority: P1+P2)

**Goal**: Users can browse projects/tasks filtered by permissions (US1) and perform authorized CRUD mutations on tasks (US2). Merged because routes and components serve both stories.

**Independent Test**: Start the app, switch between Alice/Bob/Charlie. Verify filtered project/task lists (US1). As Bob, create/edit/delete tasks. As Alice, attempt mutations and see authorization errors (US2).

### Components (can be built in parallel)

- [x] T013 [P] [US1+US2] Create `examples/prisma-app/src/components/ProjectList.tsx` — Hono JSX component rendering project cards as links to `/projects/:id`. Each card shows project name, department, status. Conditionally show action indicators based on permitted actions passed as props.
- [x] T014 [P] [US1+US2] Create `examples/prisma-app/src/components/ProjectDetail.tsx` — Hono JSX component showing project info header, task creation form (visible only if `create_task` permitted, uses `hx-post` to `/projects/:id/tasks` with `hx-target` for task list), and task list container. Accept project, tasks, and permissions props.
- [x] T015 [P] [US1+US2] Create `examples/prisma-app/src/components/TaskItem.tsx` — Hono JSX component for a single task row: title, status badge, assignee name. Conditionally render inline edit form (`hx-put /tasks/:id`) and delete button (`hx-delete /tasks/:id` with `hx-swap="outerHTML"`) based on permitted actions props. Error container div for authorization rejection messages.

### Routes (depend on components)

- [x] T016 [US1+US2] Create `examples/prisma-app/src/routes/projects.tsx` — Hono route module: `GET /projects` uses `engine.buildConstraints(actor, "read", "Project")` → `translateConstraints()` with Prisma adapter → `prisma.project.findMany({ where })`. For each project, call `engine.permittedActions(actor, { type: "Project", id })` to determine visible actions. Render Layout + ProjectList. `GET /projects/:id` checks `engine.can(actor, "read", { type: "Project", id })`, then uses `engine.buildConstraints(actor, "read", "Task")` with additional `{ projectId: id }` filter for tasks. Call `permittedActions` per task. Render Layout + ProjectDetail. Show "no accessible projects" message when list is empty.
- [x] T017 [US1+US2] Create `examples/prisma-app/src/routes/tasks.tsx` — Hono route module: `POST /projects/:id/tasks` checks `engine.can(actor, "create_task", { type: "Project", id })`, creates task via Prisma, returns HTML fragment. `PUT /tasks/:taskId` checks `engine.can(actor, "update", { type: "Task", id })`, updates task, returns HTML fragment. `DELETE /tasks/:taskId` checks `engine.can(actor, "delete", { type: "Task", id })`, deletes task, returns empty. All mutations return 403 with error HTML fragment on authorization failure.

### Entry Point

- [x] T018 [US1+US2] Create `examples/prisma-app/src/index.tsx` — Hono app entry point: create app, apply user middleware, mount project routes, mount task routes. Add `GET /` redirect to `/projects`. Add `POST /switch-user` route that reads `userId` from form body, sets `currentUser` cookie (use `setCookie` from `hono/cookie`), returns `HX-Redirect: /projects` header. Start server on port 3000 via `@hono/node-server` `serve()`. Log startup URL.

**Checkpoint**: Full app functional — switching users changes visible projects/tasks, CRUD operations work for authorized users, unauthorized attempts show error messages.

---

## Phase 4: Polish & Learning Resource (US4)

**Purpose**: Make the code serve as a self-documenting learning resource. Also covers cross-cutting polish.

- [ ] T019 [P] [US4] Add integration-point comments to `examples/prisma-app/src/engine.ts` — explain policy loading pattern, resolver registration for each resource type, adapter creation purpose, and how the engine connects toride to Prisma.
- [ ] T020 [P] [US4] Add authorization-pattern comments to `examples/prisma-app/src/routes/projects.tsx` and `examples/prisma-app/src/routes/tasks.tsx` — annotate `buildConstraints` → `translateConstraints` flow, `can()` check pattern, `permittedActions` usage, and error handling approach at each key integration point.
- [ ] T021 Validate quickstart.md scenarios end-to-end: run setup commands, verify all 3 role-based filtering scenarios (Alice sees Alpha only, Bob sees Alpha+Beta, Charlie sees all non-archived), verify mutation scenarios (Bob creates/edits, Alice gets rejected), verify archived Project Gamma is hidden.

**Checkpoint**: A developer unfamiliar with toride can read engine.ts and route handlers and understand where/how authorization is configured without external docs. All quickstart scenarios pass.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Phase 1 completion — BLOCKS all user story work
- **US1+US2 (Phase 3)**: Depends on Phase 2 completion
- **Polish (Phase 4)**: Depends on Phase 3 completion (comments go on implemented files)

### Within Phase 3

- Components (T013, T014, T015) can be built in parallel — different files, no cross-dependencies
- Routes (T016, T017) depend on components being available for import
- Entry point (T018) depends on routes being available for mounting

### Parallel Opportunities

- Phase 1: T003 and T004 can run in parallel (after T001, T002)
- Phase 2: T006, T011, T012 can run in parallel (independent files). T008 depends on T007 (imports db). T009 depends on T007. T010 depends on T005.
- Phase 3: T013, T014, T015 can run in parallel. T016 and T017 can run in parallel (different route files). T018 depends on T016+T017.
- Phase 4: T019 and T020 can run in parallel.

---

## Parallel Example: Phase 3 (US1+US2)

```bash
# Launch all components in parallel:
Task T013: "Create ProjectList.tsx"
Task T014: "Create ProjectDetail.tsx"
Task T015: "Create TaskItem.tsx"

# Then launch routes in parallel:
Task T016: "Create routes/projects.tsx"
Task T017: "Create routes/tasks.tsx"

# Then entry point:
Task T018: "Create src/index.tsx"
```

---

## Implementation Strategy

### MVP First (Phase 1 + 2 + 3)

1. Complete Phase 1: Setup — project scaffolding
2. Complete Phase 2: Foundational — schema, engine, seed, middleware
3. Complete Phase 3: US1+US2 — full browse + CRUD functionality
4. **STOP and VALIDATE**: Run quickstart scenarios manually
5. App is fully functional at this point

### Full Delivery

1. Phases 1-3 → Functional app (MVP)
2. Phase 4 → Code comments for learning, final validation
3. Each phase adds value without breaking previous phases

---

## Notes

- [P] tasks = different files, no dependencies on incomplete tasks
- [US1+US2] = merged user stories for browse + CRUD
- [US4] = learning resource story
- No test tasks — spec designates manual verification only
- All paths relative to `examples/prisma-app/`
- Commit after each phase checkpoint
