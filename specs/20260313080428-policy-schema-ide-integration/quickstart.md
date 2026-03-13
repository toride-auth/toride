# Quickstart: Policy JSON Schema & IDE Integration

## For Users (IDE validation)

### 1. Install toride

```bash
npm install toride
```

### 2. Add schema comment to your policy file

```yaml
# yaml-language-server: $schema=node_modules/toride/schema/policy.schema.json
version: "1"
actors:
  User:
    attributes:
      role: string
resources:
  Document:
    roles: [viewer, editor]
    permissions: [read, write]
    grants:
      viewer: [read]
      editor: [read, write]
```

### 3. Install VS Code YAML extension

Install the [Red Hat YAML extension](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml) in VS Code. Schema validation works immediately with the comment above.

### Alternative: workspace-wide settings

Add to `.vscode/settings.json`:
```json
{
  "yaml.schemas": {
    "./node_modules/toride/schema/policy.schema.json": ["*.policy.yaml", "*.policy.yml"]
  }
}
```

---

## For Contributors (schema generation)

### Build with schema generation

```bash
cd packages/toride
pnpm run build
# tsup compiles TypeScript → dist/
# onSuccess hook runs scripts/generate-schema.mjs → schema/policy.schema.json
```

### Verify schema is up to date

```bash
git diff --exit-code packages/toride/schema/policy.schema.json
```

### Run tests

```bash
pnpm exec nx run toride:test
```

### Development workflow

1. Modify valibot schemas in `src/policy/schema.ts`
2. Run `pnpm run build` — schema regenerates automatically
3. Verify schema output looks correct
4. Commit both `schema.ts` changes and regenerated `policy.schema.json`
