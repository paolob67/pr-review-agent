#!/usr/bin/env node
// reviewer/bin/reviewer.js
// Entry point for the reviewer pipeline.
// Just calls main() from src/main.js.

import { main } from '../src/main.js';

main(process.env).catch(err => {
  process.stderr.write(`[reviewer] unexpected crash: ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
