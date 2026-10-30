#!/usr/bin/env node
// tests/fixtures/fake-bob.js
// Fake Bob Shell binary for offline testing.
// Reads its stdin (the prompt), looks up FAKE_BOB_SCENARIO to find the scenario file,
// and emits the appropriate output to stdout/stderr.
//
// If FAKE_BOB_PRINT_ENV is set, prints the entire environment to stderr so tests
// can verify SCM tokens and other credentials are absent (canary test G3).

import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// `bob --version` probe: answer immediately, never read the scenario.
if (process.argv.includes('--version')) {
  process.stdout.write((process.env.FAKE_BOB_VERSION ?? '0.0.0-fake') + '\ncommit: fake\n');
  process.exit(0);
}

// Print env to stderr if requested (canary: SCM tokens must not appear).
if (process.env.FAKE_BOB_PRINT_ENV) {
  process.stderr.write('FAKE_BOB_ENV_DUMP:' + JSON.stringify(process.env) + '\n');
  process.stderr.write('FAKE_BOB_ARGV_DUMP:' + JSON.stringify(process.argv.slice(2)) + '\n');
}

const scenarioName = process.env.FAKE_BOB_SCENARIO ?? 'valid';
const scenarioPath = join(__dirname, 'scenarios', `${scenarioName}.json`);

if (!existsSync(scenarioPath)) {
  process.stderr.write(`fake-bob: scenario file not found: ${scenarioPath}\n`);
  process.exit(1);
}

const scenario = JSON.parse(readFileSync(scenarioPath, 'utf8'));

// Consume stdin so the caller's pipe does not block.
async function readStdin() {
  return new Promise((resolve) => {
    const chunks = [];
    process.stdin.on('data', c => chunks.push(c));
    process.stdin.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    process.stdin.resume();
  });
}

async function run() {
  await readStdin();

  // Scenario: timeout - sleep for specified seconds then exit.
  if (scenario._sleep_seconds) {
    await new Promise(r => setTimeout(r, scenario._sleep_seconds * 1000));
    process.exit(0);
  }

  // Scenario: nonzero exit - write error to stderr and exit 1.
  if (scenario._exit_code && scenario._exit_code !== 0) {
    if (scenario._raw_stderr) {
      process.stderr.write(scenario._raw_stderr + '\n');
    }
    process.exit(scenario._exit_code);
  }

  // Scenario: malformed - output raw (non-JSON) text to stdout.
  if (scenario._raw_output) {
    process.stdout.write(scenario._raw_output + '\n');
    process.exit(0);
  }

  // Normal scenario: output the result JSON line.
  // Include any noise around it based on scenario type.
  const resultLine = JSON.stringify({
    type: scenario.type ?? 'result',
    timestamp: scenario.timestamp,
    status: scenario.status,
    stats: scenario.stats,
    last_message: scenario.last_message,
  });

  // For 'extra_text' scenario the result line is wrapped in noise.
  // We do that by putting normal text before and after on separate lines.
  if (scenarioName === 'extra_text') {
    process.stdout.write('Bob Shell v2.0.9 - running...\n');
    process.stdout.write(resultLine + '\n');
    process.stdout.write('Done.\n');
  } else {
    process.stdout.write(resultLine + '\n');
  }

  process.exit(0);
}

run().catch(err => {
  process.stderr.write(`fake-bob error: ${err.message}\n`);
  process.exit(1);
});
