# Testing and quality

## Local commands

Root scripts in `package.json` delegate to Nx:

```bash
pnpm test
pnpm lint
pnpm build
```

For focused work, use `pnpm exec nx run <project>:<target>`; for a change set, use `pnpm exec nx affected -t lint test build`. `lint` is primarily strict TypeScript checking rather than a separate formatting linter. Nx caches build, test, and lint targets.

The core package also has type tests (`pnpm exec nx run toride:typetest`). The workspace Vitest configuration is in `vitest.workspace.ts`.

## Coverage by layer

- Core unit tests under `packages/toride/src/**/*.test.ts`: parser, validation, conditions, role derivation, relation traversal, caching, field access, snapshots, explain output, and engine behavior.
- Core integration tests under `packages/toride/src/__integration__/`: end-to-end policy/resolver/engine paths, including partial evaluation and default resolvers.
- Type tests under `__typetests__/`: schema narrowing, client/engine methods, adapters, resolver contracts, and generated API safety.
- Codegen, Prisma, and Drizzle adapter tests: translation and output contracts.
- Snapshots: policy schema generation and related serialized output.
- Benchmarks under `packages/toride/bench/`: operation comparisons and performance regression signals.

When changing a policy semantic, begin in core tests and add integration coverage; when changing only a translator, update the relevant adapter tests and type tests. When changing policy syntax or schema, regenerate `packages/toride/schema/policy.schema.json` and update schema snapshots.

## CI gates

`.github/workflows/ci.yml` installs with `pnpm install --frozen-lockfile`, runs Nx affected lint/test/build, and verifies the generated policy JSON Schema with `git diff --exit-code`. A local build can pass while CI still fails if the schema artifact was not regenerated.

The benchmark workflow compares the PR against `origin/main` with a regression threshold and distinguishes infrastructure failures from confirmed regressions. Treat benchmark changes as a separate performance contract, not merely a flaky test.

## Debugging failures

- Type failures after a policy change: inspect generated declarations and `TorideSchema` maps.
- Wrong allow/deny result: use `explain`, then inspect role resolution, condition attributes, and forbid precedence.
- Wrong list result: inspect the three-state `buildConstraints` result and adapter translation separately.
- Schema CI failure: regenerate the schema from the core package’s schema-generation path and commit the checked-in artifact.
