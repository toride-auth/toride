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
- **Check related absence.** A known clear, known blocked, and null Project resolver return `[true,false,false]` when a permit compares the related ID. Both rule orders produce that result. A missing environment operand under a forbid denies a null one relation but allows an empty many traversal, returning `[false,true]`.
- **Check roles and helpers.** Global and local `gte:2` roles return `[true, true, false, false]` at levels 3 and 1. Supplied true, false, and omitted environment values return `[true, false, false]` for both derivation routes. Public, private, and wrongly typed related resources return `[true, false, false]`. The allowed resource reports `['viewer']` and `['read']`.
- **Check traversal context.** Both role orders deny at depth 2 and allow at depth 3, for permits and forbids; each shallow explanation includes `depth_limit` at `Tail.tail`. An independent route through a cyclic graph allows in both role orders, returning `[true,true]`.
- **Retain proof.** Read `decisions.json` and `drive-decisions.log` in the run directory. Require every case to pass and the drive to exit 0.

## Gotchas

- An omitted value is unavailable. Explicit null is known absence.
- A ref's ID does not prove its row exists. Observe the related resource before an ID condition permits access.
- A null one relation and an empty many traversal have different condition outcomes when a static operand is unavailable.
- A healthy allow must accompany each failure denial; blanket denial is insufficient proof.
- Explanation evidence must survive resolver failure without exposing arbitrary raw error or data payloads.
- Role derivation and ordinary rules are separate public routes and both need coverage.
- A role outcome depends on its remaining traversal depth and visited path. A result observed on another branch cannot decide it.
