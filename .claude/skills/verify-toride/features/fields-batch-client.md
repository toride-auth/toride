# Fields, batches, and client permissions

Applications ask for field permissions, batch repeated checks, and send snapshots to a synchronous client checker.

## Sub-features

- `fields` bounds declared field access by the resource decision.
- `inline-batch` preserves individual results in both orders for repeated identity with different inline values.
- `resolver-batch` preserves those results when the resolver depends on the complete ref.
- `snapshot-client` carries resource denial into serialized permissions and client checks.
- `action-enumeration` preserves individual decisions in permitted actions and snapshots, in either permission order.

## How to get to it (user POV)

- Call `canField` or `permittedFields` after loading the policy.
- Call `canBatch(actor, [{action,resource}, ...])` with the same inputs used by individual `can` calls.
- Call `snapshot(actor, resources)` and construct `TorideClient` from `toride/client`.
- Call the client's synchronous `can` and `permittedActions` methods.

## Driving it with verify-toride

Preconditions:

- Launch and Doctor completed for the built core and `toride/client` exports.

- **Check fields.** Run `scripts/verification/verify.sh drive fields-batch-client "$run_dir"`. Clear-resource read and secret-field read both allow; blocked-resource read and secret-field read both deny. Declared field lists are `[['secret'],[]]`.
- **Reverse batch inputs.** Individual results are `[true,false]`; the forward batch is `[true,false]`; the reverse batch is `[false,true]`. The script repeats this for inline data and a ref-dependent resolver.
- **Check the client.** The snapshot is `{'Document:clear':['read'],'Document:blocked':[]}`. Client checks return `[true,false,false]` for clear, blocked, and missing resources. The clear resource's permitted actions are `['read']`.
- **Reverse permission order.** With an absent Project or known null value, individual `inspect` and `read` decisions are `[true,false]`. Both declared permission orders produce only `['inspect']` in permitted actions and the snapshot, and client checks remain `[true,false]`.
- **Retain proof.** Read `fields-batch-client.json` and its drive log. Require every listed route and exit code 0.

## Gotchas

- Repeated `type:id` values can carry different inline observations. First-encounter cache results must not decide another batch item.
- A resolver may inspect the whole ref. A cache shared by identity alone needs an independence contract the public API does not provide.
- A role that grants a field cannot override resource denial.
- Observing absence for one action cannot suppress an unresolved forbid for another action during enumeration or snapshot creation.
- A client snapshot is a point-in-time permission result; server checks still protect mutations.
