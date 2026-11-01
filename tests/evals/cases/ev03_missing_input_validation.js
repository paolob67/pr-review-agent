// tests/evals/cases/ev03_missing_input_validation.js
// Eval case ev03 (train): violates STD-003 (validate input at trust boundaries).
// Expected: standards finding citing STD-003, medium severity.
import { createWriteStream } from 'node:fs';

export function saveUpload(req, filename) {
  // filename comes directly from the request, no validation.
  const out = createWriteStream(`/uploads/${filename}`);
  req.pipe(out);
}
