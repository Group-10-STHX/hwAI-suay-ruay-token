import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canBribe, checkVoucher } from '../bribe.mjs';

test('canBribe: only when sulking or waiting for forgiveness', () => {
  for (const s of ['SULKING', 'FORGIVE']) assert.equal(canBribe(s), true);
  for (const s of ['IDLE', 'DEMANDING', 'RETRY', 'ANNOYED', 'PASSED', 'RAGE_QUIT']) assert.equal(canBribe(s), false);
});

test('checkVoucher: mock rules only', () => {
  assert.equal(checkVoucher('').ok, false);
  assert.equal(checkVoucher('   ').ok, false);
  assert.equal(checkVoucher('abc').ok, false);
  assert.equal(checkVoucher('11111111').ok, false);
  assert.equal(checkVoucher('x'.repeat(201)).ok, false);
  assert.equal(checkVoucher('0123456789abcdef').ok, true);
  assert.equal(checkVoucher(undefined).ok, false);
});
