# CLI Contract: `toride` Command

**Phase 1 Output** | **Date**: 2026-03-06

## Commands

### `toride validate`

Validates a policy file and reports errors.

```bash
toride validate <policy-file>
toride validate ./policy.yaml
toride validate ./policy.json
```

**Exit codes**:
- `0`: Policy is valid
- `1`: Validation errors found

**Output on error**:
```
Error: resources.Task.grants references undeclared role "edtor"
Error: resources.Project.derived_roles[1].on_relation references unknown relation "projects" (did you mean "project"?)
```

### `toride validate --strict`

Includes static analysis warnings in addition to errors.

```bash
toride validate --strict ./policy.yaml
```

**Additional checks**:
- Unreachable rules (conditions that can never match given the declared types)
- Unused roles (declared but never referenced in grants or derived_roles)
- Redundant derived_roles (same role derived via multiple identical patterns)

**Output**:
```
Warning: resources.Document.roles includes "commenter" which is never used in grants or derived_roles
Warning: resources.Task.rules[0] references permission "archive" which is not declared
```

**Exit codes**:
- `0`: No errors (warnings are informational)
- `1`: Validation errors found (warnings alone don't cause failure)

### `toride test`

Runs declarative YAML test cases against a policy.

```bash
# Test inline tests in a policy file
toride test ./policy.yaml

# Test a separate test file
toride test ./policy.test.yaml

# Glob pattern for multiple test files
toride test './tests/**/*.test.yaml'
```

**Output on success**:
```
  ✓ editor can update tasks
  ✓ viewer cannot delete tasks
  ✓ superadmin can delete via global role
  ✓ forbid rule blocks update on completed project

4 tests passed
```

**Output on failure**:
```
  ✓ editor can update tasks
  ✗ viewer cannot delete tasks
    Expected: deny
    Got: allow
  ✓ superadmin can delete via global role

2 passed, 1 failed
```

**Exit codes**:
- `0`: All tests passed
- `1`: One or more tests failed

## CLI Entry Point

The CLI is part of the `toride` package:

```json
{
  "bin": {
    "toride": "./dist/cli.js"
  }
}
```

Invocation: `npx toride <command> [options] <args>`
