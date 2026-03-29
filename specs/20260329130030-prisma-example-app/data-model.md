# Data Model: Prisma Example App

**Date**: 2026-03-29
**Storage**: SQLite via Prisma (`file:./prisma/dev.db`)

## Entities

### User

| Field | Type | Constraints | Description |
|-------|------|------------|-------------|
| id | String | PK, cuid() | Unique identifier |
| name | String | required | Display name |
| email | String | unique, required | Email address |
| department | String | required | Department name (used for attribute-based derived roles) |
| isSuperAdmin | Boolean | default: false | Global superadmin flag (triggers global_roles.superadmin) |

**Relations**:
- Has many RoleAssignment
- Has many Task (as assignee)

### Project

| Field | Type | Constraints | Description |
|-------|------|------------|-------------|
| id | String | PK, cuid() | Unique identifier |
| name | String | required | Project name |
| department | String | required | Department (matched against User.department for derived editor role) |
| status | String | default: "active" | Display status (active, completed) |
| archived | Boolean | default: false | When true, forbid rule blocks all permissions |

**Relations**:
- Has many Task
- Has many RoleAssignment

### Task

| Field | Type | Constraints | Description |
|-------|------|------------|-------------|
| id | String | PK, cuid() | Unique identifier |
| title | String | required | Task title |
| description | String? | optional | Task description |
| status | String | default: "todo" | Task status |
| projectId | String | FK → Project.id, cascade delete | Parent project |
| assigneeId | String? | FK → User.id, set null on delete | Assigned user (triggers assignee derived role) |

**Relations**:
- Belongs to Project (via projectId)
- Belongs to User as assignee (via assigneeId, optional)

**State transitions** (status): `todo` → `in_progress` → `done` (no enforcement in DB; UI provides select dropdown)

### RoleAssignment

| Field | Type | Constraints | Description |
|-------|------|------------|-------------|
| id | String | PK, cuid() | Unique identifier |
| userId | String | FK → User.id, cascade delete | User receiving the role |
| projectId | String | FK → Project.id, cascade delete | Project the role applies to |
| role | String | required | Role name (viewer, editor, admin) |

**Unique constraint**: `(userId, projectId, role)` — one assignment per user-project-role triple

**Relations**:
- Belongs to User (via userId)
- Belongs to Project (via projectId)

## Entity Relationship Diagram

```
┌──────────┐       ┌────────────────┐       ┌──────────┐
│   User   │──1:N──│ RoleAssignment │──N:1──│ Project  │
│          │       │                │       │          │
│ id       │       │ userId (FK)    │       │ id       │
│ name     │       │ projectId (FK) │       │ name     │
│ email    │       │ role           │       │ department│
│ department│       └────────────────┘       │ status   │
│ isSuperAdmin│                              │ archived │
└──────────┘                                └──────────┘
     │                                           │
     │ assignee (0:N)                    tasks (1:N)
     │                                           │
     └─────────────────┐   ┌─────────────────────┘
                       ▼   ▼
                    ┌──────────┐
                    │   Task   │
                    │          │
                    │ id       │
                    │ title    │
                    │ description│
                    │ status   │
                    │ projectId│
                    │ assigneeId│
                    └──────────┘
```

## Seed Data

| Entity | Records | Purpose |
|--------|---------|---------|
| User | 3 | Alice (design, viewer), Bob (engineering, editor), Charlie (ops, superadmin) |
| Project | 3 | Alpha (engineering, active), Beta (marketing, active), Gamma (engineering, archived) |
| RoleAssignment | 3 | Alice→Alpha:viewer, Bob→Alpha:editor, Bob→Beta:viewer |
| Task | 6 | 3 in Alpha, 2 in Beta, 1 in Gamma (for archived project testing) |

## Authorization Model Mapping

The Prisma data model maps to the toride policy as follows:

| Policy Concept | Data Source |
|---------------|-------------|
| Actor attributes (id, email, department, isSuperAdmin) | User table fields |
| Resource roles (viewer, editor, admin) | RoleAssignment table |
| Department-based derived role | User.department == Project.department |
| Superadmin global role | User.isSuperAdmin == true |
| Task→Project relation | Task.projectId FK |
| Task→assignee relation | Task.assigneeId FK |
| Archived forbid rule | Project.archived == true |
