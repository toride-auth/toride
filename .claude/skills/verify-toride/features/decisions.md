# Authorization decisions

Applications call Toride before a protected operation and inspect explanations and resolved roles when a decision needs investigation.

## Sub-features

- `failed-forbid` denies when a relevant forbid cannot resolve data and retains diagnostic evidence.
- `absence` distinguishes explicit null from omitted partial fields and resolver exceptions.
- `derived-roles` applies operators and supplied environment values consistently to role derivation.
- `related-roles` follows the declared target and denies a wrong resource type.
- `decision-helpers` exposes the allowed resource's roles and permitted actions.

## How to get to it (user POV)

- Import `Toride` and `loadJson` from `toride`.
- Load a policy, provide resolvers, and call `can(actor, action, resource, options)`.
- Call `explain`, `resolvedRoles`, or `permittedActions` on the same actor and resource.

## Driving it with verify-toride

Preconditions:

- Launch and Doctor completed for this run.
- The public ESM exports come from the fresh package build.

- **Check failure precedence.** Run `scripts/verification/verify.sh drive decisions "$run_dir"`. The clear, blocked, and throwing resolver cases return `[true, false, false]`; the throwing explanation denies and includes a resolver diagnostic.
- **Check absence.** The explicit-null, present-value, omitted-field, and throwing `exists:false` cases return `[true, false, false, false]`.
- **Check roles and helpers.** Global and local `gte:2` roles return `[true, true, false, false]` at levels 3 and 1. Supplied true, false, and omitted environment values return `[true, false, false]` for both derivation routes. Public, private, and wrongly typed related resources return `[true, false, false]`. The allowed resource reports `['viewer']` and `['read']`.
- **Retain proof.** Read `decisions.json` and `drive-decisions.log` in the run directory. Require every case to pass and the drive to exit 0.

## Gotchas

- An omitted value is unavailable. Explicit null is known absence.
- A healthy allow must accompany each failure denial; blanket denial is insufficient proof.
- Explanation evidence must survive resolver failure without exposing arbitrary raw error or data payloads.
- Role derivation and ordinary rules are separate public routes and both need coverage.
