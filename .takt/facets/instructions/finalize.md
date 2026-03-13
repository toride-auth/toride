# Finalize Instruction

## Steps

1. Clean up the code:
   - Remove any TODO comments
   - Ensure documentation is complete
   - Verify all tests pass
   - Clean up debug code
2. Commit all changes with a descriptive conventional commit message
3. Push the branch to the remote
4. Create a PR using `gh pr create` with:
   - A clear title
   - A summary of changes, test plan, and review results
   - References to the plan and review outcomes

## References

- {report_dir}/plan.md — original requirements
- Review feedback from {previous_response}

## Routing

Output one of the following tags:
- `[STEP:0]` — PR created successfully
- `[STEP:1]` — Something went wrong
