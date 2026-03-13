# /release — AI-Assisted Release Preparation

You are preparing a release for the toride monorepo. Follow these phases sequentially. Do NOT skip phases.

This is a lockstep-versioned monorepo with 5 package.json files that all share the same version:
- `package.json` (root)
- `packages/toride/package.json`
- `packages/codegen/package.json`
- `packages/drizzle/package.json`
- `packages/prisma/package.json`

---

## Phase 1: Pre-flight Checks

Run these commands and analyze the results:

1. **Uncommitted changes**: Run `git status --porcelain`
   - If output is non-empty, WARN the user: "You have uncommitted changes. Please commit or stash them before releasing." List the changed files. Ask whether they want to continue or abort. Wait for their response before proceeding.

2. **Branch check**: Run `git branch --show-current`
   - If not on `main`, WARN: "You are on branch `<name>`, not `main`. Releases are typically done from `main`." Allow them to continue if they choose to.

3. **Find latest version tag**: Run `git tag --sort=-v:refname` and find the most recent tag matching the `v*` pattern (e.g., `v0.1.0`, `v1.2.3`).
   - If no `v*` tag exists, note this — it means this is the first release. Set `<last-tag>` to empty (you will use `git log --format=...` with no range to get all commits) and proceed to Phase 2.

4. **Check for unreleased commits**: If a tag was found, run `git log <last-tag>..HEAD --oneline`
   - If there are no commits since the last tag, report: "No unreleased changes found since `<last-tag>`. Nothing to release." Then STOP — do not continue to further phases.

---

## Phase 2: Commit Analysis

### Gather commits

Run both of these commands to get commit data:

```bash
git log <last-tag>..HEAD --format="%H %s"
git log <last-tag>..HEAD --format="%H%n%s%n%b---END---"
```

If there is no previous tag (first release), omit the `<last-tag>..` range to get all commits.

### Parse each commit

For each commit, parse the subject line using Conventional Commits format: `<type>[optional scope][optional !]: <description>`

**Version impact rules:**
| Pattern | Bump |
|---------|------|
| `feat!:` or `feat(scope)!:` | **major** |
| Any type with `BREAKING CHANGE:` or `BREAKING-CHANGE:` in the commit body footer | **major** |
| `feat:` or `feat(scope):` | **minor** |
| `fix:`, `perf:`, `refactor:`, `docs:`, `test:`, `chore:`, `ci:`, `build:` (with or without scope) | **patch** |

**Non-conventional commits**: If a commit does not match Conventional Commits format, classify it semantically based on its message content. Add a confidence warning: "(non-conventional commit — classified by content, review recommended)". Group it into the most appropriate category.

### Group commits into changelog categories

- **Added** — `feat` commits
- **Changed** — `refactor`, `perf` commits
- **Fixed** — `fix` commits
- **Removed** — commits that clearly remove functionality (rare, usually from body/description analysis)
- **Other** — `docs`, `test`, `chore`, `ci`, `build` commits and any that don't fit above categories

Breaking changes: Any commit with `!` suffix or `BREAKING CHANGE` footer MUST be called out prominently within its category with a "**BREAKING**:" prefix.

### Determine recommended version bump

- If ANY commit triggers major → recommend **major** bump
- Else if ANY commit triggers minor → recommend **minor** bump
- Else → recommend **patch** bump
- The highest impact wins

If no previous tag exists, suggest **v0.1.0** as the initial version regardless of commit analysis.

---

## Phase 3: Present Results

Display the analysis to the maintainer in this format:

```
### Changes since <last-tag> (<N> commits)

**Features (minor)**
- <description> (<short-hash>)

**Bug Fixes (patch)**
- <description> (<short-hash>)

**Performance (patch)**
- <description> (<short-hash>)

**Refactoring (patch)**
- <description> (<short-hash>)

**Other**
- <description> (<short-hash>)

**Recommended bump**: <patch|minor|major> → v<X.Y.Z>
**Reasoning**: <brief explanation of why this bump level was chosen>
```

Only include non-empty groups. If there are non-conventional commits, add a note at the bottom:
```
⚠ Note: <N> commit(s) did not follow Conventional Commits format and were classified semantically. Please review their categorization.
```

Then present a **draft CHANGELOG.md entry** in Keep a Changelog format:

```markdown
## [X.Y.Z] - YYYY-MM-DD

### Added
- Description of feat commit

### Changed
- Description of refactor/perf commit

### Fixed
- Description of fix commit

### Removed
- Description of removal (if any)
```

Rules for the changelog entry:
- Use today's date in YYYY-MM-DD format
- Only include sections that have entries (omit empty sections like Removed if there are none)
- Breaking changes MUST get a prominent callout within their section, e.g.: "- **BREAKING**: description"
- Do NOT include the "Other" category (docs, test, chore, ci, build) in the CHANGELOG entry — these are internal changes
- Write human-readable descriptions, not raw commit messages. Clean up and clarify if needed.

---

## Phase 4: Maintainer Review & Approval

Present the recommended version and ask:

> The recommended version is **vX.Y.Z**. Would you like to:
> 1. Accept this version
> 2. Override with a different version (e.g., v1.0.0, v0.2.0-beta.1)
>
> You can specify any valid semver version, including pre-release versions.

Wait for their response. If they provide an override, use that version instead.

Then present the changelog entry and ask:

> Here is the draft CHANGELOG entry. Would you like to:
> 1. Approve as-is
> 2. Request modifications (describe what to change)

Wait for their response. If they request changes, make the modifications and re-present for approval.

**MUST get explicit approval before proceeding to Phase 5.** Do NOT write any files until the maintainer confirms.

---

## Phase 5: File Updates

ONLY proceed here after explicit maintainer approval from Phase 4.

### Update package.json files

For each of these 5 files:
- `package.json`
- `packages/toride/package.json`
- `packages/codegen/package.json`
- `packages/drizzle/package.json`
- `packages/prisma/package.json`

Read the file, update the `"version"` field to the approved version (without the `v` prefix — e.g., if version is `v0.2.0`, write `"version": "0.2.0"`), and write it back. Do NOT alter any other fields.

### Update CHANGELOG.md

- If `CHANGELOG.md` exists, read it first. Check for git conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`). If conflict markers are found, WARN the user and ask how to proceed.
- If `CHANGELOG.md` exists, prepend the new entry after the top-level heading (e.g., after `# Changelog`). Preserve all existing entries.
- If `CHANGELOG.md` does not exist, create it with this structure:

```markdown
# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [X.Y.Z] - YYYY-MM-DD

### Added
...
```

---

## Phase 6: Git Commands Output

After file updates are complete, output the exact commands the maintainer should run. Do NOT execute `git tag`, `git push`, or `gh pr create` yourself.

The release uses a **branch + PR flow** to avoid pushing directly to `main` (which is typically protected).

```bash
git checkout -b release/vX.Y.Z
git add CHANGELOG.md package.json packages/*/package.json
git commit -m "chore: release vX.Y.Z"
git push -u origin release/vX.Y.Z
gh pr create --title "chore: release vX.Y.Z" --body "Release vX.Y.Z — see CHANGELOG.md for details."
```

After the PR is merged to `main`, tag the release from `main`:

```bash
git checkout main
git pull origin main
git tag vX.Y.Z
git push origin vX.Y.Z
```

Replace `X.Y.Z` with the actual approved version.

Tell the maintainer: "Copy and run these commands to finalize the release. After the PR is merged, the tag push will trigger the publish workflow (once configured)."

---

## Critical Rules — MUST follow these at all times

1. **MUST NOT execute `git tag` or `git push`** — only output these commands for the maintainer to run
2. **MAY write CHANGELOG.md and update package.json files** — but ONLY after explicit maintainer approval in Phase 4
3. **MUST allow version override** — the maintainer can choose any valid semver version including pre-release
4. **MUST support pre-release versions** — e.g., `v0.2.0-beta.1`, `v1.0.0-rc.1`
5. **Non-conventional commits MUST be classified semantically** with a confidence warning
6. **Breaking changes MUST result in major bump** — whether from `!` suffix or `BREAKING CHANGE` footer
7. **When no previous tag exists**, suggest `v0.1.0` as the initial version
8. **Keep a Changelog format** — sections: Added, Changed, Fixed, Removed (only include non-empty sections)
9. **Lockstep versioning** — all 5 package.json files MUST have the same version
10. **NEVER skip the approval step** — Phase 5 requires explicit "yes" from the maintainer
