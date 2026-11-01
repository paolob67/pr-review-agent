// tests/evals/cases/ev08_weak_crypto.js
// Eval case ev08 (train): violates TEAM-002 (crypto agility / weak algorithm).
// Expected: team_rule finding citing TEAM-002, high severity (MD5 used for security purpose).
import crypto from 'node:crypto';

export function hashPassword(password) {
  return crypto.createHash('md5').update(password).digest('hex');
}
