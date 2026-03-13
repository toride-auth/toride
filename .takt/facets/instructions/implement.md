# Implementation Instruction

## Steps

1. Read the plan from {report_dir}/plan.md
2. If review feedback exists in {report_dir}/review.md, address ALL findings from every reviewer
3. Implement changes following project coding standards (see CLAUDE.md)
4. Follow TDD when the task includes test sub-tasks: write tests FIRST, verify they FAIL, then implement
5. Handle edge cases identified in the plan
6. Track progress: mark completed sub-tasks as done [X] in the spec's tasks.md
7. Commit after each sub-task or logical group of sub-tasks

## Routing

Output one of the following tags:
- `[STEP:0]` — Implementation complete
- `[STEP:1]` — Encountered an unrecoverable error
