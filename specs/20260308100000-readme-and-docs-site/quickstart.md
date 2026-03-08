# Quickstart: README and Docs Site Development

**Date**: 2026-03-08

## Prerequisites

- Node.js 20+
- pnpm 10.x
- Access to the `toride-auth/toride` GitHub repository

## Local Docs Development

### 1. Set up the docs directory

```bash
cd docs
pnpm install
```

### 2. Start the dev server

```bash
pnpm dev
```

The docs site will be available at `http://localhost:5173/toride/`.

### 3. Build for production

```bash
pnpm build
```

Output goes to `docs/.vitepress/dist/`.

### 4. Preview the production build

```bash
pnpm preview
```

## File Locations

| Artifact | Path |
|----------|------|
| Root README | `README.md` |
| Docs config | `docs/.vitepress/config.ts` |
| Landing page | `docs/index.md` |
| Guide pages | `docs/guide/*.md` |
| Concept pages | `docs/concepts/*.md` |
| Integration pages | `docs/integrations/*.md` |
| Deploy workflow | `.github/workflows/deploy-docs.yml` |

## Verification

- **README**: Push to a branch, view on GitHub to verify rendering and badge display
- **Docs site**: Run `pnpm build` in `docs/` — build must succeed with zero errors
- **Deployment**: After merging to `main`, check GitHub Actions for the deploy-docs workflow
- **Live site**: Visit `https://toride-auth.github.io/toride/` after deployment
