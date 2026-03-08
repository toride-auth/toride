# Quickstart: Release Conventions

## Making Commits

All commits must follow Conventional Commits format. Claude Code does this automatically via CLAUDE.md instructions. The Lefthook commit-msg hook enforces it as a safety net.

```bash
# Claude Code handles this automatically, but for reference:
feat(drizzle): add query constraint builder
fix: resolve policy parsing edge case
feat!: redesign RelationResolver interface
chore: update dependencies
```

## Releasing

1. Ensure you're on `main` with a clean working tree
2. Run the `/release` Claude Code command
3. Review the suggested version and changelog
4. If the version looks wrong, tell Claude to adjust (e.g., "make it a minor bump" or "make it a beta")
5. Approve the CHANGELOG.md update
6. Copy and run the git commands Claude provides:

```bash
git add CHANGELOG.md package.json packages/*/package.json
git commit -m "chore: release v0.1.0"
git tag v0.1.0
git push origin main v0.1.0
```

7. The `publish.yml` workflow automatically publishes to npm and creates a GitHub Release

## First Release

For the initial release, `/release` detects no previous tags and suggests `v0.1.0`. It classifies all existing commits (even non-conventional ones) using semantic analysis.

## Pre-releases

Tell Claude during the `/release` flow: "make it a beta" → `v0.2.0-beta.1`

## Troubleshooting

- **Commit rejected by hook**: Fix the commit message format. Run `pnpm exec commitlint --edit .git/COMMIT_EDITMSG` to see the specific error.
- **No unreleased changes**: The tool correctly reports nothing to release.
- **Wrong version suggested**: Override it conversationally during the `/release` flow.
