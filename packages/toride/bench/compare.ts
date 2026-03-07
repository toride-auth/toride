/**
 * Benchmark comparison script.
 *
 * Core comparison logic exported as pure functions for testability.
 * CLI wrapper at the bottom handles process.argv and process.exit.
 *
 * Exit codes:
 *   0 — No regressions detected (or first run without baseline)
 *   1 — One or more operations regressed beyond threshold
 *   2 — Script error (invalid input, missing files, parse error)
 */

import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";

// ─── Types ──────────────────────────────────────────────────────

export interface BenchmarkEntry {
  operation: string;
  tier: string;
  median: number;
  mean: number;
  hz: number;
  samples: number;
  min: number;
  max: number;
  p75: number;
  p99: number;
}

export interface BenchmarkResult {
  commit: string;
  timestamp: string;
  entries: BenchmarkEntry[];
}

export interface ComparisonEntry {
  operation: string;
  tier: string;
  baselineMedian: number;
  prMedian: number;
  deltaPercent: number;
  status: "regression" | "improvement" | "stable" | "new" | "missing";
}

export interface ComparisonReport {
  baselineCommit: string;
  prCommit: string;
  timestamp: string;
  threshold: number;
  hasRegression: boolean;
  comparisons: ComparisonEntry[];
}

// ─── Vitest bench JSON types (input format) ─────────────────────

interface VitestBenchmark {
  name: string;
  median: number;
  mean: number;
  hz: number;
  sampleCount: number;
  min: number;
  max: number;
  p75: number;
  p99: number;
}

interface VitestGroup {
  fullName: string;
  benchmarks: VitestBenchmark[];
}

interface VitestFile {
  filepath: string;
  groups: VitestGroup[];
}

interface VitestBenchJson {
  files: VitestFile[];
}

// ─── Core functions ─────────────────────────────────────────────

/**
 * Parse vitest bench JSON output into a normalized BenchmarkResult.
 *
 * Extracts operation and tier from benchmark names using the
 * "{operation} - {tier}" naming convention.
 */
export function parseBenchmarkJson(
  jsonString: string,
  commit: string,
  timestamp: string,
): BenchmarkResult {
  let parsed: VitestBenchJson;
  try {
    parsed = JSON.parse(jsonString) as VitestBenchJson;
  } catch {
    throw new Error("Failed to parse benchmark JSON: invalid JSON");
  }

  if (!parsed.files || !Array.isArray(parsed.files)) {
    throw new Error(
      "Failed to parse benchmark JSON: missing or invalid 'files' array",
    );
  }

  const entries: BenchmarkEntry[] = [];

  for (const file of parsed.files) {
    for (const group of file.groups) {
      for (const bench of group.benchmarks) {
        const match = bench.name.match(/^(.+?)\s*-\s*(.+)$/);
        if (!match) {
          continue; // Skip benchmarks that don't follow naming convention
        }

        const [, operation, tier] = match;
        entries.push({
          operation: operation.trim(),
          tier: tier.trim(),
          median: bench.median,
          mean: bench.mean,
          hz: bench.hz,
          samples: bench.sampleCount,
          min: bench.min,
          max: bench.max,
          p75: bench.p75,
          p99: bench.p99,
        });
      }
    }
  }

  return { commit, timestamp, entries };
}

/**
 * Compare PR benchmark results against baseline results.
 *
 * Returns a ComparisonReport with per-operation-tier deltas and
 * an overall hasRegression flag.
 *
 * @param baseline - Baseline (main branch) benchmark results
 * @param pr - PR branch benchmark results
 * @param threshold - Regression threshold as a decimal (e.g., 0.20 = 20%)
 */
export function compare(
  baseline: BenchmarkResult,
  pr: BenchmarkResult,
  threshold: number,
): ComparisonReport {
  const comparisons: ComparisonEntry[] = [];

  // Build lookup maps keyed by "operation:tier"
  const baselineMap = new Map<string, BenchmarkEntry>();
  for (const entry of baseline.entries) {
    baselineMap.set(`${entry.operation}:${entry.tier}`, entry);
  }

  const prMap = new Map<string, BenchmarkEntry>();
  for (const entry of pr.entries) {
    prMap.set(`${entry.operation}:${entry.tier}`, entry);
  }

  // Compare entries present in both, and detect missing entries
  for (const [key, baseEntry] of baselineMap) {
    const prEntry = prMap.get(key);

    if (!prEntry) {
      comparisons.push({
        operation: baseEntry.operation,
        tier: baseEntry.tier,
        baselineMedian: baseEntry.median,
        prMedian: 0,
        deltaPercent: 0,
        status: "missing",
      });
      continue;
    }

    const deltaPercent =
      baseEntry.median === 0
        ? 0
        : ((prEntry.median - baseEntry.median) / baseEntry.median) * 100;

    let status: ComparisonEntry["status"];
    if (deltaPercent >= threshold * 100) {
      status = "regression";
    } else if (deltaPercent <= -10) {
      status = "improvement";
    } else {
      status = "stable";
    }

    comparisons.push({
      operation: baseEntry.operation,
      tier: baseEntry.tier,
      baselineMedian: baseEntry.median,
      prMedian: prEntry.median,
      deltaPercent,
      status,
    });
  }

  // Detect new operations (in PR but not baseline)
  for (const [key, prEntry] of prMap) {
    if (!baselineMap.has(key)) {
      comparisons.push({
        operation: prEntry.operation,
        tier: prEntry.tier,
        baselineMedian: 0,
        prMedian: prEntry.median,
        deltaPercent: 0,
        status: "new",
      });
    }
  }

  const hasRegression = comparisons.some((c) => c.status === "regression");

  return {
    baselineCommit: baseline.commit,
    prCommit: pr.commit,
    timestamp: new Date().toISOString(),
    threshold,
    hasRegression,
    comparisons,
  };
}

/**
 * Format a ComparisonReport as a markdown summary table.
 */
export function formatMarkdown(report: ComparisonReport): string {
  const thresholdPct = Math.round(report.threshold * 100);
  const lines: string[] = [];

  lines.push("## Benchmark Comparison");
  lines.push("");
  lines.push(
    `**Baseline**: \`${report.baselineCommit}\` | **PR**: \`${report.prCommit}\` | **Threshold**: ${thresholdPct}%`,
  );
  lines.push("");
  lines.push(
    "| Operation | Tier | Baseline | PR | Delta | Status |",
  );
  lines.push(
    "|-----------|------|----------|-----|-------|--------|",
  );

  for (const c of report.comparisons) {
    const baselineStr =
      c.status === "new" ? "—" : formatTime(c.baselineMedian);
    const prStr = c.status === "missing" ? "—" : formatTime(c.prMedian);
    const deltaStr = formatDelta(c);
    const statusStr = c.status;

    lines.push(
      `| ${c.operation} | ${c.tier} | ${baselineStr} | ${prStr} | ${deltaStr} | ${statusStr} |`,
    );
  }

  lines.push("");

  if (report.hasRegression) {
    lines.push(
      `**Result**: One or more operations regressed beyond the ${thresholdPct}% threshold.`,
    );
  } else {
    lines.push("**Result**: No significant regressions detected.");
  }

  return lines.join("\n");
}

// ─── Formatting helpers ─────────────────────────────────────────

function formatTime(ms: number): string {
  if (ms >= 1) {
    return `${ms.toFixed(2)} ms`;
  }
  // Convert to microseconds for very small values
  const us = ms * 1000;
  if (us >= 1) {
    return `${us.toFixed(2)} us`;
  }
  // Convert to nanoseconds
  const ns = ms * 1_000_000;
  return `${ns.toFixed(2)} ns`;
}

function formatDelta(c: ComparisonEntry): string {
  if (c.status === "new" || c.status === "missing") {
    return "—";
  }
  const sign = c.deltaPercent >= 0 ? "+" : "";
  return `${sign}${c.deltaPercent.toFixed(1)}%`;
}

// ─── CLI entrypoint ─────────────────────────────────────────────

function parseArgs(
  argv: string[],
): {
  baseline?: string;
  current?: string;
  threshold: number;
  output?: string;
  markdown?: string;
} {
  const args: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--") && i + 1 < argv.length) {
      args[argv[i].slice(2)] = argv[i + 1];
      i++;
    }
  }

  return {
    baseline: args["baseline"],
    current: args["current"],
    threshold: args["threshold"] ? parseFloat(args["threshold"]) : 0.2,
    output: args["output"],
    markdown: args["markdown"],
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!args.current) {
    console.error("Error: --current argument is required");
    process.exit(2);
  }

  // Read current results
  let currentJson: string;
  try {
    currentJson = await readFile(args.current, "utf-8");
  } catch {
    console.error(`Error: cannot read current file: ${args.current}`);
    process.exit(2);
  }

  let currentResult: BenchmarkResult;
  try {
    const commit = process.env["GITHUB_SHA"] ?? "unknown";
    const timestamp = new Date().toISOString();
    currentResult = parseBenchmarkJson(currentJson, commit, timestamp);
  } catch (err) {
    console.error(
      `Error: failed to parse current benchmark JSON: ${err instanceof Error ? err.message : err}`,
    );
    process.exit(2);
  }

  // If no baseline, treat as first run
  if (!args.baseline || !existsSync(args.baseline)) {
    console.log("No baseline found. First run — skipping comparison.");
    if (args.output) {
      await writeFile(args.output, JSON.stringify(currentResult, null, 2));
    }
    process.exit(0);
  }

  // Read baseline results
  let baselineJson: string;
  try {
    baselineJson = await readFile(args.baseline, "utf-8");
  } catch {
    console.error(`Error: cannot read baseline file: ${args.baseline}`);
    process.exit(2);
  }

  let baselineResult: BenchmarkResult;
  try {
    const commit = process.env["BASELINE_SHA"] ?? "unknown";
    const timestamp = new Date().toISOString();
    baselineResult = parseBenchmarkJson(baselineJson, commit, timestamp);
  } catch (err) {
    console.error(
      `Error: failed to parse baseline benchmark JSON: ${err instanceof Error ? err.message : err}`,
    );
    process.exit(2);
  }

  // Compare
  const report = compare(baselineResult, currentResult, args.threshold);

  // Write outputs
  if (args.output) {
    await writeFile(args.output, JSON.stringify(report, null, 2));
    console.log(`Comparison report written to ${args.output}`);
  } else {
    console.log(JSON.stringify(report, null, 2));
  }

  if (args.markdown) {
    const md = formatMarkdown(report);
    await writeFile(args.markdown, md);
    console.log(`Markdown summary written to ${args.markdown}`);
  }

  // Exit with appropriate code
  if (report.hasRegression) {
    console.error(
      `Performance regression detected: ${report.comparisons.filter((c) => c.status === "regression").length} operation(s) regressed beyond ${Math.round(args.threshold * 100)}% threshold`,
    );
    process.exit(1);
  }

  console.log("No significant regressions detected.");
  process.exit(0);
}

// Only run CLI when executed directly (not imported by tests)
const isDirectExecution =
  typeof process !== "undefined" &&
  process.argv[1] &&
  (process.argv[1].endsWith("compare.ts") ||
    process.argv[1].endsWith("compare.js"));

if (isDirectExecution) {
  main().catch((err) => {
    console.error(`Unexpected error: ${err}`);
    process.exit(2);
  });
}
