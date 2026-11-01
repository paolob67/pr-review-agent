// tests/evals/cases/ev24_ecb_mode.js
// Eval case ev24 (HELD-OUT): ECB mode used for AES encryption (TEAM-002).
// Expected: team_rule finding citing TEAM-002, high severity.
import crypto from 'node:crypto';

export function encryptData(key, data) {
  const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
  return Buffer.concat([cipher.update(data), cipher.final()]).toString('base64');
}
