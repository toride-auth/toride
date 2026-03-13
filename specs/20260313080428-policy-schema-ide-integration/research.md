# Research: Policy JSON Schema & IDE Integration

## R1: Valibot-to-JSON-Schema Mapping Strategy

**Decision**: Hand-written converter that pattern-matches on valibot schema types.

**Rationale**: The `PolicySchema` uses a bounded set of valibot constructs. A custom converter gives full control over output quality, especially for tricky constructs like `v.lazy()` (recursive types) and `v.unknown()`. No new dependencies needed.

**Valibot constructs used in PolicySchema and their JSON Schema mappings**:

| Valibot Construct | JSON Schema Equivalent | Notes |
|---|---|---|
| `v.object({...})` | `{ "type": "object", "properties": {...}, "required": [...] }` | Required = non-optional keys |
| `v.string()` | `{ "type": "string" }` | Direct mapping |
| `v.number()` | `{ "type": "number" }` | Direct mapping |
| `v.boolean()` | `{ "type": "boolean" }` | Direct mapping |
| `v.literal("1")` | `{ "const": "1" }` | Exact value match |
| `v.picklist([...])` | `{ "enum": [...] }` | Direct mapping |
| `v.array(T)` | `{ "type": "array", "items": <T> }` | Direct mapping |
| `v.record(K, V)` | `{ "type": "object", "additionalProperties": <V> }` | Key type ignored (always string in JSON) |
| `v.optional(T)` | Same as T, but key removed from `required` | Standard pattern |
| `v.union([...])` | `{ "anyOf": [...] }` | Direct mapping |
| `v.unknown()` | `{}` (any value) | Intentionally permissive |
| `v.lazy(() => X)` | `{ "$ref": "#/$defs/X" }` | Use JSON Schema `$defs` + `$ref` for recursion |

**Alternatives considered**:
- `@valibot/to-json-schema`: Official library exists but adds a dependency. The bounded schema complexity doesn't justify it. Also gives less control over `$ref` naming and descriptions.
- Hybrid approach: Unnecessary given the manageable scope.

## R2: Recursive ConditionExpression Handling

**Decision**: Use JSON Schema `$defs` with `$ref` for the recursive `ConditionExpressionSchema`.

**Rationale**: `ConditionExpressionSchema` is a recursive union (simple conditions | `{any: [...]}` | `{all: [...]}`). JSON Schema handles this natively with `$defs`/`$ref`. The converter will detect `v.lazy()` references, register the target schema in `$defs`, and emit `$ref` pointers.

**Approach**:
```json
{
  "$defs": {
    "ConditionExpression": {
      "anyOf": [
        { "type": "object", "properties": { "any": { "type": "array", "items": { "$ref": "#/$defs/ConditionExpression" }}}},
        { "type": "object", "properties": { "all": { "type": "array", "items": { "$ref": "#/$defs/ConditionExpression" }}}},
        { "type": "object", "additionalProperties": { ... } }
      ]
    }
  }
}
```

## R3: Build Integration via tsup onSuccess

**Decision**: Use tsup's `onSuccess` callback to run `node scripts/generate-schema.mjs` after compilation.

**Rationale**: The script imports from `dist/` (compiled output), so it must run after tsup succeeds. The `onSuccess` hook is the natural integration point — no extra orchestration needed. The script is a plain `.mjs` file with no TypeScript compilation needed.

**Alternatives considered**:
- Separate Nx target: More explicit but adds config complexity for a simple sequential dependency.
- Pre-build script: Would run before dist/ exists.
- tsx runner: Adds a dev dependency unnecessarily.

## R4: CI Schema Drift Check

**Decision**: Add a step to CI that regenerates the schema and checks for uncommitted changes via `git diff --exit-code`.

**Rationale**: Simple, reliable, and standard pattern for generated-file checks. The existing CI already runs `nx affected -t build`, which triggers the schema generation. We add a post-build step that fails if the generated file differs from what's committed.

**Implementation**:
```yaml
- run: pnpm exec nx affected -t lint test build
- name: Check schema freshness
  run: git diff --exit-code packages/toride/schema/policy.schema.json
```

## R5: npm Package Distribution

**Decision**: Add `schema/` to the `files` array in `package.json` so it's included in the published package.

**Rationale**: FR-003 requires the schema to be available at `node_modules/toride/schema/policy.schema.json`. Currently `files` only includes `dist`. Adding `schema` is the minimal change.

**Note on public API (Constitution IV)**: The schema file path becomes a de facto public API surface. Document this in the changelog when shipping.

## R6: Docs Site Structure

**Decision**: Add a new "Reference" top-level section to the VitePress sidebar with CLI Reference and IDE Setup pages.

**Rationale**: CLI reference and IDE setup are practical reference material, distinct from conceptual docs (Concepts) and tutorial content (Guide). A dedicated section keeps the information architecture clean as more reference pages are added later.

**Pages**:
- `/reference/cli.md` — Documents `toride validate` and `toride test` commands
- `/reference/ide-setup.md` — VS Code setup with YAML extension + schema configuration

## R7: Schema Metadata for IDE Hover

**Decision**: The generator will add `title` and `description` fields to the top-level schema and key properties (FR-008).

**Rationale**: Editors with YAML language server support show `title`/`description` on hover, providing inline documentation. The descriptions will be derived from JSDoc comments where they exist in the valibot schema, and hand-written for key structural elements.
