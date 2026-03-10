# Feature Specification: Improve Official Docs Messaging

**Feature Branch**: `improve-docs-messaging`
**Created**: 2026-03-09
**Status**: Draft
**Input**: User description: "improve the official docs. i hate the phrase 'resolve relations from your database'. that's not the point of Toride. it's database agnostic. you don't need a database to use Toride. policies are YAML and is typesafe. find other parts Toride truely shines. policies can be relation based, too."

## Clarifications

### Session 2026-03-09

- Q: What is the canonical term used consistently across all docs when referring to the data layer resolvers access? → A: "data source"
- Q: Where should the "Why Toride" page appear in the sidebar navigation? → A: Before Getting Started — first item in the Guide section

## User Scenarios & Testing *(mandatory)*

### User Story 1 - First Impression: Landing Page Communicates Value (Priority: P1)

A TypeScript developer visits the Toride docs site for the first time. They immediately understand what Toride is: a type-safe, database-agnostic authorization engine where policies are defined declaratively in YAML. The hero tagline and feature cards convey three balanced strengths: (1) YAML policies with type safety, (2) database-agnostic design, and (3) relation-aware role propagation through declarative policy definitions.

**Why this priority**: The landing page is the first thing every visitor sees. If the messaging is wrong here, developers form incorrect assumptions about the library and may leave.

**Independent Test**: Visit the landing page and confirm there is no mention of "database" as a requirement, and all three value propositions are clearly communicated.

**Acceptance Scenarios**:

1. **Given** a developer visits the docs site, **When** they read the hero section, **Then** they understand Toride is a type-safe authorization engine that uses YAML policies and works with any data source
2. **Given** a developer reads the feature cards, **When** they scan all three cards, **Then** they see YAML type safety, database-agnostic design, and relation-aware role derivation as distinct features
3. **Given** a developer reads the landing page, **When** they search for the phrase "from your database", **Then** they find zero occurrences

---

### User Story 2 - Getting Started Page Frames Resolvers Correctly (Priority: P1)

A developer navigating to the Getting Started page understands that resolvers are simple data-access functions -- not database connectors. The page makes clear that Toride works with any data source: in-memory objects, REST APIs, GraphQL, file systems, or databases. The phrase "provide a resolver that connects to your database" is replaced with language that frames resolvers as generic data-access functions.

**Why this priority**: The Getting Started page is the second most visited page and sets expectations for the entire developer experience. Misleading framing here causes developers to think Toride requires a database.

**Independent Test**: Read the Getting Started page and confirm resolvers are described as data-access functions without any database-centric language.

**Acceptance Scenarios**:

1. **Given** a developer reads the Getting Started page, **When** they reach the resolver description, **Then** they understand resolvers are functions that return attributes from any source
2. **Given** a developer reads the project structure section, **When** they see the resolver description, **Then** it says "data access functions" or similar, not "connects to your database"

---

### User Story 3 - Quickstart Shows In-Memory First, Then Database (Priority: P1)

A developer following the Quickstart guide sees an in-memory resolver example first (plain objects, no `db.` calls), proving that Toride works without any database. A follow-up section then shows how to connect resolvers to a real database as a "real-world" pattern.

**Why this priority**: The quickstart is the hands-on entry point. Showing in-memory resolvers first eliminates the misconception that a database is required and lowers the barrier to trying Toride.

**Independent Test**: Follow the quickstart using only the in-memory example and successfully run a permission check without any database dependency.

**Acceptance Scenarios**:

1. **Given** a developer reads the quickstart, **When** they reach the resolver section, **Then** the first example uses plain in-memory data (no database calls)
2. **Given** a developer finishes the in-memory example, **When** they scroll down, **Then** they see a clearly labeled "Real-World: Database Resolvers" section showing how to connect to a database
3. **Given** a developer copies the in-memory quickstart code, **When** they run it, **Then** it works without any database setup

---

### User Story 4 - New "Why Toride" Page Articulates Value Proposition (Priority: P2)

A developer evaluating Toride finds a dedicated "Why Toride" page that clearly articulates what makes Toride unique: (1) policies are YAML files that serve as the single source of truth for your entire authorization model, (2) YAML policies are validated and type-safe via codegen, (3) the engine is database-agnostic -- resolvers are just functions, (4) complex hierarchies (org -> team -> project -> task) are modeled entirely in YAML with automatic role propagation, and (5) partial evaluation turns policies into database constraints when you need it.

**Why this priority**: A dedicated value-proposition page helps developers making buy-vs-build decisions. It's important but secondary to fixing the core messaging on existing pages.

**Independent Test**: Read the "Why Toride" page and confirm it covers all five value propositions without mentioning specific competitor products.

**Acceptance Scenarios**:

1. **Given** a developer visits the "Why Toride" page, **When** they read through it, **Then** they find clear explanations of all five key strengths
2. **Given** a developer reads the page, **When** they search for competitor product names, **Then** they find zero mentions
3. **Given** a developer reads the YAML expressiveness section, **When** they see the example, **Then** it demonstrates modeling a multi-level hierarchy (at least 3 levels) entirely in YAML

---

### User Story 5 - YAML Expressiveness Emphasized in Concept Pages (Priority: P2)

A developer reading the concept pages (Policy Format, Roles & Relations) comes away understanding that YAML policies are the single source of truth for the entire authorization model. The docs emphasize that complex hierarchies, role derivation chains, conditional rules, and cross-resource conditions are all expressed declaratively in YAML -- no imperative code required for the authorization model itself.

**Why this priority**: The concept pages are where developers decide if the model is expressive enough for their use case. Emphasizing YAML expressiveness helps them see the power of the declarative approach.

**Independent Test**: Read the Policy Format and Roles & Relations pages and confirm they emphasize YAML expressiveness and the "single source of truth" framing.

**Acceptance Scenarios**:

1. **Given** a developer reads the Policy Format page, **When** they reach the introduction, **Then** they see language about YAML being the single source of truth for the authorization model
2. **Given** a developer reads the Roles & Relations page, **When** they see the derivation patterns, **Then** each pattern emphasizes that the behavior is declared in YAML and the engine handles the rest automatically

---

### User Story 6 - All Database-Centric Language Removed Across Docs (Priority: P2)

A developer reading any page in the docs never encounters language that implies a database is required. Phrases like "resolve relations from your database", "connects to your database", "fetch from your database" are replaced with database-agnostic alternatives using the canonical term "data source" (e.g., "resolve from your data source", "return attributes from any data source").

**Why this priority**: Consistency across all pages prevents any lingering misconceptions about database requirements.

**Independent Test**: Search the entire docs directory for "your database" and confirm zero occurrences.

**Acceptance Scenarios**:

1. **Given** the complete docs site, **When** a text search for "your database" is performed, **Then** zero results are returned
2. **Given** the complete docs site, **When** a text search for "from your database" is performed, **Then** zero results are returned
3. **Given** a developer reads any resolver-related section, **When** they see the resolver description, **Then** it uses database-agnostic language

---

### Edge Cases

- What happens when a concept page needs to show a database example (e.g., Partial Evaluation)? Use clear framing: "When you use a database, you can..." rather than implying databases are required.
- What about the integration pages (Prisma, Drizzle)? These pages are inherently database-specific and should keep database language, but frame it as "if you use Prisma/Drizzle" rather than "when you connect to your database".
- How do we handle the ORM Adapters section in Getting Started? Frame as "optional" and "for when you want database-level filtering", not as a core requirement.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Landing page hero tagline MUST NOT contain the phrase "resolve relations from your database" or any language implying a database is required
- **FR-002**: Landing page hero tagline MUST convey three balanced strengths: type-safe YAML policies, database-agnostic design, and relation-aware role derivation
- **FR-003**: Landing page feature cards MUST include a card highlighting database-agnostic / "bring your own data" design
- **FR-004**: Getting Started page MUST describe resolvers as generic data-access functions, not database connectors
- **FR-005**: Quickstart page MUST show an in-memory resolver example before any database-connected example
- **FR-006**: Quickstart page MUST include a separate, clearly labeled section showing database-connected resolvers as a "real-world" pattern
- **FR-007**: A new "Why Toride" page MUST be created, articulating five key strengths: YAML as single source of truth, type safety via codegen, database-agnostic resolvers, declarative relation-based policies, and partial evaluation
- **FR-008**: The "Why Toride" page MUST NOT mention any competitor products by name
- **FR-009**: The "Why Toride" page MUST include a YAML example showing at least a 3-level hierarchy modeled entirely in YAML
- **FR-010**: All docs pages (excluding Prisma/Drizzle integration pages) MUST NOT contain phrases like "from your database", "connects to your database", or "fetch from your database"
- **FR-011**: Prisma and Drizzle integration pages MAY retain database-specific language but MUST frame it as optional ("if you use Prisma/Drizzle") rather than as a core requirement
- **FR-012**: Policy Format and Roles & Relations concept pages MUST emphasize YAML as the single source of truth for the authorization model
- **FR-013**: All resolver-related sections MUST use the canonical term "data source" when referring to where resolvers get their data (not "database", "data access functions", or "data provider")
- **FR-014**: The "Why Toride" page MUST be linked from the landing page hero actions and from the sidebar navigation as the first item in the Guide section (before Getting Started)

### Key Entities

- **Landing Page** (`docs/index.md`): Hero section with tagline, action buttons, and feature cards
- **Getting Started Page** (`docs/guide/getting-started.md`): Installation guide, resolver framing, project structure
- **Quickstart Page** (`docs/guide/quickstart.md`): Step-by-step first authorization check with code examples
- **Why Toride Page** (new: `docs/guide/why-toride.md`): Value proposition page covering five key strengths
- **Policy Format Page** (`docs/concepts/policy-format.md`): YAML policy structure reference
- **Roles & Relations Page** (`docs/concepts/roles-and-relations.md`): Role derivation patterns and relation concepts

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero occurrences of "from your database" or "connects to your database" across all non-integration docs pages
- **SC-002**: A developer with no database can follow the quickstart and run a successful permission check using only in-memory data
- **SC-003**: The landing page hero section communicates all three value propositions (type-safe YAML, database-agnostic, relation-aware) in a single scan (under 10 seconds of reading)
- **SC-004**: The "Why Toride" page exists, is linked from the landing page, and covers all five stated value propositions

## Assumptions

- The VitePress docs site structure remains unchanged (no migration to a different static site generator)
- The sidebar navigation configuration in `.vitepress/config.ts` supports adding new pages without structural changes
- Integration pages (Prisma, Drizzle) are explicitly out of scope for messaging changes beyond minor framing adjustments
- The codegen page is out of scope for this spec (its messaging is already accurate)
- No changes to actual Toride engine code are needed -- this is a docs-only change

## Scope Boundaries

**In scope**:
- Rewriting landing page hero and feature cards
- Rewriting Getting Started page resolver framing
- Rewriting Quickstart to show in-memory first, then database
- Creating new "Why Toride" page
- Updating concept pages (Policy Format, Roles & Relations) to emphasize YAML expressiveness
- Removing database-centric language across all non-integration docs
- Adding "Why Toride" to sidebar navigation

**Out of scope**:
- Rewriting Prisma/Drizzle integration pages (minor framing adjustments only)
- Rewriting Client-Side Hints or Partial Evaluation concept pages (unless they contain "from your database" language)
- Adding a competitor comparison page
- Changes to the Toride engine code or API
- Changes to the codegen docs page
