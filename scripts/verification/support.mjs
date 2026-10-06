import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const evidence = process.env.TORIDE_VERIFY_EVIDENCE;
export const scratch = process.env.TORIDE_VERIFY_SCRATCH;
assert(evidence && scratch, 'Run through scripts/verification/verify.sh');

export function recorder(feature) {
  const cases = [];
  function save() {
    writeFileSync(join(evidence, `${feature}.json`), JSON.stringify({ feature, cases }, null, 2) + '\n');
  }
  return {
    async check(id, input, expected, action) {
      const entry = { id, input, expected, passed: false };
      cases.push(entry);
      save();
      try {
        entry.actual = await action();
        assert.deepEqual(entry.actual, expected);
        entry.passed = true;
      } catch (error) {
        entry.error = { name: error.name, message: error.message, stack: error.stack };
      }
      save();
      console.log(`${entry.passed ? 'PASS' : 'FAIL'} ${id}`);
    },
    finish() {
      save();
      const failed = cases.filter((entry) => !entry.passed);
      console.log(JSON.stringify({ feature, checks: cases.length, failures: failed.map(({ id }) => id) }));
      if (failed.length) process.exitCode = 1;
    },
  };
}
