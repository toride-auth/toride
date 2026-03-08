# Data Model: README and Official Documentation Site

**Date**: 2026-03-08

## Overview

This feature produces static content (Markdown files, configuration) with no runtime data entities. The "data model" here describes the documentation structure and content organization.

## Documentation Site Structure

### Entity: Page

Each page in the docs site is a Markdown file processed by VitePress.

| Field | Type | Description |
|-------|------|-------------|
| title | string | Page title (frontmatter `title` or first `#` heading) |
| description | string | Meta description (optional frontmatter) |
| path | string | URL path relative to base (e.g., `/guide/getting-started`) |
| sidebar_group | string | Which sidebar section the page belongs to |
| order | number | Position within sidebar group (implicit from sidebar config) |

### Content Sections (Sidebar Groups)

| Section | Pages | Description |
|---------|-------|-------------|
| (root) | `index.md` | Landing page with hero section |
| Guide | `getting-started.md`, `quickstart.md` | Installation and first steps |
| Concepts | `policy-format.md`, `roles-and-relations.md`, `conditions-and-rules.md`, `partial-evaluation.md`, `client-side-hints.md` | Core concept explanations |
| Integrations | `prisma.md`, `drizzle.md`, `codegen.md` | Package-specific documentation |

### Total Page Count: 11 pages (meets SC-003: at least 10)

## README Structure

Single file at repo root. Not a VitePress page.

| Section | Content |
|---------|---------|
| Badge row | npm version, license, CI status |
| One-liner | What toride is |
| Features | Key differentiators list |
| Install | `pnpm add toride` |
| Usage example | Policy + resolver + `can()` check |
| Packages | Brief table of all 4 packages |
| Docs link | Link to official site |

## VitePress Configuration

| Config Key | Value | Purpose |
|------------|-------|---------|
| `base` | `'/toride/'` | GitHub Pages project site path |
| `title` | `'Toride'` | Site title |
| `description` | `'Relation-aware authorization engine for TypeScript'` | Meta description |
| `themeConfig.search.provider` | `'local'` | Built-in search (FR-011) |
| `themeConfig.sidebar` | Array of groups | Navigation structure (FR-010) |
| `themeConfig.nav` | Array | Top navigation links |
| `themeConfig.socialLinks` | GitHub link | Link to repository |

## Relationships

```
README.md ──links-to──> docs site (landing page)
docs/index.md ──CTA──> docs/guide/getting-started.md
guide pages ──cross-link──> concept pages
concept pages ──cross-link──> integration pages
integration pages ──cross-link──> concept pages (partial evaluation, etc.)
```
