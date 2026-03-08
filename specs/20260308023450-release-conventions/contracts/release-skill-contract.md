# Contract: /release Skill

## Interface

**Type**: Claude Code slash command (`.claude/commands/release.md`)
**Invocation**: User types `/release` in Claude Code

## Input

The skill reads from the environment (no arguments):
- Git tags: `git tag --sort=-v:refname` to find the latest version tag
- Git log: `git log <last-tag>..HEAD --oneline` to get unreleased commits
- Working tree status: `git status --porcelain` to detect uncommitted changes
- Current branch: `git branch --show-current`
- Package.json files: root + 4 packages for current version
- CHANGELOG.md: existing content (if any) for prepending

## Output

The skill produces a conversational output with:

### 1. Pre-flight Checks
- Warn if uncommitted changes exist (FR-012)
- Warn if not on `main` branch
- Report "No unreleased changes found" if no commits since last tag (FR-011)

### 2. Commit Analysis
```
### Changes since v0.1.0 (12 commits)

**Features (minor)**
- Add batch authorization support (#18)
- Add constraint builder for drizzle (#15)

**Bug Fixes (patch)**
- Fix policy parser edge case (#16)

**Other**
- Update dependencies (#14)

**Recommended bump**: minor → v0.2.0
**Reasoning**: 2 feat commits detected, no breaking changes
```

### 3. Draft CHANGELOG.md Entry
The full entry in Keep a Changelog format, presented for review.

### 4. Git Commands
```bash
git add CHANGELOG.md package.json packages/*/package.json
git commit -m "chore: release v0.2.0"
git tag v0.2.0
git push origin main v0.2.0
```

## Behavior Rules

1. The skill MUST NOT execute `git tag` or `git push` — only output the commands (FR-004)
2. The skill MAY write CHANGELOG.md and update package.json files after maintainer approval (FR-004, FR-010)
3. The skill MUST allow version override via conversation (FR-005, FR-013)
4. Non-conventional commits MUST be classified semantically with a confidence warning (spec acceptance scenario 5)
5. Breaking changes (`!` suffix or `BREAKING CHANGE` footer) MUST result in major bump recommendation (FR-002)
6. When no previous tag exists, suggest `v0.1.0` as initial version
