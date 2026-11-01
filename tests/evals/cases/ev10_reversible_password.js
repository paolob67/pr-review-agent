// tests/evals/cases/ev10_reversible_password.js
// Eval case ev10 (train): violates TEAM-004 (password and secret storage - stored reversibly).
// Expected: team_rule finding citing TEAM-004, critical severity.
import crypto from 'node:crypto';

const KEY = Buffer.from('0123456789abcdef0123456789abcdef', 'hex');
const IV  = Buffer.alloc(16, 0);

export function storePassword(password) {
  const cipher = crypto.createCipheriv('aes-128-cbc', KEY, IV);
  return Buffer.concat([cipher.update(password), cipher.final()]).toString('base64');
}
