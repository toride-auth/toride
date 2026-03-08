# Feature Specification: Release Conventions & AI-Assisted Release Prep

**Feature Branch**: `release-conventions`
**Created**: 2026-03-08
**Status**: Draft
**Input**: User description: "Improve release process with conventions, best practices, and AI assistance for version decisions and changelogs"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - AI-Assisted Release Preparation (Priority: P1)

As a maintainer, I want to run a Claude Code slash command (e.g., `/release`) that analyzes all commits since the last release, determines the appropriate semver bump (patch/minor/major), generates a human-readable changelog entry, and outputs the exact git commands I need to run — so that I can release confidently without memorizing conventions or manually reading commit history.

**Why this priority**: This is the core value proposition — removing cognitive load from the release decision. The maintainer retains full control (AI suggests, human executes), while AI handles the tedious analysis.

**Independent Test**: Can be tested by running the command after making several commits. Verify it correctly identifies the bump type, produces a readable changelog, and outputs copy-pasteable git commands.

**Acceptance Scenarios**:

1. **Given** several commits exist since the last tag (e.g., `v0.1.0`), **When** the maintainer runs the `/release` command, **Then** the tool analyzes commit messages, determines the correct version bump based on Conventional Commits semantics (`fix:` → patch, `feat:` → minor, `feat!:` or `BREAKING CHANGE` → major), and displays the recommended new version.
2. **Given** the tool has determined the new version, **When** it presents its output, **Then** it includes: (a) a summary of changes grouped by type (Features, Bug Fixes, Breaking Changes, Other), (b) the recommended version with reasoning, (c) a draft CHANGELOG.md entry, and (d) the exact git commands to run: first commit the updated CHANGELOG.md (`git add CHANGELOG.md && git commit -m "chore: release v0.2.0"`), then tag that commit (`git tag v0.2.0`), then push both (`git push origin main v0.2.0`).
3. **Given** the maintainer runs the command, **When** no commits exist since the last tag, **Then** it reports "No unreleased changes found" and does not suggest a release.
4. **Given** the maintainer disagrees with the suggested version, **When** they provide a different version, **Then** the tool adjusts the changelog entry and git commands accordingly.
5. **Given** commits exist but none follow Conventional Commits format (e.g., legacy commits before convention adoption), **When** the tool runs, **Then** it semantically classifies each commit as feat/fix/chore/etc. based on message content, produces a best-effort changelog, but warns that the version bump confidence is lower and recommends the maintainer verify.

---

### User Story 2 - Conventional Commits Enforcement (Priority: P2)

As a maintainer, I want all commits in this project to follow Conventional Commits format, enforced through Claude Code instructions and optional git hooks, so that automated version bumping and changelog generation are reliable.

**Why this priority**: The AI release tool (US1) works best with structured commit messages. Enforcing conventions makes the release process predictable and the changelog meaningful.

**Independent Test**: Can be tested by making commits through Claude Code and verifying they use Conventional Commits format. Can also test the git hook by attempting a non-conforming commit.

**Acceptance Scenarios**:

1. **Given** Claude Code is used to create commits in this project, **When** it generates a commit message, **Then** the message follows Conventional Commits format: `type(scope): description` where type is one of `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `perf`, `ci`, `build`.
2. **Given** a breaking change is being committed, **When** Claude Code generates the commit message, **Then** it uses `type!: description` or includes a `BREAKING CHANGE:` footer.
3. **Given** a scope is relevant (e.g., a change only affects `@toride/drizzle`), **When** Claude Code generates the commit message, **Then** it includes the scope: `fix(drizzle): resolve query builder issue`.
4. **Given** Lefthook is installed (auto-installed on `pnpm install`), **When** a developer attempts to commit with a non-conventional message, **Then** the commit-msg hook rejects it with a helpful error message showing the expected format.

---

### User Story 3 - Changelog Maintenance (Priority: P3)

As a maintainer, I want a CHANGELOG.md file in the repository that is automatically updated as part of the release preparation, so that users and contributors can see the history of changes without visiting GitHub.

**Why this priority**: A CHANGELOG.md is a best practice for open-source libraries — it's the source of truth for what changed. GitHub Release notes provide discoverability, while the file provides permanence.

**Independent Test**: Can be tested by running the release command and verifying the CHANGELOG.md is created/updated with the correct content and format.

**Acceptance Scenarios**:

1. **Given** a release is being prepared, **When** the AI generates the changelog entry, **Then** it creates or prepends to `CHANGELOG.md` in [Keep a Changelog](https://keepachangelog.com/) format with sections: Added, Changed, Fixed, Removed (as applicable).
2. **Given** the CHANGELOG.md already has previous entries, **When** a new release is prepared, **Then** the new entry is prepended below the header, preserving all previous entries.
3. **Given** the maintainer reviews the AI-generated changelog entry, **When** they want to edit it, **Then** the AI presents the entry for review before writing to the file, and the maintainer can request modifications.
4. **Given** a release is published, **When** the GitHub Actions workflow creates a GitHub Release, **Then** the release notes match the content from CHANGELOG.md for that version.

---

### Edge Cases

- What happens when the first release has no previous tag? The tool assumes this is the initial release, uses `v0.1.0` as the suggested version (unless overridden), and creates a fresh CHANGELOG.md.
- What happens when commits include both `feat!:` and `feat:` changes? The major bump takes precedence (`feat!:` → major).
- What happens when the current branch is not `main`? The tool warns the maintainer that stable releases should be tagged on `main`, but still allows pre-release tagging from any branch.
- What happens when CHANGELOG.md has been manually edited and has merge conflicts? The tool detects the conflict markers and asks the maintainer to resolve them before proceeding.
- What happens when the maintainer runs `/release` while uncommitted changes exist? The tool warns about uncommitted changes and asks the maintainer to commit or stash before proceeding.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The `/release` command MUST analyze all commits between the latest tag and HEAD using Conventional Commits semantics to determine the version bump type. Commits are expected to be squash-merged (one commit per PR), so each commit message represents a single logical change.
- **FR-002**: The version bump MUST follow semver rules: `fix:` → patch, `feat:` → minor, `feat!:` or `BREAKING CHANGE` footer → major. The highest-impact change wins.
- **FR-003**: The `/release` command MUST output a grouped changelog (Features, Bug Fixes, Breaking Changes, Other) with human-readable descriptions derived from commit messages.
- **FR-004**: The `/release` command MUST output the exact git commands the maintainer should run (commit CHANGELOG.md, create tag, push both), and MUST NOT execute git tag or git push commands itself. The tool MAY write the CHANGELOG.md file directly (with maintainer review), but tagging and pushing are always manual.
- **FR-005**: The `/release` command MUST allow the maintainer to override the suggested version before generating final output.
- **FR-006**: All 4 packages MUST use lockstep versioning — a single version number shared across toride, @toride/codegen, @toride/drizzle, and @toride/prisma.
- **FR-007**: Claude Code MUST follow Conventional Commits format for all commits in this project, enforced via CLAUDE.md instructions.
- **FR-008**: The project MUST provide a commit-msg git hook (managed via Lefthook) that validates Conventional Commits format. Hooks auto-install on `pnpm install`.
- **FR-009**: The `/release` command MUST create or update a CHANGELOG.md file in Keep a Changelog format.
- **FR-010**: The CHANGELOG.md entry MUST be presented to the maintainer for review before being written to the file.
- **FR-011**: The `/release` command MUST detect when no unreleased changes exist and report accordingly without suggesting a release.
- **FR-012**: The `/release` command MUST warn when uncommitted changes exist in the working tree.
- **FR-013**: The `/release` command MUST support pre-release version suggestions (e.g., `v0.2.0-beta.1`) via conversational override — the tool suggests a stable version first, and the maintainer can request a pre-release in natural language (e.g., "make it a beta").
- **FR-014**: The GitHub Actions publish workflow MUST use the CHANGELOG.md content for the corresponding version as GitHub Release notes (instead of or in addition to auto-generated notes).

## Clarifications

### Session 2026-03-08

- Q: How are PRs merged (squash, regular merge, or direct push)? → A: Squash merge (one commit per PR). The `/release` command analyzes squash-merged commit messages for changelog generation.
- Q: How should legacy (non-conventional) commits be handled for the first release? → A: AI classifies them semantically (best-effort), categorizing each as feat/fix/chore etc. based on message content.
- Q: Should CHANGELOG.md be committed before or after tagging? → A: Commit CHANGELOG.md first, then tag that commit. The git commands output: (1) commit updated CHANGELOG.md, (2) tag that commit, (3) push both.
- Q: How should the commit-msg git hook be installed? → A: Use Lefthook (Go binary, YAML config, auto-installs on `pnpm install`, monorepo-friendly).
- Q: How should pre-release versions be requested? → A: Conversationally — the tool suggests a stable version first, and the maintainer can ask to make it a pre-release in natural language.

## Assumptions

- The existing `publish.yml` workflow (tag-triggered) remains the mechanism for actually publishing to npm. This feature adds the **preparation** layer on top.
- The maintainer is the primary (and currently only) contributor. Multi-contributor workflows (PR-based changelogs, etc.) are not in scope.
- Lockstep versioning is permanent for this project — all packages are tightly coupled and always released together.
- The first release version will be `0.1.0` unless the maintainer chooses otherwise.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A maintainer can go from "I have unreleased commits" to "packages are publishing" in under 2 minutes, with a single command followed by copying 2 git commands.
- **SC-002**: 100% of commits made through Claude Code follow Conventional Commits format without the maintainer needing to remember the convention.
- **SC-003**: Every release has a corresponding CHANGELOG.md entry that accurately reflects the changes, without the maintainer writing it from scratch.
- **SC-004**: The suggested version bump is correct (matches Conventional Commits semantics) for at least 95% of releases.
- **SC-005**: A new contributor can understand the release process by reading the CHANGELOG.md and repository documentation, without needing to ask the maintainer.
