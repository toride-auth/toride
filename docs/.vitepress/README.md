# Documentation locales

English pages keep their existing root URLs. Japanese pages mirror the same paths
under `docs/ja/`. VitePress's default locale menu switches between corresponding
pages on desktop and in the mobile navigation menu.
The small theme hook keeps the current fragment on locale links when VitePress
1.6 hydrates a directly opened section URL with hash-free server-rendered links.

When adding or updating a page:

- Update both languages, including descriptions, navigation, and related links.
- Keep code identifiers and fenced examples identical in both versions.
- Give Japanese headings explicit IDs matching the English heading IDs, such as
  `## 前提条件 {#prerequisites}`, so section links survive language switching.
- Prefix Japanese internal links with `/ja/`; keep external URLs unchanged.

Run `pnpm exec nx run toride-docs:test` from the repository root. It builds the
site first, then checks locale coverage, examples, metadata, section IDs, and
rendered internal links. The docs build cache points to `.vitepress/dist` so the
checks also work when Nx restores a cached build.

For browser checks, run `pnpm exec nx run toride-docs:preview` after the build and
open `/toride/`. Check both home pages, a nested page with a section fragment,
language switching in both directions, local search (for example `権限` and
`resolver`), and mobile navigation. Restart preview after rebuilding because its
static-file cache is initialized at startup.
