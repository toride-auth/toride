# Feature Specification: Policy JSON Schema & IDE Integration

**Feature Branch**: `policy-schema-ide`
**Created**: 2026-03-13
**Status**: Draft
**Input**: User description: "Add a lint feature for policy YAML — generate a JSON Schema for IDE validation and document the existing CLI"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - IDE Structural Validation via JSON Schema (Priority: P1)

A developer editing a toride policy YAML file in VS Code (or any editor with YAML language server support) gets real-time structural validation feedback — red squiggles on invalid keys, wrong types, missing required fields — without leaving the editor or running any CLI command.

**Why this priority**: This is the core value proposition. Catching structural errors during authoring (before running the CLI) dramatically reduces the feedback loop and improves the policy authoring experience.

**Independent Test**: Can be fully tested by opening a policy YAML file in VS Code with the Red Hat YAML extension configured to use the generated schema, introducing a structural error (e.g., misspelling `version` as `verion`), and verifying that a diagnostic appears.

**Acceptance Scenarios**:

1. **Given** a policy YAML file with the schema comment `# yaml-language-server: $schema=...`, **When** the developer types an invalid top-level key (e.g., `resoures` instead of `resources`), **Then** the editor shows a diagnostic indicating the key is not allowed.
2. **Given** a policy YAML file associated with the schema, **When** the developer omits the required `version` field, **Then** the editor shows a diagnostic indicating the missing required property.
3. **Given** a policy YAML file associated with the schema, **When** the developer assigns a non-string value to `version`, **Then** the editor shows a type mismatch diagnostic.
4. **Given** a policy YAML file associated with the schema, **When** the developer types inside the `actors` block, **Then** the editor offers autocomplete suggestions for valid keys like `attributes`.
5. **Given** a developer installs `toride` via npm, **When** they look in `node_modules/toride/schema/`, **Then** they find `policy.schema.json` ready to reference.

---

### User Story 2 - Auto-Generated Schema Stays in Sync (Priority: P1)

A maintainer modifying the valibot policy schemas in `policy/schema.ts` does not need to manually update the JSON Schema. The schema is regenerated automatically during the build process, and CI fails if the committed schema is out of date.

**Why this priority**: Without automatic sync, the JSON Schema will inevitably drift from the source of truth (valibot schemas), leading to false positives/negatives in IDE validation. This is equally critical to the schema itself.

**Independent Test**: Can be tested by modifying a valibot schema (e.g., adding a new optional field to `ResourceBlockSchema`), running the build, and verifying the generated JSON Schema includes the new field. Then, committing without regenerating and verifying CI fails.

**Acceptance Scenarios**:

1. **Given** a developer modifies `PolicySchema` in `policy/schema.ts`, **When** they run `pnpm run build` in the toride package, **Then** the `schema/policy.schema.json` file is regenerated to reflect the change.
2. **Given** a PR where `policy/schema.ts` was modified but `schema/policy.schema.json` was not regenerated, **When** CI runs, **Then** the pipeline fails with a clear message indicating the schema is out of date.
3. **Given** no changes to `policy/schema.ts`, **When** the build runs, **Then** the schema generation step completes without modifying the committed file.

---

### User Story 3 - CLI Reference Documentation (Priority: P2)

A developer discovering toride for the first time finds clear documentation on the official docs site explaining how to use the `toride validate` and `toride test` CLI commands, including examples, flags, and exit codes.

**Why this priority**: The CLI already exists and works, but is undocumented on the docs site. Documentation unlocks the existing value for new users.

**Independent Test**: Can be tested by visiting the docs site, navigating to the CLI reference page, and following the documented examples to validate a sample policy file.

**Acceptance Scenarios**:

1. **Given** a developer visits the toride docs site, **When** they navigate to the CLI section, **Then** they find documentation for `toride validate` including usage syntax, `--strict` flag description, and example output.
2. **Given** a developer visits the CLI docs, **When** they look for the `toride test` command, **Then** they find documentation including glob pattern support, test file formats (inline and separate `.test.yaml`), and example output.
3. **Given** a developer reads the CLI docs, **When** they look for exit code information, **Then** they find that exit code 0 means success and exit code 1 means failure.

---

### User Story 4 - IDE Setup Guide (Priority: P2)

A developer reads a guide on the docs site explaining how to configure their editor to use the toride JSON Schema for policy file validation, with step-by-step instructions for VS Code.

**Why this priority**: The JSON Schema is only useful if developers know how to configure their editors to use it. This documentation bridges the gap between the schema artifact and actual IDE validation.

**Independent Test**: Can be tested by following the guide from scratch in a fresh VS Code workspace and verifying that schema validation works.

**Acceptance Scenarios**:

1. **Given** a developer reads the IDE setup guide, **When** they follow the VS Code instructions using the per-file comment method, **Then** they get schema validation working in their policy YAML files.
2. **Given** a developer reads the IDE setup guide, **When** they follow the VS Code instructions using the workspace settings method, **Then** all matching policy files get schema validation automatically.
3. **Given** a developer uses an editor other than VS Code, **When** they read the guide, **Then** they find a general note explaining that any editor supporting YAML language server and JSON Schema should work with similar configuration.

---

### Edge Cases

- What happens when the valibot schema uses constructs that don't map cleanly to JSON Schema (e.g., recursive `lazy()` types, `union` with mixed shapes)? The generator must handle these gracefully, potentially with less-strict schema constraints for complex cases rather than failing.
- What happens when a policy file uses JSON format instead of YAML? The JSON Schema works natively with JSON files without any additional configuration.
- What happens when the schema generation script is run but valibot dependencies are not installed? The script should fail with a clear error message since it runs as part of the build which requires dependencies.
- What happens when a user references an older version of the schema URL but their policy uses newer features? The schema validates against the version it was generated from; version mismatches may produce false errors.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The build process MUST generate a JSON Schema file (`policy.schema.json`) from the valibot `PolicySchema` definition in `policy/schema.ts`.
- **FR-002**: The generated JSON Schema MUST validate the same structural constraints as the valibot schema — required fields, allowed keys, value types, and enum values (e.g., `version: "1"`, `effect: "permit" | "forbid"`, attribute types `"string" | "number" | "boolean"`).
- **FR-003**: The generated JSON Schema MUST be placed at `packages/toride/schema/policy.schema.json` and included in the published npm package.
- **FR-004**: The build process MUST include a schema generation step that runs automatically when `pnpm run build` is executed in the toride package.
- **FR-005**: CI MUST verify that the committed `policy.schema.json` matches what the generator would produce, failing the pipeline if they differ.
- **FR-006**: The docs site MUST include a CLI reference page documenting the `toride validate` command (with `--strict` flag) and the `toride test` command (with glob support and test file formats).
- **FR-007**: The docs site MUST include an IDE setup guide explaining how to configure VS Code (Red Hat YAML extension) to use the toride policy schema, covering both the per-file comment method and the workspace settings method.
- **FR-008**: The JSON Schema MUST include `title` and `description` fields for the top-level schema and key properties to enable hover documentation in editors.

### Key Entities

- **Policy Schema (JSON Schema)**: A JSON Schema document derived from the valibot `PolicySchema`. Describes the structural shape of a toride policy file (version, actors, resources, global_roles, tests). Distributed as part of the npm package.
- **Schema Generator**: A build-time script that reads the valibot schema definitions and outputs a compliant JSON Schema file. Runs as part of the toride package build pipeline.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Developers using VS Code with the YAML extension and the toride schema receive diagnostics for 100% of structural errors that `valibot.safeParse(PolicySchema, ...)` would catch.
- **SC-002**: The schema generation completes in under 5 seconds as part of the build process.
- **SC-003**: A new contributor can set up IDE validation for policy files in under 5 minutes by following the docs site guide.
- **SC-004**: The CI drift check correctly detects and blocks PRs where `policy/schema.ts` changes are not accompanied by a regenerated `policy.schema.json`.
- **SC-005**: The CLI reference documentation covers all existing commands, flags, and exit codes with runnable examples.

## Assumptions

- The Red Hat YAML extension (or equivalent) is the standard way to get JSON Schema validation in VS Code for YAML files. No custom VS Code extension is needed.
- Valibot schema constructs used in `PolicySchema` (objects, records, arrays, unions, picklists, optional, literal, lazy) can be mapped to JSON Schema equivalents with sufficient fidelity for useful IDE validation, even if some edge cases (e.g., deeply recursive `lazy()`) require approximation.
- The existing valibot-to-JSON-Schema conversion can be implemented as a standalone script without requiring third-party conversion libraries, given the bounded complexity of the `PolicySchema`.

## Out of Scope

- **Language Server Protocol (LSP)**: Full cross-reference validation (e.g., "role X referenced but not declared") in the IDE requires an LSP server, which is not part of this spec. Cross-reference validation remains CLI-only via `toride validate`.
- **SchemaStore submission**: Registering the schema with schemastore.org for automatic detection is a potential future enhancement but not in scope.
- **Non-VS-Code editor guides**: Detailed setup instructions for editors other than VS Code (e.g., Neovim, JetBrains) are not in scope, though a general note about YAML language server compatibility will be included.
- **New CLI commands or features**: The existing `validate` and `test` commands are documented as-is. No new CLI commands are added.
