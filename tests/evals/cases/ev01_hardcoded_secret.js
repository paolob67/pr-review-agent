// tests/evals/cases/ev01_hardcoded_secret.js
// Eval case ev01 (train): violates STD-001 (hard-coded secret).
// Expected: security finding citing STD-001, high severity, on the API_KEY line.
const API_KEY = 'sk-prod-xK9mN2pQr7vL4wZ8';

export function getHeaders() {
  return { Authorization: `Bearer ${API_KEY}` };
}
