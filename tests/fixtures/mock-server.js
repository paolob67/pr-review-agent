// tests/fixtures/mock-server.js
// Local HTTP mock server for GitHub API.
// Returns configured fixture data. Records all calls.
// Fails with 403 on any endpoint NOT in the allowed set (G34).
// Exports start(port), stop(), and world state setters.

import http from 'node:http';

// Allowed endpoint patterns (G34): only these six are permitted.
// Any other endpoint returns 403.
const ALLOWED_ENDPOINTS = [
  // GET PR metadata
  { method: 'GET',   pattern: /^\/repos\/[^/]+\/[^/]+\/pulls\/\d+$/, name: 'get_pr' },
  // GET PR diff (same URL as PR metadata but with Accept: diff header)
  { method: 'GET',   pattern: /^\/repos\/[^/]+\/[^/]+\/pulls\/\d+$/, name: 'get_diff' },
  // GET file contents
  { method: 'GET',   pattern: /^\/repos\/[^/]+\/[^/]+\/contents\//, name: 'get_contents' },
  // List comments
  { method: 'GET',   pattern: /^\/repos\/[^/]+\/[^/]+\/issues\/\d+\/comments$/, name: 'list_comments' },
  // Create comment
  { method: 'POST',  pattern: /^\/repos\/[^/]+\/[^/]+\/issues\/\d+\/comments$/, name: 'create_comment' },
  // Update comment
  { method: 'PATCH', pattern: /^\/repos\/[^/]+\/[^/]+\/issues\/comments\/\d+$/, name: 'update_comment' },
];

function isAllowed(method, pathname) {
  return ALLOWED_ENDPOINTS.some(e => e.method === method && e.pattern.test(pathname));
}

// World state: tests set this before each scenario.
let _pr = {
  number: 1, state: 'open', draft: false,
  author_association: 'MEMBER',
  head: { sha: 'a'.repeat(40), ref: 'feature-branch' },
  base: { ref: 'main' },
};
let _diff = '';
let _files = {};   // path -> content string
let _rules = {};   // path -> content string (under .bob-review/)
let _comments = [];
let _captured = [];
let _nextCommentId = 1000;

export const world = {
  setPR(data)        { _pr = data; },
  setDiff(text)      { _diff = text; },
  setFiles(map)      { _files = map ?? {}; },
  setRules(map)      { _rules = map ?? {}; },
  setComments(list)  { _comments = list ?? []; _nextCommentId = 1000; },
  capturedRequests() { return [..._captured]; },
  reset() {
    _pr = {
      number: 1, state: 'open', draft: false,
      author_association: 'MEMBER',
      head: { sha: 'a'.repeat(40), ref: 'feature-branch' },
      base: { ref: 'main' },
    };
    _diff = '';
    _files = {};
    _rules = {};
    _comments = [];
    _captured = [];
    _nextCommentId = 1000;
  },
};

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(payload);
}

function text(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'text/plain' });
  res.end(body);
}

let _server = null;

export function start(port) {
  return new Promise((resolve, reject) => {
    _server = http.createServer(async (req, res) => {
      const url = new URL(req.url, `http://localhost:${port}`);
      const pathname = url.pathname;
      const method   = req.method;
      const body     = await readBody(req);

      _captured.push({ method, pathname, headers: req.headers, body });

      // Reject any endpoint not in the allowed set. (G34)
      if (!isAllowed(method, pathname)) {
        json(res, 403, { message: `mock-server: endpoint not allowed: ${method} ${pathname}` });
        return;
      }

      // Route: GET PR metadata or diff
      const prMatch = pathname.match(/^\/repos\/([^/]+\/[^/]+)\/pulls\/(\d+)$/);
      if (method === 'GET' && prMatch) {
        const acceptHdr = req.headers['accept'] ?? '';
        if (acceptHdr.includes('diff')) {
          // GET diff
          text(res, 200, _diff);
        } else {
          // GET PR metadata
          json(res, 200, _pr);
        }
        return;
      }

      // Route: GET file contents
      const contentsMatch = pathname.match(/^\/repos\/([^/]+\/[^/]+)\/contents\/(.+)$/);
      if (method === 'GET' && contentsMatch) {
        const filePath = decodeURIComponent(contentsMatch[2]);
        const refParam = url.searchParams.get('ref');
        // Check rules map first, then files map.
        const content = _rules[filePath] ?? _files[filePath] ?? null;
        if (content === null) {
          json(res, 404, { message: 'Not Found' });
        } else {
          const encoded = Buffer.from(content, 'utf8').toString('base64');
          json(res, 200, { encoding: 'base64', content: encoded, name: filePath.split('/').pop(), path: filePath });
        }
        return;
      }

      // Route: list/create comments
      const commentsMatch = pathname.match(/^\/repos\/([^/]+\/[^/]+)\/issues\/(\d+)\/comments$/);
      if (commentsMatch) {
        if (method === 'GET') {
          json(res, 200, _comments);
          return;
        }
        if (method === 'POST') {
          const payload = body ? JSON.parse(body) : {};
          const newComment = { id: _nextCommentId++, body: payload.body ?? '' };
          _comments.push(newComment);
          json(res, 201, newComment);
          return;
        }
      }

      // Route: update comment
      const updateMatch = pathname.match(/^\/repos\/([^/]+\/[^/]+)\/issues\/comments\/(\d+)$/);
      if (method === 'PATCH' && updateMatch) {
        const commentId = parseInt(updateMatch[2], 10);
        const payload = body ? JSON.parse(body) : {};
        const idx = _comments.findIndex(c => c.id === commentId);
        if (idx >= 0) {
          _comments[idx] = { ..._comments[idx], body: payload.body ?? '' };
          json(res, 200, _comments[idx]);
        } else {
          json(res, 404, { message: 'Not Found' });
        }
        return;
      }

      // Fallback (should not reach here if isAllowed is correct).
      json(res, 500, { message: 'unhandled route' });
    });

    _server.on('error', reject);
    _server.listen(port, '127.0.0.1', () => resolve(port));
  });
}

export function stop() {
  return new Promise((resolve) => {
    if (_server) {
      _server.close(() => { _server = null; resolve(); });
    } else {
      resolve();
    }
  });
}

export default { start, stop, world };
