# Contract: CLI Commands

## `toride validate`

**Synopsis**: `toride validate [--strict] <policy-file>`

**Arguments**:
| Argument | Required | Description |
|----------|----------|-------------|
| `<policy-file>` | Yes | Path to a YAML or JSON policy file |

**Flags**:
| Flag | Description |
|------|-------------|
| `--strict` | Enable cross-reference validation (undeclared roles, broken relations, etc.) in addition to structural validation |

**Exit codes**:
| Code | Meaning |
|------|---------|
| `0` | Policy is valid |
| `1` | Validation failed (errors printed to stderr) |

**Output**:
- Success: `Policy is valid.` (or `Policy is valid (with warnings).` in strict mode)
- Failure: `Error: <message>` lines to stderr

---

## `toride test`

**Synopsis**: `toride test <file-or-glob> [...]`

**Arguments**:
| Argument | Required | Description |
|----------|----------|-------------|
| `<file-or-glob>` | Yes (one or more) | Policy files with inline tests, `.test.yaml` files, or glob patterns |

**Test file formats**:
1. **Inline tests**: Policy file with a `tests:` section
2. **Separate test file** (`*.test.yaml`): Contains `policy:` (relative path) and `tests:` array

**Exit codes**:
| Code | Meaning |
|------|---------|
| `0` | All tests passed |
| `1` | One or more tests failed |

**Output**:
- Per-test: `✓ <name>` or `✗ <name>` with expected/actual on failure
- Summary: `N tests passed` or `N passed, M failed`
