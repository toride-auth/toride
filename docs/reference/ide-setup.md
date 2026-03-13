# IDE Setup Guide

Configure your editor to use the Toride JSON Schema for policy file validation.

## Generated Schema

Toride generates a JSON Schema at `schema/policy.schema.json` during build. This schema provides:

- Auto-completion for policy keys
- Inline error squiggles for invalid values
- Type hints for roles, relations, and conditions

## VS Code Setup

### Prerequisites

Install the [Red Hat YAML](https://marketplace.visualstudio.com/items?itemName=redhat.vscode-yaml) extension for VS Code.

### Method 1: Per-file Schema Comment

Add a schema comment at the top of your policy file:

```yaml
# yaml-language-server: $schema=node_modules/toride/schema/policy.schema.json
version: "1"

actors:
  User:
    attributes:
      id: string

resources:
  Document:
    roles: [viewer, editor]
    permissions: [read, write]
    grants:
      admin: [all]

global_roles:
  admin:
    actor_type: User
    when:
      $actor.isAdmin: true
```

Replace the path with the appropriate location based on your project structure.

### Method 2: Workspace Settings

Add schema association in `.vscode/settings.json`:

```json
{
  "yaml.schemas": {
    "node_modules/toride/schema/policy.schema.json": ["**/policy.yaml", "**/policy.yml"]
  }
}
```

Or for a specific file pattern:

```json
{
  "yaml.schemas": {
    "node_modules/toride/schema/policy.schema.json": ["policy.yaml", "policies/*.yaml"]
  }
}
```

### Method 3: JSON Schema URL (for published packages)

If using the published npm package, reference the schema via URL:

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/toride-auth/toride/main/packages/toride/schema/policy.schema.json
```

> **Note**: URL-based schemas require internet access and may have slower validation.

## Other Editors

Most editors that support YAML Language Server can use the JSON Schema:

### JetBrains IDEs (IntelliJ, WebStorm, etc.)

1. Open Settings → Languages & Frameworks → Schemas and DTDs → JSON Schema Mappings
2. Add a new schema with the path to `policy.schema.json`
3. Configure file path patterns (e.g., `policy.yaml`, `policies/*.yaml`)

### Neovim with YAML Language Server

Add to your `lspconfig` setup:

```lua
require('lspconfig').yamlls.setup({
  settings = {
    yaml = {
      schemas = {
        ["path/to/node_modules/toride/schema/policy.schema.json"] = {
          "policy.yaml",
          "policies/*.yaml"
        }
      }
    }
  }
})
```

## Verification

To verify your setup is working:

1. Open a policy YAML file in your editor
2. Add an invalid key (e.g., `invalidKey: true`)
3. You should see a red squiggle under the invalid key
4. Hover over the squiggle to see the error message

If you're not seeing validation errors:

1. Check that the YAML extension is enabled
2. Verify the schema path is correct
3. Try restarting the language server (VS Code: `Ctrl+Shift+P` → "YAML: Restart Language Server")
