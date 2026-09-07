# Source map

| Concern | Start here | Follow to |
|---|---|---|
| Public core API | `packages/toride/src/index.ts` | `engine.ts`, `client.ts`, `snapshot.ts` |
| Engine decisions | `packages/toride/src/engine.ts` | `evaluation/rule-engine.ts`, `evaluation/` |
| Policy language | `packages/toride/src/types.ts` | `policy/parser.ts`, `schema.ts`, `validator.ts`, `merger.ts` |
| Role/condition semantics | `packages/toride/src/evaluation/` | `rule-engine.ts`, derived-role and condition tests |
| List authorization | `packages/toride/src/partial/` | `constraint-types.ts`, builder, translator, tests |
| Field permissions | `packages/toride/src/field-access.ts` | `field-access.test.ts` |
| Client hints | `packages/toride/src/snapshot.ts`, `client.ts` | snapshot/client tests |
| Generated policy bindings | `packages/codegen/src/generator.ts` | `cli.ts`, `generator.test.ts` |
| Prisma integration | `packages/prisma/src/index.ts` | adapter tests, type tests, `docs/integrations/prisma.md` |
| Drizzle integration | `packages/drizzle/src/index.ts` | adapter tests, type tests, `docs/integrations/drizzle.md` |
| Executable example | `examples/prisma-app/src/engine.ts` | `policy.yaml`, routes, Prisma schema/seed |
| User-facing concepts | `docs/concepts/` | conditions, roles, partial evaluation, policy format |
| User-facing setup | `docs/guide/` | quickstart, getting started |
| CI/release | `.github/workflows/` | `ci.yml`, `publish.yml`, docs workflows |
| Workspace orchestration | `package.json`, `nx.json` | package manifests, `pnpm-workspace.yaml` |

## Navigation advice

Start with the core type and engine files rather than generated `dist/`. Use tests as executable contracts, especially `packages/toride/src/__integration__/` and `__typetests__/`. For a behavior change, trace from the public method to evaluation/partial internals, then inspect both adapter packages and relevant docs.
