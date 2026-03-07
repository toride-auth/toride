/**
 * Unit tests for the benchmark comparison script.
 *
 * Tests cover: normal comparison (no regressions), regressions >= 20%,
 * first run without baseline, new operations, missing operations,
 * markdown output format, threshold override, invalid input handling.
 */

import { describe, it, expect } from "vitest";
import {
  parseBenchmarkJson,
  compare,
  formatMarkdown,
  type BenchmarkResult,
  type ComparisonReport,
} from "./compare.js";

// ─── Test helpers ───────────────────────────────────────────────

/** Minimal vitest bench JSON with one benchmark entry. */
function makeVitestJson(
  benchmarks: Array<{
    name: string;
    median: number;
    mean: number;
    hz: number;
    sampleCount: number;
    min: number;
    max: number;
    p75: number;
    p99: number;
  }>,
): string {
  return JSON.stringify({
    files: [
      {
        filepath: "bench/operations.bench.ts",
        groups: [
          {
            fullName: "bench/operations.bench.ts > test",
            benchmarks: benchmarks.map((b, i) => ({
              id: `test_${i}`,
              name: b.name,
              rank: i + 1,
              rme: 0,
              samples: [],
              totalTime: 500,
              min: b.min,
              max: b.max,
              hz: b.hz,
              period: b.mean,
              mean: b.mean,
              variance: 0,
              sd: 0,
              sem: 0,
              df: b.sampleCount - 1,
              critical: 1.96,
              moe: 0,
              p75: b.p75,
              p99: b.p99,
              p995: 0,
              p999: 0,
              sampleCount: b.sampleCount,
              median: b.median,
            })),
          },
        ],
      },
    ],
  });
}

function makeBenchEntry(
  name: string,
  median: number,
): {
  name: string;
  median: number;
  mean: number;
  hz: number;
  sampleCount: number;
  min: number;
  max: number;
  p75: number;
  p99: number;
} {
  return {
    name,
    median,
    mean: median * 1.1,
    hz: 1000 / median,
    sampleCount: 10000,
    min: median * 0.9,
    max: median * 2.0,
    p75: median * 1.05,
    p99: median * 1.5,
  };
}

// ─── parseBenchmarkJson ─────────────────────────────────────────

describe("parseBenchmarkJson", () => {
  it("should parse vitest bench JSON into BenchmarkResult entries", () => {
    const json = makeVitestJson([
      makeBenchEntry("can - small", 0.002),
      makeBenchEntry("canBatch - medium", 0.01),
    ]);

    const result = parseBenchmarkJson(json, "abc1234", "2026-03-07T12:00:00Z");

    expect(result.commit).toBe("abc1234");
    expect(result.timestamp).toBe("2026-03-07T12:00:00Z");
    expect(result.entries).toHaveLength(2);

    expect(result.entries[0]).toEqual(
      expect.objectContaining({
        operation: "can",
        tier: "small",
        median: 0.002,
      }),
    );

    expect(result.entries[1]).toEqual(
      expect.objectContaining({
        operation: "canBatch",
        tier: "medium",
        median: 0.01,
      }),
    );
  });

  it("should handle multiple groups across files", () => {
    const json = JSON.stringify({
      files: [
        {
          filepath: "bench/operations.bench.ts",
          groups: [
            {
              fullName: "group1",
              benchmarks: [
                {
                  id: "1",
                  name: "can - small",
                  rank: 1,
                  rme: 0,
                  samples: [],
                  totalTime: 500,
                  min: 0.001,
                  max: 0.005,
                  hz: 500000,
                  period: 0.002,
                  mean: 0.002,
                  variance: 0,
                  sd: 0,
                  sem: 0,
                  df: 9999,
                  critical: 1.96,
                  moe: 0,
                  p75: 0.0025,
                  p99: 0.004,
                  p995: 0,
                  p999: 0,
                  sampleCount: 10000,
                  median: 0.002,
                },
              ],
            },
            {
              fullName: "group2",
              benchmarks: [
                {
                  id: "2",
                  name: "can - medium",
                  rank: 1,
                  rme: 0,
                  samples: [],
                  totalTime: 500,
                  min: 0.002,
                  max: 0.008,
                  hz: 333333,
                  period: 0.003,
                  mean: 0.003,
                  variance: 0,
                  sd: 0,
                  sem: 0,
                  df: 9999,
                  critical: 1.96,
                  moe: 0,
                  p75: 0.0035,
                  p99: 0.006,
                  p995: 0,
                  p999: 0,
                  sampleCount: 10000,
                  median: 0.003,
                },
              ],
            },
          ],
        },
      ],
    });

    const result = parseBenchmarkJson(json, "abc", "2026-01-01T00:00:00Z");
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].operation).toBe("can");
    expect(result.entries[0].tier).toBe("small");
    expect(result.entries[1].operation).toBe("can");
    expect(result.entries[1].tier).toBe("medium");
  });

  it("should throw on invalid JSON", () => {
    expect(() =>
      parseBenchmarkJson("not json", "abc", "2026-01-01T00:00:00Z"),
    ).toThrow();
  });

  it("should throw on JSON missing files array", () => {
    expect(() =>
      parseBenchmarkJson("{}", "abc", "2026-01-01T00:00:00Z"),
    ).toThrow();
  });
});

// ─── compare ────────────────────────────────────────────────────

describe("compare", () => {
  it("should report no regressions when PR is stable", () => {
    const baseline: BenchmarkResult = {
      commit: "base123",
      timestamp: "2026-03-07T12:00:00Z",
      entries: [
        {
          operation: "can",
          tier: "small",
          median: 0.002,
          mean: 0.0022,
          hz: 500000,
          samples: 10000,
          min: 0.001,
          max: 0.005,
          p75: 0.0025,
          p99: 0.004,
        },
        {
          operation: "canBatch",
          tier: "small",
          median: 0.01,
          mean: 0.011,
          hz: 100000,
          samples: 10000,
          min: 0.008,
          max: 0.02,
          p75: 0.012,
          p99: 0.018,
        },
      ],
    };

    const pr: BenchmarkResult = {
      commit: "pr456",
      timestamp: "2026-03-07T13:00:00Z",
      entries: [
        {
          operation: "can",
          tier: "small",
          median: 0.0021,
          mean: 0.0023,
          hz: 476190,
          samples: 10000,
          min: 0.001,
          max: 0.005,
          p75: 0.0026,
          p99: 0.004,
        },
        {
          operation: "canBatch",
          tier: "small",
          median: 0.0098,
          mean: 0.0108,
          hz: 102040,
          samples: 10000,
          min: 0.008,
          max: 0.02,
          p75: 0.012,
          p99: 0.018,
        },
      ],
    };

    const report = compare(baseline, pr, 0.2);

    expect(report.hasRegression).toBe(false);
    expect(report.baselineCommit).toBe("base123");
    expect(report.prCommit).toBe("pr456");
    expect(report.threshold).toBe(0.2);
    expect(report.comparisons).toHaveLength(2);
    expect(report.comparisons[0].status).toBe("stable");
    expect(report.comparisons[1].status).toBe("stable");
  });

  it("should detect regression when PR is >= 20% slower", () => {
    const baseline: BenchmarkResult = {
      commit: "base123",
      timestamp: "2026-03-07T12:00:00Z",
      entries: [
        {
          operation: "can",
          tier: "small",
          median: 0.002,
          mean: 0.0022,
          hz: 500000,
          samples: 10000,
          min: 0.001,
          max: 0.005,
          p75: 0.0025,
          p99: 0.004,
        },
      ],
    };

    const pr: BenchmarkResult = {
      commit: "pr456",
      timestamp: "2026-03-07T13:00:00Z",
      entries: [
        {
          operation: "can",
          tier: "small",
          median: 0.0025,
          mean: 0.0027,
          hz: 400000,
          samples: 10000,
          min: 0.002,
          max: 0.006,
          p75: 0.003,
          p99: 0.005,
        },
      ],
    };

    const report = compare(baseline, pr, 0.2);

    expect(report.hasRegression).toBe(true);
    expect(report.comparisons[0].status).toBe("regression");
    expect(report.comparisons[0].deltaPercent).toBeCloseTo(25.0, 1);
  });

  it("should detect improvement when PR is > 10% faster", () => {
    const baseline: BenchmarkResult = {
      commit: "base123",
      timestamp: "2026-03-07T12:00:00Z",
      entries: [
        {
          operation: "can",
          tier: "small",
          median: 0.01,
          mean: 0.011,
          hz: 100000,
          samples: 10000,
          min: 0.008,
          max: 0.02,
          p75: 0.012,
          p99: 0.018,
        },
      ],
    };

    const pr: BenchmarkResult = {
      commit: "pr456",
      timestamp: "2026-03-07T13:00:00Z",
      entries: [
        {
          operation: "can",
          tier: "small",
          median: 0.008,
          mean: 0.0088,
          hz: 125000,
          samples: 10000,
          min: 0.006,
          max: 0.016,
          p75: 0.0096,
          p99: 0.014,
        },
      ],
    };

    const report = compare(baseline, pr, 0.2);

    expect(report.hasRegression).toBe(false);
    expect(report.comparisons[0].status).toBe("improvement");
    expect(report.comparisons[0].deltaPercent).toBeCloseTo(-20.0, 1);
  });

  it("should report 'new' for operations in PR but not baseline", () => {
    const baseline: BenchmarkResult = {
      commit: "base123",
      timestamp: "2026-03-07T12:00:00Z",
      entries: [
        {
          operation: "can",
          tier: "small",
          median: 0.002,
          mean: 0.0022,
          hz: 500000,
          samples: 10000,
          min: 0.001,
          max: 0.005,
          p75: 0.0025,
          p99: 0.004,
        },
      ],
    };

    const pr: BenchmarkResult = {
      commit: "pr456",
      timestamp: "2026-03-07T13:00:00Z",
      entries: [
        {
          operation: "can",
          tier: "small",
          median: 0.002,
          mean: 0.0022,
          hz: 500000,
          samples: 10000,
          min: 0.001,
          max: 0.005,
          p75: 0.0025,
          p99: 0.004,
        },
        {
          operation: "newOp",
          tier: "small",
          median: 0.005,
          mean: 0.0055,
          hz: 200000,
          samples: 10000,
          min: 0.004,
          max: 0.01,
          p75: 0.006,
          p99: 0.008,
        },
      ],
    };

    const report = compare(baseline, pr, 0.2);

    expect(report.hasRegression).toBe(false);
    const newEntry = report.comparisons.find((c) => c.operation === "newOp");
    expect(newEntry).toBeDefined();
    expect(newEntry!.status).toBe("new");
  });

  it("should report 'missing' for operations in baseline but not PR", () => {
    const baseline: BenchmarkResult = {
      commit: "base123",
      timestamp: "2026-03-07T12:00:00Z",
      entries: [
        {
          operation: "can",
          tier: "small",
          median: 0.002,
          mean: 0.0022,
          hz: 500000,
          samples: 10000,
          min: 0.001,
          max: 0.005,
          p75: 0.0025,
          p99: 0.004,
        },
        {
          operation: "removed",
          tier: "small",
          median: 0.003,
          mean: 0.0033,
          hz: 333333,
          samples: 10000,
          min: 0.002,
          max: 0.006,
          p75: 0.0035,
          p99: 0.005,
        },
      ],
    };

    const pr: BenchmarkResult = {
      commit: "pr456",
      timestamp: "2026-03-07T13:00:00Z",
      entries: [
        {
          operation: "can",
          tier: "small",
          median: 0.002,
          mean: 0.0022,
          hz: 500000,
          samples: 10000,
          min: 0.001,
          max: 0.005,
          p75: 0.0025,
          p99: 0.004,
        },
      ],
    };

    const report = compare(baseline, pr, 0.2);

    expect(report.hasRegression).toBe(false);
    const missingEntry = report.comparisons.find(
      (c) => c.operation === "removed",
    );
    expect(missingEntry).toBeDefined();
    expect(missingEntry!.status).toBe("missing");
  });

  it("should use custom threshold", () => {
    const baseline: BenchmarkResult = {
      commit: "base123",
      timestamp: "2026-03-07T12:00:00Z",
      entries: [
        {
          operation: "can",
          tier: "small",
          median: 0.01,
          mean: 0.011,
          hz: 100000,
          samples: 10000,
          min: 0.008,
          max: 0.02,
          p75: 0.012,
          p99: 0.018,
        },
      ],
    };

    const pr: BenchmarkResult = {
      commit: "pr456",
      timestamp: "2026-03-07T13:00:00Z",
      entries: [
        {
          operation: "can",
          tier: "small",
          median: 0.011,
          mean: 0.012,
          hz: 90909,
          samples: 10000,
          min: 0.009,
          max: 0.022,
          p75: 0.013,
          p99: 0.02,
        },
      ],
    };

    // With default 20% threshold, 10% regression is stable
    const reportDefault = compare(baseline, pr, 0.2);
    expect(reportDefault.hasRegression).toBe(false);
    expect(reportDefault.comparisons[0].status).toBe("stable");

    // With 5% threshold, 10% regression IS a regression
    const reportStrict = compare(baseline, pr, 0.05);
    expect(reportStrict.hasRegression).toBe(true);
    expect(reportStrict.comparisons[0].status).toBe("regression");
  });

  it("should handle first-ever run (no baseline entries) without regression", () => {
    // Simulates the case where baseline has no benchmark data (first run)
    const baseline: BenchmarkResult = {
      commit: "unknown",
      timestamp: "2026-03-07T12:00:00Z",
      entries: [],
    };

    const pr: BenchmarkResult = {
      commit: "pr456",
      timestamp: "2026-03-07T13:00:00Z",
      entries: [
        {
          operation: "can",
          tier: "small",
          median: 0.002,
          mean: 0.0022,
          hz: 500000,
          samples: 10000,
          min: 0.001,
          max: 0.005,
          p75: 0.0025,
          p99: 0.004,
        },
        {
          operation: "canBatch",
          tier: "small",
          median: 0.01,
          mean: 0.011,
          hz: 100000,
          samples: 10000,
          min: 0.008,
          max: 0.02,
          p75: 0.012,
          p99: 0.018,
        },
      ],
    };

    const report = compare(baseline, pr, 0.2);

    // First run should never flag regressions
    expect(report.hasRegression).toBe(false);
    // All PR entries should be reported as "new"
    expect(report.comparisons).toHaveLength(2);
    expect(report.comparisons.every((c) => c.status === "new")).toBe(true);
  });

  it("should handle new operation end-to-end via parseBenchmarkJson + compare", () => {
    // Baseline has one operation; PR adds a second
    const baselineJson = makeVitestJson([makeBenchEntry("can - small", 0.002)]);
    const prJson = makeVitestJson([
      makeBenchEntry("can - small", 0.0021),
      makeBenchEntry("newOp - small", 0.005),
    ]);

    const baselineResult = parseBenchmarkJson(
      baselineJson,
      "base123",
      "2026-03-07T12:00:00Z",
    );
    const prResult = parseBenchmarkJson(
      prJson,
      "pr456",
      "2026-03-07T13:00:00Z",
    );

    const report = compare(baselineResult, prResult, 0.2);

    expect(report.hasRegression).toBe(false);

    const canEntry = report.comparisons.find((c) => c.operation === "can");
    expect(canEntry).toBeDefined();
    expect(canEntry!.status).toBe("stable");

    const newEntry = report.comparisons.find((c) => c.operation === "newOp");
    expect(newEntry).toBeDefined();
    expect(newEntry!.status).toBe("new");
    expect(newEntry!.baselineMedian).toBe(0);
    expect(newEntry!.prMedian).toBe(0.005);
  });

  it("should handle empty entries gracefully", () => {
    const baseline: BenchmarkResult = {
      commit: "base123",
      timestamp: "2026-03-07T12:00:00Z",
      entries: [],
    };

    const pr: BenchmarkResult = {
      commit: "pr456",
      timestamp: "2026-03-07T13:00:00Z",
      entries: [],
    };

    const report = compare(baseline, pr, 0.2);

    expect(report.hasRegression).toBe(false);
    expect(report.comparisons).toHaveLength(0);
  });
});

// ─── formatMarkdown ─────────────────────────────────────────────

describe("formatMarkdown", () => {
  it("should produce a valid markdown table with header", () => {
    const report: ComparisonReport = {
      baselineCommit: "abc1234",
      prCommit: "def5678",
      timestamp: "2026-03-07T12:00:00Z",
      threshold: 0.2,
      hasRegression: false,
      comparisons: [
        {
          operation: "can",
          tier: "small",
          baselineMedian: 0.002,
          prMedian: 0.0021,
          deltaPercent: 5.0,
          status: "stable",
        },
        {
          operation: "canBatch",
          tier: "medium",
          baselineMedian: 0.01,
          prMedian: 0.008,
          deltaPercent: -20.0,
          status: "improvement",
        },
      ],
    };

    const md = formatMarkdown(report);

    // Should contain header
    expect(md).toContain("## Benchmark Comparison");
    expect(md).toContain("abc1234");
    expect(md).toContain("def5678");
    expect(md).toContain("20%");

    // Should contain table headers
    expect(md).toContain("| Operation |");
    expect(md).toContain("| Tier |");

    // Should contain benchmark rows
    expect(md).toContain("can");
    expect(md).toContain("small");
    expect(md).toContain("canBatch");
    expect(md).toContain("medium");

    // Should contain status labels
    expect(md).toContain("stable");
    expect(md).toContain("improvement");
  });

  it("should show regression status", () => {
    const report: ComparisonReport = {
      baselineCommit: "abc1234",
      prCommit: "def5678",
      timestamp: "2026-03-07T12:00:00Z",
      threshold: 0.2,
      hasRegression: true,
      comparisons: [
        {
          operation: "can",
          tier: "large",
          baselineMedian: 0.01,
          prMedian: 0.013,
          deltaPercent: 30.0,
          status: "regression",
        },
      ],
    };

    const md = formatMarkdown(report);
    expect(md).toContain("regression");
  });

  it("should show new and missing statuses", () => {
    const report: ComparisonReport = {
      baselineCommit: "abc1234",
      prCommit: "def5678",
      timestamp: "2026-03-07T12:00:00Z",
      threshold: 0.2,
      hasRegression: false,
      comparisons: [
        {
          operation: "newOp",
          tier: "small",
          baselineMedian: 0,
          prMedian: 0.005,
          deltaPercent: 0,
          status: "new",
        },
        {
          operation: "oldOp",
          tier: "small",
          baselineMedian: 0.003,
          prMedian: 0,
          deltaPercent: 0,
          status: "missing",
        },
      ],
    };

    const md = formatMarkdown(report);
    expect(md).toContain("new");
    expect(md).toContain("missing");
  });

  it("should render first-run informational message when no comparisons exist", () => {
    const report: ComparisonReport = {
      baselineCommit: "unknown",
      prCommit: "def5678",
      timestamp: "2026-03-07T12:00:00Z",
      threshold: 0.2,
      hasRegression: false,
      comparisons: [],
    };

    const md = formatMarkdown(report);
    expect(md).toContain("No significant regressions detected.");
    expect(md).not.toContain("regressed beyond");
  });

  it("should render 'new' entries with dash for baseline column", () => {
    const report: ComparisonReport = {
      baselineCommit: "abc1234",
      prCommit: "def5678",
      timestamp: "2026-03-07T12:00:00Z",
      threshold: 0.2,
      hasRegression: false,
      comparisons: [
        {
          operation: "newOp",
          tier: "small",
          baselineMedian: 0,
          prMedian: 0.005,
          deltaPercent: 0,
          status: "new",
        },
      ],
    };

    const md = formatMarkdown(report);
    // The baseline column for "new" operations should show a dash
    const lines = md.split("\n");
    const newOpLine = lines.find((l) => l.includes("newOp"));
    expect(newOpLine).toBeDefined();
    // Baseline column should contain a dash (em dash)
    expect(newOpLine).toMatch(/\|\s*—\s*\|/);
  });

  it("should format timing values in human-readable units", () => {
    const report: ComparisonReport = {
      baselineCommit: "abc1234",
      prCommit: "def5678",
      timestamp: "2026-03-07T12:00:00Z",
      threshold: 0.2,
      hasRegression: false,
      comparisons: [
        {
          operation: "can",
          tier: "small",
          baselineMedian: 0.002,
          prMedian: 0.0021,
          deltaPercent: 5.0,
          status: "stable",
        },
      ],
    };

    const md = formatMarkdown(report);
    // Should format timing values in human-readable units (us for microseconds, ms for milliseconds)
    expect(md).toMatch(/\d+\.\d+\s+(ms|us|ns)/);
  });
});
