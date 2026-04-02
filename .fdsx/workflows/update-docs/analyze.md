You are analyzing the toride documentation site against the current source code to find discrepancies and areas for improvement.

Below is a dump of the current docs content and the toride source code across all packages.

{collected_data}

## Your Task

Compare the **source code** (the ground truth) against the **current documentation site** (in the `docs/` directory). Identify ALL discrepancies and improvement opportunities, including:

### Accuracy Issues
1. **New features** in source code not documented anywhere in the docs
2. **Removed features** documented in the docs but no longer in source code
3. **Changed behavior** — API methods renamed, parameters added/removed, defaults changed
4. **Incorrect examples** — TypeScript snippets or YAML examples that no longer match the actual API
5. **Wrong type signatures** — documented types that differ from the actual exported types
6. **Missing exports** — public API exports not mentioned in any doc page
7. **Outdated CLI commands** — CLI flags or arguments that have changed

### Quality Improvements
8. **Missing user-friendly examples** — concepts explained without practical code examples
9. **Unclear explanations** — sections that could benefit from better wording or more context
10. **Missing cross-references** — pages that should link to related docs but don't
11. **Incomplete pages** — doc pages that seem stubby or unfinished compared to the feature's actual capabilities
12. **Missing "common patterns"** — real-world usage patterns that would help users get started faster

### Structure Issues
13. **Missing pages** — features that deserve their own doc page but don't have one
14. **VitePress config issues** — sidebar items that don't match actual files, or missing navigation entries

Be thorough and precise. For each issue, cite:
- The source file and relevant code (function signatures, type definitions, etc.)
- The doc file and section that's wrong, missing, or could be improved
- What the correct or improved documentation should say

Structure your output as:

### Accuracy Issues
(list each issue with source evidence)

### Quality Improvements
(list each improvement suggestion with context)

### Structure Issues
(list any structural problems)

### Summary
- Total accuracy issues found: N
- Total quality improvements suggested: N
- Total structure issues found: N
- Doc files needing updates: (list file paths)

End your response with exactly one of these keywords:
- CHANGES_NEEDED — if any accuracy issues were found OR significant quality improvements are suggested
- UP_TO_DATE — if the docs accurately reflect the source code and are already high quality
