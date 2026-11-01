// tests/evals/cases/ev04_path_traversal.js
// Eval case ev04 (train): violates STD-004 (safe file paths) and STD-003.
// Expected: security finding citing STD-004, high severity, on the join/readFileSync line.
import { join, readFileSync } from 'node:path';
import fs from 'node:fs';

export function readUserFile(userInput) {
  const filePath = join('/data/files', userInput);
  return fs.readFileSync(filePath, 'utf8');
}
