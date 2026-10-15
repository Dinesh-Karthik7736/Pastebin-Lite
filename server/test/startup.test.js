import assert from 'node:assert/strict';
import { test } from 'node:test';
import { initializeWithRetry } from '../src/startup.js';

test('retries transient database initialization failures with capped backoff', async () => {
  let calls = 0;
  const delays = [];

  await initializeWithRetry(async () => {
    calls += 1;
    if (calls < 4) throw new Error('temporary connection timeout');
  }, {
    attempts: 5,
    initialDelayMs: 10,
    maxDelayMs: 20,
    wait: async (milliseconds) => delays.push(milliseconds)
  });

  assert.equal(calls, 4);
  assert.deepEqual(delays, [10, 20, 20]);
});

test('rethrows the final database initialization failure', async () => {
  let calls = 0;

  await assert.rejects(initializeWithRetry(async () => {
    calls += 1;
    throw new Error('database unavailable');
  }, {
    attempts: 3,
    initialDelayMs: 1,
    wait: async () => {}
  }), /database unavailable/);

  assert.equal(calls, 3);
});
