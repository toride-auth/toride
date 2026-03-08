# Contract: publish.yml Workflow

## Trigger

```yaml
on:
  push:
    tags: ['v*']
```

## Inputs

- **Git tag**: The pushed tag (e.g., `v0.1.0`) — determines version
- **CHANGELOG.md**: Extracts the entry for the tagged version
- **NPM_TOKEN**: GitHub secret for npm authentication

## Behavior

1. Checkout code at the tagged commit
2. Setup pnpm + Node.js 20
3. Install dependencies (`pnpm install --frozen-lockfile`)
4. Build all packages (`pnpm exec nx run-many -t build`)
5. Publish each package to npm (`pnpm publish --filter <pkg> --no-git-checks --access public`)
6. Extract changelog entry for the tag version from CHANGELOG.md
7. Create GitHub Release with tag, title, and changelog body

## Outputs

- 4 packages published to npm (toride, @toride/codegen, @toride/drizzle, @toride/prisma)
- 1 GitHub Release created with changelog notes

## Error Handling

- If any package publish fails, the workflow fails (subsequent packages may not publish)
- If CHANGELOG.md entry extraction fails, GitHub Release is created with auto-generated notes as fallback

## Permissions

```yaml
permissions:
  contents: write  # For GitHub Release creation
```

## Secrets

- `NPM_TOKEN`: npm automation token with publish access to all 4 packages
