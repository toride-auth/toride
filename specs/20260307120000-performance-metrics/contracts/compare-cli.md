# Contract: Benchmark Comparison Script CLI

## Invocation

```bash
npx tsx packages/toride/bench/compare.ts \
  --baseline <path-to-baseline.json> \
  --current <path-to-current.json> \
  --threshold 0.20 \
  --output <path-to-report.json> \
  [--markdown <path-to-summary.md>]
```

## Arguments

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `--baseline` | Yes* | — | Path to baseline vitest bench JSON output |
| `--current` | Yes | — | Path to current (PR) vitest bench JSON output |
| `--threshold` | No | `0.20` | Regression threshold as a decimal (0.20 = 20%) |
| `--output` | No | stdout | Path to write the ComparisonReport JSON |
| `--markdown` | No | — | Path to write the markdown summary table |

*If `--baseline` is omitted or the file doesn't exist, the script treats this as a first run: outputs the current results as the report and exits 0.

## Exit Codes

| Code | Meaning |
|------|---------|
| 0 | No regressions detected (or first run without baseline) |
| 1 | One or more operations regressed beyond threshold |
| 2 | Script error (invalid input, missing files, parse error) |

## Output: ComparisonReport JSON

See data-model.md `ComparisonReport` interface.

## Output: Markdown Summary

When `--markdown` is specified, produces a markdown file with:

```markdown
## Benchmark Comparison

**Baseline**: `abc1234` | **PR**: `def5678` | **Threshold**: 20%

| Operation | Tier | Baseline | PR | Delta | Status |
|-----------|------|----------|-----|-------|--------|
| can() | small | 1.23 us | 1.25 us | +1.6% | stable |
| can() | large | 1.50 us | 1.90 us | +26.7% | regression |
```

Status icons: regression, improvement (> 10% faster), stable, new (no baseline), missing (removed)
