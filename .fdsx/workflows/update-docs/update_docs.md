You are updating the toride documentation site to reflect the current source code and improve the developer experience.

## Source Data
{collected_data}

## Analysis of Issues
{analysis}

## Your Task

Update the documentation files in the `docs/` directory to fix all accuracy issues found in the analysis and apply the suggested quality improvements. You have full access to read and edit files.

**Rules:**
1. Preserve the existing VitePress structure, writing style, and frontmatter format
2. Fix ALL accuracy issues identified in the analysis — these are non-negotiable
3. Apply quality improvements where they meaningfully help the reader
4. Ensure all TypeScript code examples compile and match the actual exported API from `packages/toride/src/index.ts`
5. Ensure all YAML policy examples use correct field names and valid syntax per the source code
6. Keep examples practical and user-friendly — show real-world patterns, not just API reference
7. Every code example should be self-contained enough that a reader can understand what it does
8. Use consistent naming in examples across pages (e.g., same actor/resource names where it makes sense)
9. Add cross-references (links) between related docs pages where helpful
10. Do NOT add new doc pages unless specifically identified as needed in the analysis
11. Do NOT change the VitePress config unless the analysis identifies a specific issue
12. Preserve existing content that is already correct — do not rewrite for the sake of rewriting
13. Keep the tone professional but approachable — this is developer documentation, not academic writing
14. Ensure "What's Next" sections at the bottom of pages link to relevant pages

**Focus areas for user-friendliness:**
- The Getting Started and Quickstart pages should be the easiest to follow
- Every concept page should have at least one complete, copy-pasteable example
- Integration pages should show end-to-end workflows (install → configure → use)
- Error cases and edge cases should be documented where relevant

**IMPORTANT:** Edit the files directly using your tools. Read each file before editing to ensure correct replacements.
