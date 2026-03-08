# Feature Specification: README and Official Documentation Site

**Feature Branch**: `add-readme-and-official-site`
**Created**: 2026-03-08
**Status**: Draft
**Input**: User description: "I'd like to add a README for toride. Also, an official documentation site for people to be able to use it."

## Clarifications

### Session 2026-03-08

- Q: Should each package have its own README.md for npm display, or only a root-level README? → A: Root README only
- Q: Should the docs deployment workflow use path filters to only trigger on docs/ changes, or run on every push to main? → A: Path-filtered (only trigger on docs/ changes)
- Q: Should the README include a Contributing section? → A: No contributing section
- Q: Should the docs site landing page include a code example or just a static hero with CTA? → A: Static hero with CTA button

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Discover Toride on GitHub (Priority: P1)

A JavaScript/TypeScript developer discovers the toride repository on GitHub or npm. They land on the repository page and see a clear, well-structured README with a one-liner explaining what toride does, a badge row (npm version, license, build status), a concise feature list highlighting key differentiators (relation-aware authz, partial evaluation, YAML policies), a quick install command, a minimal usage example showing policy + resolver + `can()` check, and a prominent link to the full documentation site.

**Why this priority**: The README is the first touchpoint for every potential user. Without it, developers cannot understand what toride is or how to get started — no amount of documentation elsewhere matters if the README fails to hook them.

**Independent Test**: Can be tested by visiting the repository root on GitHub and verifying the README renders correctly with all expected sections, badges resolve, code examples are syntactically valid, and the docs link is functional.

**Acceptance Scenarios**:

1. **Given** a developer visits the toride GitHub repository, **When** they view the README, **Then** they can understand what toride does within 30 seconds (one-liner + feature list).
2. **Given** a developer reads the README, **When** they follow the install command and usage example, **Then** they have a working authorization check without consulting any other resource.
3. **Given** the README contains a docs link, **When** a developer clicks it, **Then** they are taken to the official documentation site.
4. **Given** the README contains badges, **When** viewed on GitHub, **Then** all badges (npm version, license, CI status) render correctly and link to their respective sources.

---

### User Story 2 - Browse Documentation Site for Getting Started (Priority: P1)

A developer who wants to adopt toride visits the documentation site. They see a clean landing page with a brief introduction, then navigate to an installation guide and a step-by-step quickstart that walks them through defining a YAML policy, implementing a resolver, creating the engine, and running their first permission check. The site covers all four packages (toride, @toride/codegen, @toride/drizzle, @toride/prisma) with clear navigation.

**Why this priority**: The docs site is where developers go to actually learn and adopt the library. The quickstart flow is the critical conversion path from "interested" to "using it."

**Independent Test**: Can be tested by deploying the docs site locally, navigating through the getting-started flow, and verifying all pages render correctly, code examples are complete, and navigation between sections works.

**Acceptance Scenarios**:

1. **Given** a developer visits the docs site, **When** they land on the home page, **Then** they see a clear introduction to toride with a call-to-action to get started.
2. **Given** a developer navigates to the quickstart page, **When** they follow the guide, **Then** they can set up a working toride authorization check from scratch.
3. **Given** the docs site covers all packages, **When** a developer looks for Prisma adapter documentation, **Then** they find it in a clearly labeled section with installation and usage instructions.
4. **Given** the docs site is built with VitePress, **When** a developer searches for a term (e.g., "derived roles"), **Then** the built-in search returns relevant results.

---

### User Story 3 - Learn Core Concepts In-Depth (Priority: P2)

A developer who has completed the quickstart wants to understand toride's concepts more deeply. They navigate to concept guides covering: policy format and structure, roles and relations (direct, derived, global), conditions and rules (permit/forbid, ABAC), partial evaluation and data filtering, and client-side permission hints. Each guide explains the concept, shows the relevant YAML policy syntax, and provides TypeScript usage examples.

**Why this priority**: Concept guides turn quickstart users into proficient users. Without them, developers hit walls when their use cases go beyond the basic example, leading to frustration and abandonment.

**Independent Test**: Can be tested by reading each concept guide and verifying it explains the concept clearly, includes working code examples, and links to related concepts where appropriate.

**Acceptance Scenarios**:

1. **Given** a developer wants to understand derived roles, **When** they navigate to the Roles & Relations concept guide, **Then** they find explanations of all five role derivation sources with YAML and TypeScript examples.
2. **Given** a developer needs to filter data, **When** they read the Partial Evaluation guide, **Then** they understand how `buildConstraints()` works and how to use it with Prisma or Drizzle adapters.
3. **Given** a developer reads a concept guide, **When** they encounter a related concept, **Then** there is a cross-link to the relevant guide.

---

### User Story 4 - Read Integration Package Docs (Priority: P2)

A developer using Prisma or Drizzle wants to set up the corresponding toride adapter. They navigate to the integrations section and find dedicated pages for @toride/prisma, @toride/drizzle, and @toride/codegen, each with installation instructions, configuration, usage examples, and any package-specific considerations.

**Why this priority**: Integration packages are how most developers will actually use toride in production. Dedicated docs reduce friction for the most common adoption paths.

**Independent Test**: Can be tested by navigating to each integration page and verifying it covers installation, setup, and at least one complete usage example.

**Acceptance Scenarios**:

1. **Given** a developer uses Prisma, **When** they visit the @toride/prisma integration page, **Then** they find install instructions, adapter creation, and a complete `buildConstraints()` → Prisma WHERE example.
2. **Given** a developer uses Drizzle, **When** they visit the @toride/drizzle integration page, **Then** they find equivalent documentation tailored to Drizzle's API.
3. **Given** a developer wants typed resolvers, **When** they visit the @toride/codegen page, **Then** they find instructions for generating TypeScript types from their policy file.

---

### User Story 5 - Docs Site is Deployed Automatically (Priority: P2)

When changes are pushed to the main branch that affect documentation content, the docs site is automatically built and deployed to GitHub Pages via a GitHub Actions workflow. The site is accessible at the default GitHub Pages URL (toride-auth.github.io/toride).

**Why this priority**: Automated deployment ensures docs stay in sync with the codebase. Manual deployment creates drift and maintenance burden.

**Independent Test**: Can be tested by pushing a documentation change and verifying the GitHub Actions workflow runs successfully and the updated content appears on the live site.

**Acceptance Scenarios**:

1. **Given** a documentation change is pushed to main, **When** the GitHub Actions workflow runs, **Then** the docs site is rebuilt and deployed to GitHub Pages.
2. **Given** the docs site is deployed, **When** a user visits the GitHub Pages URL, **Then** they see the latest documentation.
3. **Given** a non-documentation change is pushed (e.g., only source code), **When** the workflow evaluates path filters, **Then** the workflow is skipped entirely (path filter on `docs/**`).

---

### Edge Cases

- What happens when a developer visits a docs page that doesn't exist (broken link, old bookmark)? The docs site shows a friendly 404 page with navigation back to the home page.
- What happens when code examples in the docs become outdated after a code change? The spec does not require automated validation of code examples, but the docs structure should make examples easy to find and update.
- What happens when the GitHub Pages deployment fails? The previous version of the site remains live. The workflow should report failure clearly in the GitHub Actions UI.
- What happens when a developer views the docs site on mobile? The site is responsive and readable on mobile devices (VitePress handles this by default).

## Requirements *(mandatory)*

### Functional Requirements

**README:**

- **FR-001**: Repository MUST have a root-level README.md file that renders correctly on GitHub.
- **FR-002**: README MUST include: a badge row (npm version, license, CI status), a one-line description of toride, a key features list, an installation command, a minimal usage example (policy + resolver + can() check), and a link to the official documentation site.
- **FR-003**: README MUST mention all four packages (toride, @toride/codegen, @toride/drizzle, @toride/prisma) with brief descriptions.
- **FR-004**: README usage example MUST be syntactically valid TypeScript that represents a realistic authorization scenario.
- **FR-004a**: Only a root-level README.md is required. Sub-packages do not need individual READMEs.
- **FR-004b**: README MUST NOT include a Contributing section.

**Documentation Site:**

- **FR-005**: Documentation site MUST be built with VitePress and live in a `docs/` directory within the monorepo.
- **FR-006**: Documentation site MUST include a home/landing page with a static hero section (tagline, description, "Get Started" CTA button). No code examples on the landing page.
- **FR-007**: Documentation site MUST include a Getting Started section with installation instructions and a step-by-step quickstart guide.
- **FR-008**: Documentation site MUST include concept guides for: Policy Format, Roles & Relations, Conditions & Rules, Partial Evaluation, and Client-Side Hints.
- **FR-009**: Documentation site MUST include integration pages for @toride/prisma, @toride/drizzle, and @toride/codegen.
- **FR-010**: Documentation site MUST have a sidebar navigation that organizes content into logical sections (Getting Started, Concepts, Integrations).
- **FR-011**: Documentation site MUST support built-in search functionality (VitePress local search).
- **FR-012**: Documentation site MUST support dark mode.
- **FR-013**: Documentation site MUST be responsive and readable on mobile devices.

**Deployment:**

- **FR-014**: A GitHub Actions workflow MUST build and deploy the docs site to GitHub Pages on pushes to the main branch, using path filters to only trigger when files under `docs/` are changed. The workflow MUST also support `workflow_dispatch` for manual rebuilds.
- **FR-015**: The docs site MUST be accessible at the default GitHub Pages URL (toride-auth.github.io/toride).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A developer new to toride can understand the library's purpose and value proposition within 30 seconds of viewing the README.
- **SC-002**: A developer can go from zero to a working authorization check by following the README example in under 5 minutes.
- **SC-003**: The documentation site contains at least 10 content pages covering getting started, all core concepts, and all integration packages.
- **SC-004**: The documentation site loads in under 3 seconds on a standard broadband connection.
- **SC-005**: Documentation deployment is fully automated — no manual steps required after merging to main.
- **SC-006**: All code examples in the documentation are syntactically valid and represent realistic usage patterns.
- **SC-007**: The documentation site is navigable via search, sidebar, and cross-links between related pages.

## Assumptions

- The existing quickstart content in `specs/001-authz-engine/quickstart.md` can be adapted for the docs site quickstart guide.
- VitePress default theme and built-in features (search, dark mode, responsive layout) are sufficient — no custom theme development needed.
- The docs site will not include API reference documentation auto-generated from source code in this phase. Concept guides and hand-written examples are the focus.
- The monorepo's existing Nx setup can accommodate a `docs/` directory without requiring it to be a formal Nx project (VitePress has its own dev server and build).
- GitHub Pages is already enabled or can be enabled on the toride-auth/toride repository.
- No custom domain is needed for the initial deployment; the default GitHub Pages URL is acceptable.
- README will be in English only. Documentation site will be in English only (no i18n in this phase).
