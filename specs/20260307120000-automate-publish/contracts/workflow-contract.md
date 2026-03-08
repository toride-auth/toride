# Workflow Contract: publish.yml

**Date**: 2026-03-07

## Trigger

```yaml
on:
  push:
    tags: ['v*']
```

Only git tags matching `v*` pattern trigger the workflow. All other events are ignored.

## Tag Format

| Format | Example | Behavior |
|--------|---------|----------|
| `vMAJOR.MINOR.PATCH` | `v0.2.0` | Stable release → dist-tag `latest` |
| `vMAJOR.MINOR.PATCH-PRERELEASE` | `v0.3.0-beta.1` | Pre-release → dist-tag derived from prerelease identifier |
| Non-semver `v*` | `v-foo`, `vtest` | Rejected with validation error |
| Non-`v` tags | `release-1.0` | Ignored (doesn't match trigger) |

## Dist-Tag Derivation

For pre-release tags, the npm dist-tag is the first segment before the first `.` in the prerelease part:

```
v1.0.0-beta.1     → beta
v1.0.0-rc.1       → rc
v1.0.0-alpha.2.3  → alpha
v2.0.0-next.0     → next
```

## Permissions Required

```yaml
permissions:
  contents: write    # Create GitHub Release
  id-token: write    # npm provenance attestation
  actions: read      # Nx set-shas (if needed)
```

## Secrets Required

| Secret | Required | Purpose |
|--------|----------|---------|
| `NPM_TOKEN` | Yes | npm automation token for publishing |

## Concurrency

```yaml
concurrency:
  group: publish
  cancel-in-progress: true
```

Only one publish workflow runs at a time. If a new tag is pushed while a previous publish is running, the previous run is cancelled.

## Job Steps (sequential)

1. **Validate tag** — Confirm tag matches semver format
2. **Branch check** (stable only) — Verify tagged commit is on `main`
3. **Setup** — Checkout, pnpm, Node.js 20, install dependencies
4. **Version** — `nx release version $VERSION` (updates all package.json files)
5. **CI checks** — `nx run-many -t lint test build` (all packages)
6. **Publish** — `nx release publish` with `--tag $DIST_TAG` and `--provenance --access public`
7. **GitHub Release** — Create release with auto-generated notes; mark as pre-release if applicable

## Failure Behavior

| Failure Point | Packages Published | Recovery |
|---------------|-------------------|----------|
| Validation | None | Fix tag format, re-tag |
| Branch check | None | Merge to main, re-tag |
| CI checks (lint/test/build) | None | Fix code, re-tag |
| Publish (partial) | Some | Manual publish remaining or re-tag |
| GitHub Release | All | Manually create release |

## Outputs

On success:
- All 4 packages published to npm at the specified version
- GitHub Release created with auto-generated notes
- npm provenance attestations generated for each package
