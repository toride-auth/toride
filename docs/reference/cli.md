# CLI Reference

Toride provides CLI commands for validating policies and running tests.

## `toride validate`

Validates a policy file for structural correctness and optionally performs cross-reference validation.

**Synopsis**: `toride validate [--strict] <policy-file>`

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<policy-file>` | Yes | Path to a YAML or JSON policy file |

### Flags

| Flag | Description |
|------|-------------|
| `--strict` | Enable cross-reference validation (undeclared roles, broken relations, etc.) in addition to structural validation |

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | Policy is valid |
| `1` | Validation failed (errors printed to stderr) |

### Output

**Success:**
```
Policy is valid.
```

With `--strict` flag (if there are warnings):
```
Policy is valid (with warnings).
```

**Failure:**
```
Error: <message>
```

### Examples

```bash
# Validate a policy file
toride validate policy.yaml

# Validate with strict mode (cross-reference checks)
toride validate --strict policy.yaml
```

---

## `toride test`

Runs tests defined in policy files to verify policy behavior.

**Synopsis**: `toride test <file-or-glob> [...]`

### Arguments

| Argument | Required | Description |
|----------|----------|-------------|
| `<file-or-glob>` | Yes (one or more) | Policy files with inline tests, `.test.yaml` files, or glob patterns |

### Test file formats

#### Inline tests

Policy file with a `tests:` section:

```yaml
version: "1"

actors:
  User:
    attributes:
      id: string

resources:
  Document:
    roles: [viewer, editor, admin]
    permissions: [read, write]
    grants:
      admin: [all]

global_roles:
  admin:
    actor_type: User
    when:
      $actor.isAdmin: true

tests:
  - name: admin can read any document
    actor:
      type: User
      id: "user-1"
      attributes:
        isAdmin: true
    resource:
      type: Document
      id: "doc-123"
    action: read
    expected: allow
```

#### Separate test file

A `*.test.yaml` file containing `policy:` (relative path) and `tests:` array:

```yaml
policy: ./policy.yaml

tests:
  - name: admin can read any document
    actor:
      type: User
      id: "user-1"
      attributes:
        isAdmin: true
    resource:
      type: Document
      id: "doc-123"
    action: read
    expected: allow
```

### Exit codes

| Code | Meaning |
|------|---------|
| `0` | All tests passed |
| `1` | One or more tests failed |

### Output

**Per test:**
- Pass: `✓ <name>`
- Fail: `✗ <name>` with expected/actual on failure

**Summary:**
- `N tests passed`
- `N passed, M failed`

### Examples

```bash
# Run tests in a single file
toride test policy.test.yaml

# Run tests with glob pattern
toride test "**/*.test.yaml"

# Run multiple specific files
toride test policy.test.yaml another-test.yaml
```
