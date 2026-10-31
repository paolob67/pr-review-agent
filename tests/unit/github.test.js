// tests/unit/github.test.js
// Unit tests for github.js
// Guardrails covered: G34 (client exposes only the six allowed operations; the publisher path
// reaches only issue comment create and update; nothing touches reviews, check runs or statuses)

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { makeGithubClient } from '../../reviewer/src/github.js';

const requests = [];
let server;
let base;

before(async () => {
  server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      requests.push({ method: req.method, path: req.url, auth: req.headers.authorization });
      res.writeHead(req.method === 'POST' ? 201 : 200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: 7, body: 'x' }));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((r) => server.close(r)));

describe('github.js error detail', () => {
  it('a refused call reports GitHub message and accepted permissions, never the token', async () => {
    const refuse = http.createServer((req, res) => {
      res.writeHead(403, { 'Content-Type': 'application/json', 'x-accepted-github-permissions': 'issues=read; pull_requests=read' });
      res.end(JSON.stringify({ message: 'Resource not accessible by integration' }));
    });
    await new Promise((r) => refuse.listen(0, '127.0.0.1', r));
    try {
      const url = `http://127.0.0.1:${refuse.address().port}`;
      await assert.rejects(
        makeGithubClient(url, 'secret-token-value').listComments('o/r', 5),
        (err) => {
          assert.match(err.message, /HTTP 403/);
          assert.match(err.message, /Resource not accessible by integration/);
          assert.match(err.message, /issues=read; pull_requests=read/);
          assert.ok(!err.message.includes('secret-token-value'));
          return true;
        },
      );
    } finally {
      await new Promise((r) => refuse.close(r));
    }
  });
});

describe('github.js (G34)', () => {
  it('G34: client exposes exactly the six allowed operations', () => {
    const client = makeGithubClient(base, 't');
    assert.deepEqual(Object.keys(client).sort(), [
      'createComment', 'getFileContents', 'getPR', 'getPRDiff', 'listComments', 'updateComment',
    ]);
  });

  it('G34: createComment posts only to the issue comments endpoint, never to reviews', async () => {
    requests.length = 0;
    await makeGithubClient(base, 't').createComment('o/r', 5, 'hello');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, 'POST');
    assert.equal(requests[0].path, '/repos/o/r/issues/5/comments');
    assert.ok(!requests[0].path.includes('/reviews'));
  });

  it('G34: updateComment patches only the issue comment endpoint', async () => {
    requests.length = 0;
    await makeGithubClient(base, 't').updateComment('o/r', 9, 'hello');
    assert.equal(requests[0].method, 'PATCH');
    assert.equal(requests[0].path, '/repos/o/r/issues/comments/9');
  });

  it('G34: no operation ever uses reviews, check-runs or statuses paths', async () => {
    requests.length = 0;
    const c = makeGithubClient(base, 't');
    await c.getPR('o/r', 1);
    await c.getPRDiff('o/r', 1);
    await c.getFileContents('o/r', '.bob-review/standards.md', 'main');
    await c.listComments('o/r', 1);
    await c.createComment('o/r', 1, 'b');
    await c.updateComment('o/r', 2, 'b');
    for (const r of requests) {
      assert.ok(!/reviews|check-runs|statuses/.test(r.path), `forbidden path ${r.path}`);
    }
  });
});
