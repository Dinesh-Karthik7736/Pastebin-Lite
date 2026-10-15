import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PGlite } from '@electric-sql/pglite';

process.env.DATABASE_URL ||= 'postgresql://pastebox_test:pastebox_test@localhost:5432/pastebox_test';
const { createApp } = await import('../src/app.js');
const here = path.dirname(fileURLToPath(import.meta.url));
const schema = await readFile(path.join(here, '../src/schema.sql'), 'utf8');
let database;
let server;
let baseUrl;
let cache;
let listQueryCount;

function createTestCache() {
  const entries = new Map();
  return {
    entries,
    async get(key) { return entries.get(key) ?? null; },
    async set(key, value) { entries.set(key, value); },
    async deleteByPrefix(prefix) {
      for (const key of entries.keys()) if (key.startsWith(prefix)) entries.delete(key);
    }
  };
}

async function request(pathname, { method = 'GET', body, headers = {} } = {}) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method,
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const payload = await response.json();
  return { response, payload };
}

async function createPaste(overrides = {}) {
  return request('/api/pastes', {
    method: 'POST',
    body: { content: 'A note for testing.', ...overrides }
  });
}

beforeEach(async () => {
  database = new PGlite();
  await database.exec(schema);
  cache = createTestCache();
  listQueryCount = 0;
  const db = {
    query: (sql, values) => {
      if (sql.includes('FROM pastes WHERE discoverable = TRUE')) listQueryCount += 1;
      return database.query(sql, values);
    },
    connect: async () => ({
      query: (sql, values) => database.query(sql, values),
      release() {}
    })
  };
  server = createApp({ db, cache }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterEach(async () => {
  if (server?.listening) await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  await database?.close();
});

test('health check confirms database connectivity', async () => {
  const { response, payload } = await request('/api/health');
  assert.equal(response.status, 200);
  assert.deepEqual(payload, { status: 'ok' });
});

test('validates required content, limits, and maximum content size', async () => {
  assert.equal((await createPaste({ content: '' })).response.status, 400);
  assert.equal((await createPaste({ content: 'valid', maxViews: 0 })).response.status, 400);
  assert.equal((await createPaste({ content: 'x'.repeat(500_001) })).response.status, 400);
  const tooLarge = await fetch(`${baseUrl}/api/pastes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content: 'x'.repeat(550_000) })
  });
  assert.equal(tooLarge.status, 413);

  const malformed = await fetch(`${baseUrl}/api/pastes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"content":'
  });
  assert.equal(malformed.status, 400);
  assert.deepEqual(await malformed.json(), { error: 'Malformed JSON request body.' });
});

test('creates private pastes by default and retrieves their full content without caching', async () => {
  const created = await createPaste({ title: '  A title  ', content: 'line one\nline two' });
  assert.equal(created.response.status, 201);
  assert.match(created.payload.id, /^[A-Za-z0-9_-]+$/);
  assert.match(created.payload.url, new RegExp(`/p/${created.payload.id}$`));
  assert.equal(created.payload.url, `/p/${created.payload.id}`);

  const stored = await database.query('SELECT title, discoverable, max_views FROM pastes WHERE id = $1', [created.payload.id]);
  assert.deepEqual(stored.rows[0], { title: 'A title', discoverable: false, max_views: null });

  const retrieved = await request(`/api/pastes/${created.payload.id}`);
  assert.equal(retrieved.response.status, 200);
  assert.equal(retrieved.response.headers.get('cache-control'), 'no-store');
  assert.equal(retrieved.payload.content, 'line one\nline two');
  assert.equal(retrieved.payload.viewCount, 1);
});

test('limits paste creation requests from one client', async () => {
  for (let index = 0; index < 20; index += 1) {
    assert.equal((await createPaste()).response.status, 201);
  }
  const limited = await createPaste();
  assert.equal(limited.response.status, 429);
  assert.equal(limited.response.headers.get('retry-after') !== null, true);
  assert.deepEqual(limited.payload, { error: 'Too many requests. Please try again later.' });
});

test('does not reflect untrusted origins or request hosts into share links', async () => {
  const { response, payload } = await request('/api/pastes', {
    method: 'POST',
    body: { content: 'safe link' },
    headers: { Origin: 'https://attacker.example', Host: 'attacker.example' }
  });
  assert.equal(response.status, 201);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.equal(payload.url, `/p/${payload.id}`);
});

test('a view limit allows the final view, then returns not found and clears Explore cache', async () => {
  const created = await createPaste({ discoverable: true, maxViews: 1 });
  await request('/api/pastes?limit=8&page=1');
  assert.equal(cache.entries.size, 1);

  const finalView = await request(`/api/pastes/${created.payload.id}`);
  assert.equal(finalView.response.status, 200);
  assert.equal(finalView.payload.viewCount, 1);
  assert.equal(cache.entries.size, 0);

  const laterView = await request(`/api/pastes/${created.payload.id}`);
  assert.equal(laterView.response.status, 404);
});

test('expired pastes cannot be retrieved', async () => {
  const created = await createPaste({ expiresIn: '1h' });
  await database.query('UPDATE pastes SET expires_at = NOW() - INTERVAL \'1 second\' WHERE id = $1', [created.payload.id]);
  const retrieved = await request(`/api/pastes/${created.payload.id}`);
  assert.equal(retrieved.response.status, 404);
  assert.equal(retrieved.payload.error, 'Paste not found or expired.');
});

test('Explore excludes private pastes, paginates, and searches public titles by prefix', async () => {
  await createPaste({ title: 'Roadmap Alpha', discoverable: true });
  await createPaste({ title: 'A private roadmap', discoverable: false });
  for (let index = 0; index < 9; index += 1) {
    await createPaste({ title: `Public note ${String(index).padStart(2, '0')}`, discoverable: true });
  }

  const firstPage = await request('/api/pastes?limit=8&page=1');
  assert.equal(firstPage.response.status, 200);
  assert.equal(firstPage.payload.items.length, 8);
  assert.equal(firstPage.payload.hasMore, true);
  assert.ok(firstPage.payload.items.every((item) => !item.title.includes('private')));

  const secondPage = await request('/api/pastes?limit=8&page=2');
  assert.equal(secondPage.payload.items.length, 2);
  assert.equal(secondPage.payload.hasMore, false);

  const search = await request('/api/pastes?limit=8&page=1&q=roadmap');
  assert.equal(search.payload.items.length, 1);
  assert.equal(search.payload.items[0].title, 'Roadmap Alpha');
});

test('Explore caches repeated list requests and invalidates after a new public paste', async () => {
  await createPaste({ title: 'First', discoverable: true });
  const first = await request('/api/pastes?limit=8&page=1');
  const repeated = await request('/api/pastes?limit=8&page=1');
  assert.equal(listQueryCount, 1);
  assert.equal(repeated.response.headers.get('cache-control'), 'public, max-age=15, stale-while-revalidate=30');
  assert.deepEqual(repeated.payload, first.payload);

  await createPaste({ title: 'Second', discoverable: true });
  assert.equal(cache.entries.size, 0);
  const refreshed = await request('/api/pastes?limit=8&page=1');
  assert.equal(refreshed.payload.items.length, 2);
  assert.equal(listQueryCount, 2);
});

test('reports database health as unavailable when the health query fails', async () => {
  const brokenApp = createApp({
    db: { query: async () => { throw new Error('test database unavailable'); } },
    cache
  });
  const brokenServer = brokenApp.listen(0, '127.0.0.1');
  await once(brokenServer, 'listening');
  try {
    const response = await fetch(`http://127.0.0.1:${brokenServer.address().port}/api/health`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { status: 'unavailable' });
  } finally {
    await new Promise((resolve, reject) => brokenServer.close((error) => error ? reject(error) : resolve()));
  }
});
