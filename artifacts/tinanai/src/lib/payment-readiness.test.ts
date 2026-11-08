import assert from 'node:assert/strict';
import { test } from 'node:test';
import { confirmationsError, countChecks, tokenStateLabel } from './payment-readiness.ts';

test('frontend never accepts fewer than 12 or more than 100 confirmations on either network', () => {
  for (const network of ['Ethereum Mainnet', 'Sepolia']) {
    for (const value of [2, 11, 101, 12.5, NaN, Infinity, '12', null]) assert.ok(confirmationsError(value, network));
    for (const value of [12, 13, 100]) assert.equal(confirmationsError(value, network), null);
  }
});
test('unverified token state remains unknown and mandatory blocked checks are counted', () => {
  assert.match(tokenStateLabel(null), /Unknown/);
  assert.match(tokenStateLabel(false), /failed/);
  assert.deepEqual(countChecks([{ status: 'PASS', mandatory: true }, { status: 'BLOCKED', mandatory: true },
    { status: 'NOT_TESTED', mandatory: false }]), { PASS: 1, FAIL: 0, BLOCKED: 1, NOT_TESTED: 1, mandatoryOpen: 1 });
});
