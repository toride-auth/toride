# Re-plan Instruction

## Context

The reviewer has rejected the implementation. Your job is to analyze the review feedback and create a targeted fix plan.

## Steps

1. Read the review feedback from {previous_response}
2. Read the review report from {report_dir}/review.md (if available)
3. Read the original plan from {report_dir}/plan.md
4. For each review finding:
   - Identify the root cause
   - Determine the minimal fix
   - Assess whether the fix affects other parts of the plan
5. Update {report_dir}/plan.md with a revised plan that:
   - Preserves completed items (mark as done)
   - Adds fix items for each review finding
   - Reorders if dependencies changed
   - Notes which files need modification

## Important

- Do NOT re-plan from scratch — build on the existing plan
- Focus only on addressing the review findings
- Do NOT expand scope beyond what the reviewer flagged

## Routing

Output one of the following tags:
- `[STEP:0]` — Fix plan is ready to proceed
- `[STEP:1]` — Blocked: the review findings reveal fundamental design issues requiring human input
