// github.js
// Guardrails: G34 (only the six allowed endpoints; any other call is a bug)
// Thin GitHub REST API client using only node:https.
// Base URL is configurable via REVIEW_API_BASE so tests can point at a mock server.
// Exported functions match only the six endpoints needed by the reviewer pipeline.
// No runtime dependencies.

import https from 'node:https';
import http from 'node:http';
import { URL } from 'node:url';

// request makes a single HTTP(S) request and returns { status, headers, body }.
function request(method, urlStr, headers, body) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(urlStr);
    const lib = parsed.protocol === 'https:' ? https : http;
    const opts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + (parsed.search || ''),
      method,
      headers: {
        'User-Agent': 'pr-review-agent/0.1.0',
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        ...headers,
      },
    };
    const req = lib.request(opts, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks).toString('utf8'),
      }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// failureDetail summarises an error response for the thrown message: GitHub's own "message" field
// and the permissions the endpoint accepts (x-accepted-github-permissions). Neither holds secrets;
// both are capped, and callers print the message through the scrubbing logger path only.
function failureDetail(res) {
  let message = '';
  try { message = String(JSON.parse(res.body)?.message ?? ''); } catch { /* body is not JSON */ }
  const accepted = String(res.headers?.['x-accepted-github-permissions'] ?? '');
  const parts = [];
  if (message) parts.push(`message="${message.slice(0, 160)}"`);
  if (accepted) parts.push(`accepted-permissions="${accepted.slice(0, 160)}"`);
  return parts.length ? ` (${parts.join(' ')})` : '';
}

function authHeaders(token) {
  return token ? { 'Authorization': `Bearer ${token}` } : {};
}

function jsonHeaders(token) {
  return { ...authHeaders(token), 'Content-Type': 'application/json' };
}

// makeClient creates a GitHub API client bound to a base URL and token.
// Only the six endpoints required by the reviewer pipeline are exposed (G34).
export function makeGithubClient(apiBase, token) {
  const base = apiBase.replace(/\/$/, '');

  // 1. GET PR metadata
  async function getPR(repo, prNumber) {
    const { status, body } = await request('GET', `${base}/repos/${repo}/pulls/${prNumber}`, authHeaders(token));
    if (status !== 200) throw new Error(`GET PR ${repo}#${prNumber} failed: HTTP ${status}`);
    return JSON.parse(body);
  }

  // 2. GET PR diff (unified diff text)
  async function getPRDiff(repo, prNumber) {
    const { status, body } = await request('GET', `${base}/repos/${repo}/pulls/${prNumber}`, {
      ...authHeaders(token),
      'Accept': 'application/vnd.github.diff',
    });
    if (status !== 200) throw new Error(`GET PR diff ${repo}#${prNumber} failed: HTTP ${status}`);
    return body;
  }

  // 3. GET file contents at a ref
  async function getFileContents(repo, path, ref) {
    const url = `${base}/repos/${repo}/contents/${path}?ref=${encodeURIComponent(ref)}`;
    const { status, body } = await request('GET', url, authHeaders(token));
    if (status === 404) return null;
    if (status !== 200) throw new Error(`GET contents ${repo}/${path}@${ref} failed: HTTP ${status}`);
    const data = JSON.parse(body);
    if (data.encoding === 'base64') {
      return Buffer.from(data.content.replace(/\n/g, ''), 'base64').toString('utf8');
    }
    return data.content ?? null;
  }

  // 4. List issue/PR comments
  async function listComments(repo, prNumber) {
    const res = await request('GET', `${base}/repos/${repo}/issues/${prNumber}/comments`, authHeaders(token));
    if (res.status !== 200) throw new Error(`LIST comments ${repo}#${prNumber} failed: HTTP ${res.status}${failureDetail(res)}`);
    return JSON.parse(res.body);
  }

  // 5. Create (POST) a comment
  async function createComment(repo, prNumber, body) {
    const payload = JSON.stringify({ body });
    const res = await request('POST', `${base}/repos/${repo}/issues/${prNumber}/comments`, jsonHeaders(token), payload);
    if (res.status !== 201) throw new Error(`POST comment ${repo}#${prNumber} failed: HTTP ${res.status}${failureDetail(res)}`);
    return JSON.parse(res.body);
  }

  // 6. Update (PATCH) an existing comment
  async function updateComment(repo, commentId, body) {
    const payload = JSON.stringify({ body });
    const res = await request('PATCH', `${base}/repos/${repo}/issues/comments/${commentId}`, jsonHeaders(token), payload);
    if (res.status !== 200) throw new Error(`PATCH comment ${commentId} failed: HTTP ${res.status}${failureDetail(res)}`);
    return JSON.parse(res.body);
  }

  return { getPR, getPRDiff, getFileContents, listComments, createComment, updateComment };
}

export default makeGithubClient;
