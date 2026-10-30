import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/server.js';

async function withServer(fn) {
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    await fn(base);
  } finally {
    server.close();
  }
}

test('adds and lists a note', async () => {
  await withServer(async (base) => {
    const created = await fetch(`${base}/notes`, { method: 'POST', body: JSON.stringify({ text: 'hello' }) });
    assert.equal(created.status, 201);
    const list = await (await fetch(`${base}/notes`)).json();
    assert.deepEqual(list.map((n) => n.text), ['hello']);
  });
});

test('rejects an empty note', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/notes`, { method: 'POST', body: JSON.stringify({ text: '' }) });
    assert.equal(res.status, 400);
  });
});

test('deleting an unknown note returns 404', async () => {
  await withServer(async (base) => {
    const res = await fetch(`${base}/notes/99`, { method: 'DELETE' });
    assert.equal(res.status, 404);
  });
});
