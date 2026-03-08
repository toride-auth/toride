# Data Model: Release Conventions

This feature has no persistent data model (no database, no runtime entities). The "data" consists of:

## File Artifacts

### 1. CHANGELOG.md (repository root)

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/)

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-03-08

### Added
- Feature description ([#PR](https://github.com/toride-auth/toride/pull/PR))

### Changed
- Change description ([#PR](URL))

### Fixed
- Fix description ([#PR](URL))

### Removed
- Removal description ([#PR](URL))

## [0.1.0] - 2026-03-01

### Added
- Initial release
```

**Rules**:
- New entries are prepended below `## [Unreleased]`
- Sections (Added, Changed, Fixed, Removed) only appear when they have content
- Each entry includes a PR link when available
- Date format: YYYY-MM-DD

### 2. Version Fields (5 files)

All must stay in sync (lockstep versioning):

| File | Field | Example |
|------|-------|---------|
| `package.json` (root) | `"version"` | `"0.1.0"` |
| `packages/toride/package.json` | `"version"` | `"0.1.0"` |
| `packages/codegen/package.json` | `"version"` | `"0.1.0"` |
| `packages/drizzle/package.json` | `"version"` | `"0.1.0"` |
| `packages/prisma/package.json` | `"version"` | `"0.1.0"` |

### 3. Git Tags

Format: `v{MAJOR}.{MINOR}.{PATCH}` (e.g., `v0.1.0`, `v1.0.0`)

Pre-release format: `v{MAJOR}.{MINOR}.{PATCH}-{PRERELEASE}` (e.g., `v0.2.0-beta.1`)

## Conventional Commits Schema

```
type(scope): description

[optional body]

[optional footer(s)]
```

**Types**: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`, `build`

**Scopes** (optional): `toride`, `codegen`, `drizzle`, `prisma`

**Breaking changes**: `type!: description` or `BREAKING CHANGE:` footer

**Version bump mapping**:
| Commit Pattern | Bump |
|---------------|------|
| `fix:`, `perf:`, `refactor:`, `docs:`, `chore:`, `ci:`, `build:`, `test:` | patch |
| `feat:` | minor |
| `type!:` or `BREAKING CHANGE:` footer | major |
| Highest-impact wins across all commits | — |

## State Transitions

```
Commits accumulated on main
  ↓
Maintainer runs /release
  ↓
AI analyzes commits, suggests version + changelog
  ↓
Maintainer reviews/adjusts
  ↓
AI writes CHANGELOG.md + updates package.json versions
  ↓
Maintainer runs git commands (commit, tag, push)
  ↓
publish.yml triggers → npm publish + GitHub Release
```
