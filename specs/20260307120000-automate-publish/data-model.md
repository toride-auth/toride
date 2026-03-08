# Data Model: Automated npm Package Publishing

**Date**: 2026-03-07

This feature is a CI/CD workflow — there are no database entities or application data models. This document describes the workflow structure, inputs, and state transitions.

## Workflow Inputs

### Git Tag (trigger)

| Field | Type | Description |
|-------|------|-------------|
| `tag_name` | string | Full tag name (e.g., `v0.2.0`, `v1.0.0-beta.1`) |
| `tag_sha` | string | Git commit SHA the tag points to |

### Derived Values

| Field | Derived From | Example |
|-------|-------------|---------|
| `version` | Strip `v` prefix from `tag_name` | `0.2.0` |
| `is_prerelease` | Check if version contains `-` | `true` for `0.2.0-beta.1` |
| `dist_tag` | First segment before `.` in prerelease part; `latest` if stable | `beta` for `0.2.0-beta.1` |

## Workflow State Transitions

```text
Tag Pushed
  │
  ├─ Tag doesn't match v* pattern → IGNORED
  │
  ├─ Tag doesn't match semver → FAILED (validation error)
  │
  ├─ Stable release + commit not on main → FAILED (branch check)
  │
  ▼
Validate
  │
  ▼
Version Bump (nx release version)
  │
  ▼
CI Checks (lint, test, build)
  │
  ├─ Any check fails → FAILED (no publish)
  │
  ▼
Publish (nx release publish)
  │
  ├─ Any package fails → PARTIAL FAILURE (report which succeeded/failed)
  │
  ▼
GitHub Release
  │
  ▼
DONE
```

## Packages Published

| Package | npm Name | Publish Order | Scoped |
|---------|----------|---------------|--------|
| packages/toride | `toride` | 1 (first) | No |
| packages/codegen | `@toride/codegen` | 2 | Yes |
| packages/drizzle | `@toride/drizzle` | 3 | Yes |
| packages/prisma | `@toride/prisma` | 4 | Yes |

Publish order is determined by `nx release publish` which uses topological sort based on the dependency graph.

## GitHub Secrets Required

| Secret | Purpose |
|--------|---------|
| `NPM_TOKEN` | npm automation token for publishing |

Note: `GITHUB_TOKEN` is automatically provided by GitHub Actions with the permissions declared in the workflow.
