# Contract: CI Workflow

GitHub Actions workflow at `.github/workflows/ci.yml`.

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:

jobs:
  ci:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
          filter: tree:0

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - uses: nrwl/nx-set-shas@v4

      - run: pnpm exec nx affected -t lint test build
```

## Key Design Decisions

- `fetch-depth: 0` — full git history needed for `nx affected` SHA comparison
- `filter: tree:0` — treeless clone for faster checkout while keeping full history
- `nrwl/nx-set-shas@v4` — sets `NX_BASE` and `NX_HEAD` env vars automatically
- Single `nx affected` command runs lint, test, and build only for changed packages
- `pnpm/action-setup@v4` auto-detects pnpm version from `packageManager` field
- No Nx Cloud — local caching only (CI cache is ephemeral per run)
