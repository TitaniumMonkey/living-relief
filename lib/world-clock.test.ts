import assert from 'node:assert/strict';
import test from 'node:test';
import { formatWorldTime } from './world-clock.ts';

void test('world clock carries rounded minutes into the next hour and wraps midnight', () => {
  assert.equal(formatWorldTime(6.5), '06:30');
  assert.equal(formatWorldTime(14.999), '15:00');
  assert.equal(formatWorldTime(23.999), '00:00');
  assert.equal(formatWorldTime(24), '00:00');
});
