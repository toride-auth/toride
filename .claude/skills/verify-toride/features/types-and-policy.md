# Policy and typed consumers

Applications validate policies, generate policy types, and compile consumers whose resource attributes, relation targets, and query outputs match those types.

## Sub-features

- `validate-cli` accepts a valid policy and rejects an invalid policy.
- `codegen-cli` emits the same generated types as the public API.
- `valid-consumer` compiles a valid resolver and the example's generated policy types.
- `native-client` compiles a selected helper against an actual generated Prisma Client.
- `negative-consumers` rejects wrong attributes, relation targets, actor data, action-resource pairs, cross-resource translation, and complete claims about selected data.

## How to get to it (user POV)

- Run the published `toride validate <policy>` CLI.
- Run `toride-codegen <policy> -o <generated.ts>` or call `generateTypes` from `@toride/codegen`.
- Import `GeneratedSchema` into a TypeScript application using `Toride`, `ResourceResolver`, and an ORM helper.

## Driving it with verify-toride

Preconditions:

- Launch and Doctor completed for fresh public declarations and CLI builds.
- The workspace TypeScript compiler is installed.
- The local Prisma client can generate with the owned JS engine configuration.

- **Validate and generate.** Run `scripts/verification/verify.sh drive types-and-policy "$run_dir"`. The valid CLI exits 0 and prints `Policy is valid.`; the invalid CLI exits 1 with an error. Codegen exits 0 and its output matches the public API.
- **Compile valid input.** The generated consumer with a string tenant and Organization relation compiles with exit code 0. The example policy's generated declarations compile alongside it.
- **Compile native selection.** The actual generated Prisma Client accepts a typed Document helper selecting `tenant`. After excluding known null, reading the optional `blocked` value as `boolean|undefined` compiles; otherwise-identical code requiring `boolean` fails with the selected-field assignment diagnostic.
- **Reject invalid input.** Separate consumer files fail compilation for numeric tenant data, a Document ref in an Organization relation, a string boolean actor attribute, `manage` on Document, a Document constraint translated as Organization, and a selected record claimed complete. Each failure has TypeScript diagnostics and exit code 2.
- **Reject raw relation selections.** A native helper cannot select `project` as a Toride relation ref. Both direct and variable selection objects fail with the intended selection diagnostic.
- **Retain proof.** Read `types-and-policy.json`, the generated files, each `reject-*.ts` input, and each compiler log.

## Gotchas

- A dependency failure could make every negative consumer fail. Require the positive consumer to compile first.
- Selected-field and native relation selection negatives require their specific diagnostic. An unrelated invalid client argument does not prove either boundary.
- Use the adapter's declared schema, model-map, and query-map generic positions. A caller-selected resource parameter must not change a constraint's identity.
- CLI invocation uses the built published bin files. Source-only compilation is a different route.
