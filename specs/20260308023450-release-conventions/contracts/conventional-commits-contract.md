# Contract: Conventional Commits Format

## Commit Message Schema

```
<type>[optional scope][optional !]: <description>

[optional body]

[optional footer(s)]
```

## Allowed Types

| Type | Description | Version Impact |
|------|-------------|----------------|
| `feat` | New feature | minor |
| `fix` | Bug fix | patch |
| `perf` | Performance improvement | patch |
| `refactor` | Code refactoring | patch |
| `docs` | Documentation only | patch |
| `test` | Adding/updating tests | patch |
| `chore` | Maintenance tasks | patch |
| `ci` | CI/CD changes | patch |
| `build` | Build system changes | patch |

## Allowed Scopes

Optional. When used, must be one of: `toride`, `codegen`, `drizzle`, `prisma`

## Breaking Changes

Two syntaxes (both trigger major bump):
1. `type!: description` (bang suffix)
2. Footer: `BREAKING CHANGE: description`

## Enforcement Layers

1. **CLAUDE.md instructions**: Claude Code generates compliant messages automatically
2. **Lefthook commit-msg hook**: commitlint validates format, rejects non-compliant commits

## Examples

```
feat(drizzle): add query constraint builder
fix: resolve policy parsing edge case with nested relations
feat!: redesign RelationResolver interface
refactor(toride): extract evaluation pipeline into separate module
docs: update README with constraint builder examples
chore: update dependencies

BREAKING CHANGE: RelationResolver now requires async resolve method
```
