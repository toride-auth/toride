# Quickstart: Automated npm Package Publishing

## Prerequisites

1. **npm account** with publish access to `toride`, `@toride/codegen`, `@toride/drizzle`, `@toride/prisma`
2. **npm automation token** (granular token with publish scope) stored as GitHub repository secret `NPM_TOKEN`
3. All CI checks passing on the commit you want to release

## Publishing a Stable Release

```bash
# Ensure you're on main with latest changes
git checkout main
git pull

# Create and push a semver tag
git tag v0.1.0
git push origin v0.1.0
```

The workflow will:
1. Validate the tag is semver and the commit is on `main`
2. Set all package versions to `0.1.0`
3. Run lint, test, build across all packages
4. Publish all 4 packages to npm with the `latest` dist-tag
5. Create a GitHub Release with auto-generated notes

## Publishing a Pre-release

```bash
# Can be from any branch
git tag v0.2.0-beta.1
git push origin v0.2.0-beta.1
```

The workflow will publish with dist-tag `beta` (derived from the pre-release identifier). `npm install toride` will still resolve to the latest stable version.

## Monitoring

- Watch the workflow run in the **Actions** tab of the GitHub repository
- On success, verify packages on npm: `npm view toride versions --json`
- Check the GitHub Releases page for the auto-generated release

## First Release

For the very first publish, the workflow uses `nx release` with `--first-release` flag to handle the case where no prior versions exist on npm.

## Troubleshooting

| Issue | Cause | Fix |
|-------|-------|-----|
| "NPM_TOKEN not set" | Missing repository secret | Add `NPM_TOKEN` in GitHub repo Settings > Secrets |
| "Tag does not point to main" | Stable tag on feature branch | Merge to main first, then tag |
| "Version already exists" | Package version conflict on npm | Use a different version tag |
| Partial publish failure | Network issue during publish | Manually publish remaining packages or re-tag |
