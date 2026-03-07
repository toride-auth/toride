/**
 * Benchmark suite for all 9 Toride engine operations across 3 policy tiers.
 *
 * 27 total benchmark cases: 9 operations x 3 tiers (small, medium, large).
 * Naming convention: "{operation} - {tier}"
 *
 * Run with: pnpm exec nx run toride:bench
 */

import { describe, bench, beforeAll } from "vitest";
import { createBenchEngine, type BenchEngine, type Tier } from "./helpers/setup.js";

const tiers: Tier[] = ["small", "medium", "large"];

// Pre-initialize all engines at module level so benchmarks have data ready.
const engines: Record<string, BenchEngine> = {};

for (const tier of tiers) {
  engines[tier] = await createBenchEngine(tier);
}

for (const tier of tiers) {
  const { engine, testData: t } = engines[tier];

  describe(tier, () => {
    bench(`can - ${tier}`, async () => {
      await engine.can(t.actor, t.action, t.resource);
    });

    bench(`canBatch - ${tier}`, async () => {
      await engine.canBatch(t.actor, t.batchChecks);
    });

    bench(`permittedActions - ${tier}`, async () => {
      await engine.permittedActions(t.actor, t.resource);
    });

    bench(`buildConstraints - ${tier}`, async () => {
      await engine.buildConstraints(t.actor, t.action, t.resourceType);
    });

    bench(`explain - ${tier}`, async () => {
      await engine.explain(t.actor, t.action, t.resource);
    });

    bench(`snapshot - ${tier}`, async () => {
      await engine.snapshot(t.actor, t.resources);
    });

    bench(`canField - ${tier}`, async () => {
      await engine.canField(t.actor, t.fieldOperation, t.resource, t.field);
    });

    bench(`permittedFields - ${tier}`, async () => {
      await engine.permittedFields(t.actor, t.fieldOperation, t.resource);
    });

    bench(`resolvedRoles - ${tier}`, async () => {
      await engine.resolvedRoles(t.actor, t.resource);
    });
  });
}
