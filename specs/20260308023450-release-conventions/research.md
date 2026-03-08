# Research: Release Conventions & AI-Assisted Release Prep

## Decision 1: /release Command Implementation

**Decision**: Implement as a Claude Code slash command skill at `.claude/commands/release.md`

**Rationale**: Claude Code skills are markdown prompt files that execute as slash commands. No build step, no runtime dependencies — just a prompt file that instructs Claude to analyze commits, determine version bumps, and generate changelog entries. This aligns with the project's zero-infrastructure philosophy.

**Alternatives considered**:
- **Custom CLI tool (TypeScript)**: Would require building, testing, and maintaining a separate tool. Overkill for a single-maintainer project where Claude Code is already the primary development interface.
- **Shell script**: Fragile for commit message parsing and changelog generation. No semantic understanding of commit messages.
- **Existing tools (standard-version, semantic-release)**: These are fully automated and opinionated. The spec explicitly requires human-in-the-loop (AI suggests, human executes). These tools would bypass maintainer judgment.

## Decision 2: Version Source of Truth

**Decision**: Root `package.json` (`"version"` field) is the single source of truth. The `/release` command updates all 5 package.json files (root + 4 packages) in the release commit.

**Rationale**: Lockstep versioning means one version number. Root package.json already has a `"version": "0.0.0"` field. Updating all files in the release commit ensures git state always matches published state.

**Alternatives considered**:
- **Git tags only**: Would require CI to manipulate package.json at publish time, adding complexity and creating drift between repo and npm.
- **Core package as source**: Arbitrary choice — root is more natural for a monorepo.

## Decision 3: Conventional Commits Enforcement

**Decision**: Use Lefthook + commitlint (@commitlint/cli + @commitlint/config-conventional)

**Rationale**:
- **Lefthook**: Go binary, fast, YAML config, auto-installs hooks on `pnpm install` via `postinstall` script. Monorepo-friendly (single config at root). No Node.js overhead for hook management.
- **commitlint**: Industry standard for Conventional Commits validation. Handles all edge cases (multi-line footers, BREAKING CHANGE, scopes). Well-maintained.

**Configuration**:

```yaml
# lefthook.yml
commit-msg:
  commands:
    commitlint:
      run: pnpm exec commitlint --edit {1}
```

```js
// commitlint.config.js
export default { extends: ['@commitlint/config-conventional'] };
```

**DevDependencies to add**:
- `lefthook` (Go binary, installed via npm wrapper)
- `@commitlint/cli`
- `@commitlint/config-conventional`

**Auto-install**: Add `"postinstall": "lefthook install"` to root package.json scripts.

**Alternatives considered**:
- **Regex in shell**: Too fragile for edge cases (multi-line footers, breaking change markers).
- **Custom Node script**: More maintenance burden with no benefit over commitlint.
- **Husky**: Requires `.husky/` directory with shell scripts. Lefthook is simpler (single YAML file) and faster (Go binary).

## Decision 4: Changelog Format

**Decision**: Keep a Changelog format (https://keepachangelog.com/) with PR links parsed from squash-merge commit messages.

**Rationale**: Keep a Changelog is a well-known convention. Squash-merged commits from GitHub automatically include PR numbers (e.g., `feat: add batch authorization (#18)`), which the `/release` skill can parse and link.

**Format example**:
```markdown
## [0.2.0] - 2026-03-08

### Added
- Batch authorization support ([#18](https://github.com/toride-auth/toride/pull/18))

### Fixed
- Query builder edge case in drizzle adapter ([#16](https://github.com/toride-auth/toride/pull/16))
```

## Decision 5: Publish Workflow

**Decision**: New `.github/workflows/publish.yml` triggered on tag push (`v*`), publishes all 4 packages and creates GitHub Release with CHANGELOG.md content.

**Rationale**: No publish workflow exists yet. Tag-triggered publishing is the standard pattern for npm packages. GitHub Releases provide discoverability while CHANGELOG.md provides permanence.

**Workflow outline**:
1. Trigger: `push: tags: ['v*']`
2. Checkout, setup pnpm + Node.js 20
3. `pnpm install --frozen-lockfile`
4. Build all packages: `pnpm exec nx run-many -t build`
5. Extract version from tag, extract changelog entry for that version
6. Publish each package: `pnpm publish --filter <pkg> --no-git-checks --access public`
7. Create GitHub Release: `gh release create $TAG --title "$TAG" --notes "$CHANGELOG_ENTRY"`

**Permissions**: `contents: write` (for GitHub Release creation), `id-token: write` (for npm provenance, optional).

**Alternatives considered**:
- **Nx release**: Nx has built-in release tooling, but it's opinionated about the full workflow. We want the AI-assisted human-in-the-loop approach.
- **changesets**: Designed for multi-contributor workflows with PR-based changelogs. Overkill for single-maintainer lockstep versioning.

## Decision 6: CLAUDE.md Conventional Commits Instructions

**Decision**: Add Conventional Commits instructions to CLAUDE.md so Claude Code automatically formats all commit messages correctly.

**Rationale**: This is the primary enforcement mechanism (FR-007). The git hook (commitlint) is a safety net. CLAUDE.md instructions ensure Claude Code generates correct messages without the maintainer needing to remember the convention.

**Content to add**: Commit message format rules, allowed types with descriptions, scope conventions (package names), breaking change syntax.
