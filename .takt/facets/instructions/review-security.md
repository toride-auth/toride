# Security Review Instruction

## Steps

1. Read the implementation report from {report_dir}/implementation.md (if available)
2. Read the plan from {report_dir}/plan.md for context
3. Review the actual code changes, focusing exclusively on:
   - OWASP Top 10 vulnerabilities
   - Input validation and sanitization
   - Authentication and authorization flaws
   - Injection attacks (SQL, command, XSS)
   - Sensitive data exposure
   - Insecure deserialization
   - Dependency vulnerabilities
   - Secrets or credentials in code

## Routing

Output one of the following:
- `approved` — No security issues found
- `needs_fix` — Security issues found (provide specific findings and remediation)
