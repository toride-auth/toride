# Performance Review Instruction

## Steps

1. Read the implementation report from {report_dir}/implementation.md (if available)
2. Read the plan from {report_dir}/plan.md for context
3. Review the actual code changes, focusing exclusively on:
   - Algorithmic complexity (time and space)
   - Unnecessary allocations or copies
   - N+1 query patterns or redundant I/O
   - Missing caching opportunities
   - Memory leaks or unbounded growth
   - Blocking operations in hot paths
   - Bundle size impact

## Routing

Output one of the following:
- `approved` — No performance concerns found
- `needs_fix` — Performance issues found (provide specific optimization recommendations)
