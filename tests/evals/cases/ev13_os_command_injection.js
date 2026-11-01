// tests/evals/cases/ev13_os_command_injection.js
// Eval case ev13 (train): OS command injection (STD-002 / security).
// Expected: security finding, critical severity, on the exec line.
import { exec } from 'node:child_process';

export function convertFile(filename, callback) {
  exec(`convert ${filename} output.png`, callback);
}
