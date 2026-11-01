// tests/evals/cases/ev25_no_public_api_docs.js
// Eval case ev25 (HELD-OUT): new public endpoint added but README not updated (TEAM-006).
// Expected: team_rule finding citing TEAM-006, low or medium severity.
export function createWebhook(db, url, secret) {
  return db.insert('webhooks', { url, secret, active: true });
}

export function listWebhooks(db) {
  return db.query('SELECT id, url, active FROM webhooks');
}
