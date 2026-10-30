// publish.js
// Guardrails: G18 (idempotent upsert of one marker comment), G34 (only comment endpoints)
// Finds the existing marker comment and updates it, or creates a new one.
// Only calls the two comment endpoints (listComments + createComment or updateComment). (G34)
// No runtime dependencies.

import { parseMarker } from './render.js';

const MARKER_PREFIX = '<!-- bob-pr-review:v1 ';

// findMarkerComment scans a list of comments and returns the one with the reviewer marker.
function findMarkerComment(comments) {
  for (const c of comments) {
    const body = c.body ?? '';
    if (body.trimStart().startsWith(MARKER_PREFIX)) {
      return c;
    }
  }
  return null;
}

// upsertComment idempotently creates or updates the reviewer marker comment. (G18, G34)
//
// Returns { action: 'created'|'updated', commentId, existingMeta }
//   existingMeta is the parsed marker metadata from the old comment (for cost accumulation).
export async function upsertComment(github, repo, prNumber, commentBody) {
  // Endpoint 4: list comments (G34 - allowed)
  const comments = await github.listComments(repo, prNumber);
  const existing = findMarkerComment(comments);

  if (existing) {
    const existingMeta = parseMarker(existing.body);
    // Endpoint 6: update comment (G34 - allowed)
    await github.updateComment(repo, existing.id, commentBody);
    return { action: 'updated', commentId: existing.id, existingMeta };
  } else {
    // Endpoint 5: create comment (G34 - allowed)
    const created = await github.createComment(repo, prNumber, commentBody);
    return { action: 'created', commentId: created.id, existingMeta: null };
  }
}

export default upsertComment;
