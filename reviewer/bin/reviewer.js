#!/usr/bin/env node
// reviewer/bin/reviewer.js
// Entry point for the reviewer pipeline.
//   reviewer.js                          all three stages in one process (local runs)
//   reviewer.js prepare|review|publish   one stage, one GitHub Actions job each (ADR 0012);
//                                        files are exchanged in the directory REVIEW_EXCHANGE_DIR
// The stage name is the only argument. Everything else comes from validated environment variables,
// never from the command line (CONTRACTS section 1).

import { main, STAGES } from '../src/main.js';

const arg = process.argv[2];
const stage = arg === undefined ? null : arg;
if (process.argv.length > 3 || (stage !== null && !STAGES.includes(stage))) {
  process.stderr.write(`usage: reviewer.js [${STAGES.join('|')}]\n`);
  process.exit(1);
}

main(process.env, { stage, dir: process.env.REVIEW_EXCHANGE_DIR || null }).catch(err => {
  process.stderr.write(`[reviewer] unexpected crash: ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
