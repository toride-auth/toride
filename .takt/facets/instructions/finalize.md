# Finalize Instruction

## Steps

1. Clean up the code:
   - Remove any TODO comments
   - Ensure documentation is complete
   - Verify all tests pass
   - Clean up debug code

2. **Commit all changes** (this is mandatory — always commit, regardless of `--skip-git` or any other flags):
   - Identify the merge base with the main branch: `git merge-base HEAD main`
   - Soft-reset to the merge base: `git reset --soft <merge-base>`
   - Stage all changes: `git add -A`
   - Create a single clean commit with a descriptive conventional commit message
   - The commit message must follow Conventional Commits format (see CLAUDE.md)

3. Push the branch to the remote

4. Create a PR using `gh pr create` with:
   - A clear title
   - A summary of changes, test plan, and review results
   - References to the plan and review outcomes

## References

- {report_dir}/plan.md — original requirements
- {report_dir}/review.md — review findings (if available)
- Review feedback from {previous_response}

## Routing

Output one of the following tags:
- `[STEP:0]` — PR created successfully
- `[STEP:1]` — Something went wrong
