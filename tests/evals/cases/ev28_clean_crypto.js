// tests/evals/cases/ev28_clean_crypto.js
// Eval case ev28 (HELD-OUT): CLEAN - correct cryptography, no flaws.
// Expected: zero findings.
import crypto from 'node:crypto';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derived) => {
      if (err) reject(err);
      else resolve(`${salt.toString('hex')}:${derived.toString('hex')}`);
    });
  });
}

export function verifyPassword(password, stored) {
  const [saltHex, hashHex] = stored.split(':');
  const salt = Buffer.from(saltHex, 'hex');
  return new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, (err, derived) => {
      if (err) reject(err);
      else resolve(crypto.timingSafeEqual(derived, Buffer.from(hashHex, 'hex')));
    });
  });
}
