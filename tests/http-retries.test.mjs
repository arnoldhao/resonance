import test from 'node:test';
import assert from 'node:assert/strict';
import { readPublic } from '../scripts/http.mjs';

const url = 'https://charts.example/list.json';
const connectionError = code => new TypeError('fetch failed', { cause: Object.assign(new Error('connection failed'), { code }) });

function captureRetries(t) {
  const delays = [];
  const warnings = t.mock.method(console, 'warn', () => {});
  const successes = t.mock.method(console, 'log', () => {});
  return { delays, warnings, successes, sleepImpl: async delay => { delays.push(delay); } };
}

test('a failed source recovers on its third request while a successful source is read once', async t => {
  const retry = captureRetries(t);
  const calls = { stable: 0, flaky: 0 };
  t.mock.method(globalThis, 'fetch', async requestURL => {
    const source = new URL(requestURL).pathname.slice(1);
    calls[source]++;
    if (source === 'flaky' && calls.flaky < 3) throw connectionError(calls.flaky === 1 ? 'ETIMEDOUT' : 'ECONNRESET');
    return Response.json({ source });
  });
  const results = await Promise.all(['stable', 'flaky'].map(source => readPublic(`https://charts.example/${source}`, { sleepImpl: retry.sleepImpl })));
  assert.deepEqual(results, [{ source: 'stable' }, { source: 'flaky' }]);
  assert.deepEqual(calls, { stable: 1, flaky: 3 });
  assert.deepEqual(retry.delays, [5_000, 10_000]);
  assert.equal(retry.warnings.mock.callCount(), 2);
  assert.match(retry.successes.mock.calls[0].arguments[0], /3\/3/);
});

test('network failures stop after three attempts and retain their underlying causes', async t => {
  const retry = captureRetries(t);
  const errors = ['ETIMEDOUT', 'ENETUNREACH'].map(code => Object.assign(new Error('connection failed'), { code }));
  const request = t.mock.method(globalThis, 'fetch', async () => {
    throw new TypeError('fetch failed', { cause: new AggregateError(errors) });
  });
  await assert.rejects(readPublic(url, { sleepImpl: retry.sleepImpl }), error => {
    assert.match(error.message, /ETIMEDOUT/);
    assert.match(error.message, /ENETUNREACH/);
    return true;
  });
  assert.equal(request.mock.callCount(), 3);
  assert.deepEqual(retry.delays, [5_000, 10_000]);
  assert.equal(retry.successes.mock.callCount(), 0);
});

test('a response body interrupted by a socket failure is requested again', async t => {
  const retry = captureRetries(t);
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    if (calls === 1) return new Response(new ReadableStream({
      start(controller) { controller.error(connectionError('UND_ERR_SOCKET')); },
    }));
    return Response.json({ complete: true });
  });
  assert.deepEqual(await readPublic(url, { sleepImpl: retry.sleepImpl }), { complete: true });
  assert.equal(calls, 2);
  assert.deepEqual(retry.delays, [5_000]);
});

test('a temporary HTTP failure is retried and its response body is released', async t => {
  const retry = captureRetries(t);
  let canceled = false;
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => {
    calls++;
    if (calls === 1) return new Response(new ReadableStream({
      cancel() { canceled = true; },
    }), { status: 503 });
    return Response.json({ recovered: true });
  });
  assert.deepEqual(await readPublic(url, { sleepImpl: retry.sleepImpl }), { recovered: true });
  assert.equal(canceled, true);
  assert.equal(calls, 2);
  assert.deepEqual(retry.delays, [5_000]);
});

test('permanent HTTP errors and malformed JSON are reported without retrying', async t => {
  const retry = captureRetries(t);
  const request = t.mock.method(globalThis, 'fetch', async () => new Response('missing', { status: 404 }));
  await assert.rejects(readPublic(url, { sleepImpl: retry.sleepImpl }), /HTTP 404/);
  assert.equal(request.mock.callCount(), 1);
  request.mock.mockImplementation(async () => new Response('{invalid json'));
  await assert.rejects(readPublic(url, { sleepImpl: retry.sleepImpl }), SyntaxError);
  assert.equal(request.mock.callCount(), 2);
  assert.deepEqual(retry.delays, []);
});
