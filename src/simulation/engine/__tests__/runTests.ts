/**
 * runTests.ts: Determinism Test Suite Runner
 * Runs headless per plan (1).md Section 14 (14 tests).
 */

import { runAllTests } from './SimEngine.test.ts';

console.log('===============================================================');
console.log(' SIMENGINE HEADLESS DETERMINISM TEST SUITE (plan (1).md §14)');
console.log('===============================================================\n');

const { passed, failed, results } = runAllTests();

results.forEach((r) => console.log(r));

console.log('\n---------------------------------------------------------------');
console.log(`Results: ${passed} PASSED, ${failed} FAILED (Total: ${passed + failed})`);
console.log('---------------------------------------------------------------');

if (failed > 0) {
  console.error('\n❌ TEST SUITE FAILED!');
  process.exit(1);
} else {
  console.log('\n✅ ALL 14 TESTS PASSED WITH 100% DETERMINISM!');
  process.exit(0);
}
