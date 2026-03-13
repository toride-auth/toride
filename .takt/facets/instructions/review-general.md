# General Review Instruction

## Steps

1. Read the implementation report from {report_dir}/implementation.md (if available)
2. Read the actual code changes and evaluate:
   - Correctness: Does it meet the spec requirements?
   - Code quality: Is it readable, maintainable, and well-structured?
   - Tests: Are they sufficient and correct?
   - Security: Any obvious vulnerabilities?
3. Be pragmatic — only reject for real issues, not style preferences

## Routing

Output one of the following tags:
- `[STEP:0]` — Implementation is acceptable (APPROVED)
- `[STEP:1]` — Changes needed (provide specific, actionable feedback)
