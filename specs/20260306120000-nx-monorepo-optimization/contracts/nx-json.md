# Contract: nx.json Configuration

The root `nx.json` file configures Nx workspace behavior.

```json
{
  "extends": "nx/presets/npm.json",
  "defaultBase": "main",
  "namedInputs": {
    "default": ["{projectRoot}/**/*"],
    "production": [
      "default",
      "!{projectRoot}/**/*.spec.ts",
      "!{projectRoot}/**/*.test.ts",
      "!{projectRoot}/vitest.config.*"
    ]
  },
  "targetDefaults": {
    "build": {
      "cache": true,
      "dependsOn": ["^build"],
      "inputs": ["production", "^production"],
      "outputs": ["{projectRoot}/dist"]
    },
    "test": {
      "cache": true,
      "inputs": ["default", "^production"]
    },
    "lint": {
      "cache": true,
      "inputs": ["default", "^production"]
    }
  }
}
```

## Key Behaviors

- `dependsOn: ["^build"]` ensures `toride` core builds before satellite packages
- `production` named input excludes test files so test changes don't invalidate build cache
- `test` and `lint` targets cache exit codes only (no `outputs` — they produce no files)
- `defaultBase: "main"` used by `nx affected` to determine changed files

## Project Tags (per package.json)

Each package adds an `nx` key:

```json
{ "nx": { "tags": ["type:core"] } }        // toride
{ "nx": { "tags": ["type:codegen"] } }      // codegen
{ "nx": { "tags": ["type:integration"] } }  // drizzle, prisma
```
