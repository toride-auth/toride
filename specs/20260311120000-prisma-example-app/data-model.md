# Data Model: Prisma Example App

## Entity Relationship Diagram

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────┐
│     User     │     │  RoleAssignment   │     │   Project    │
├──────────────┤     ├──────────────────┤     ├──────────────┤
│ id       PK  │◄────│ userId       FK  │     │ id       PK  │
│ name         │     │ projectId    FK  │────►│ name         │
│ email        │     │ role             │     │ department   │
│ department   │     │                  │     │ status       │
│ isSuperAdmin │     └──────────────────┘     │ archived     │
└──────────────┘                               └──────────────┘
       │                                              │
       │ assignee                              project │
       ▼                                              ▼
┌──────────────┐
│     Task     │
├──────────────┤
│ id       PK  │
│ title        │
│ description  │
│ status       │
│ projectId FK │
│ assigneeId FK│
└──────────────┘
```

## Entities

### User

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | String | PK, cuid | Auto-generated |
| name | String | required | Display name (e.g., "Alice") |
| email | String | required, unique | Used for display |
| department | String | required | Drives department-based role derivation |
| isSuperAdmin | Boolean | default: false | Drives global superadmin role |

**Relations**: Has many RoleAssignment, has many Task (as assignee)

### Project

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | String | PK, cuid | Auto-generated |
| name | String | required | Project display name |
| department | String | required | Matched against actor.department for derived editor role |
| status | String | required, default: "active" | "active" or "completed" |
| archived | Boolean | default: false | Forbid rule hides archived projects from all users |

**Relations**: Has many Task, has many RoleAssignment

**Policy mapping**:
- `$resource.department` → department field
- `$resource.archived` → archived field (forbid rule)

### Task

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | String | PK, cuid | Auto-generated |
| title | String | required | Task display name |
| description | String | optional | Task details |
| status | String | required, default: "todo" | "todo", "in_progress", "done" |
| projectId | String | FK → Project.id, required | Parent project relation |
| assigneeId | String | FK → User.id, optional | Assigned user (drives derived editor role) |

**Relations**: Belongs to Project (cascade delete), belongs to User (optional, set null on delete)

**Policy mapping**:
- `project` relation → `{ type: "Project", id: task.projectId }`
- `assignee` relation → `{ type: "User", id: task.assigneeId }`
- `resource.project.status` → resolved via project relation for forbid rule

### RoleAssignment

| Field | Type | Constraints | Notes |
|-------|------|-------------|-------|
| id | String | PK, cuid | Auto-generated |
| userId | String | FK → User.id, required | The actor |
| projectId | String | FK → Project.id, required | The resource |
| role | String | required | "viewer", "editor", or "admin" |

**Constraints**: Unique composite index on (userId, projectId, role)

**Relations**: Belongs to User, belongs to Project

**Policy mapping**: Used by `createPrismaAdapter().hasRole()` to generate `{ roleAssignments: { some: { userId, role } } }`

## Seed Data

### Users

| Name | Email | Department | isSuperAdmin | Purpose |
|------|-------|-----------|-------------|---------|
| Alice | alice@example.com | engineering | false | Viewer on Project Alpha, no roles on others |
| Bob | bob@example.com | engineering | false | Editor on Project Alpha, viewer on Project Beta |
| Charlie | charlie@example.com | ops | true | Superadmin — demonstrates global role derivation |

### Projects

| Name | Department | Status | Archived | Purpose |
|------|-----------|--------|----------|---------|
| Project Alpha | engineering | active | false | Main project with multiple role assignments |
| Project Beta | marketing | active | false | Different department — shows department-based filtering |
| Project Gamma | engineering | completed | true | Archived — demonstrates forbid rule hiding |

### Role Assignments

| User | Project | Role | Purpose |
|------|---------|------|---------|
| Alice | Project Alpha | viewer | Can read but not edit |
| Bob | Project Alpha | editor | Can read, edit, create tasks |
| Bob | Project Beta | viewer | Cross-project access |

Note: Charlie gets admin on all projects via global `superadmin` role derivation — no direct role assignments needed.

### Tasks

| Title | Project | Assignee | Status | Purpose |
|-------|---------|----------|--------|---------|
| Set up CI pipeline | Alpha | Bob | todo | Standard editable task |
| Write documentation | Alpha | Alice | in_progress | Assignee-based editor derivation for Alice |
| Design system architecture | Alpha | — | done | Done task in active project |
| Create marketing plan | Beta | — | todo | Task in different project |
| Review Q3 budget | Beta | Bob | in_progress | Bob as assignee on Beta |
| Legacy cleanup | Gamma | Bob | todo | Task in archived project — forbid applies |

## State Transitions

### Project Status
- `active` → `completed` (no reverse in this example)
- `archived` flag is independent of status

### Task Status
- `todo` → `in_progress` → `done`
- Status is editable by authorized users (editor/admin on parent project)

## Validation Rules

- Task title: required, non-empty string
- Task status: must be one of "todo", "in_progress", "done"
- Project name: required, non-empty string
- Role: must be one of "viewer", "editor", "admin"
- RoleAssignment: unique per (userId, projectId, role)
