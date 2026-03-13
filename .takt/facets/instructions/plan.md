# Planning Instruction

## Steps

1. Read the spec directory referenced in the task description
2. Load all available design documents:
   - plan.md (tech stack, architecture, file structure)
   - spec.md (user stories with priorities)
   - data-model.md (entities and relationships)
   - contracts/ (interface contracts)
   - research.md (technical decisions)
   - quickstart.md (integration scenarios)
3. Analyze architecture and design decisions
4. Identify files to create or modify
5. Assess risks and edge cases
6. Define a testing strategy
7. If the task includes test sub-tasks, plan for TDD (tests first, verify they fail, then implement)

## Routing

Output one of the following tags:
- `[STEP:0]` — Plan is ready to proceed
- `[STEP:1]` — Blocked: unresolved questions requiring human input

Write the plan to {report_dir}/plan.md
