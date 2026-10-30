// parseOutput.js
// Guardrails: G16 (output schema extraction and parsing)
// Extracts the result JSON line from Bob stdout, parses it,
// and extracts the model's findings JSON from last_message.
// Bob may emit warnings/logs around the JSON line; we find the line starting with {"type":"result".
// No runtime dependencies.

export class ParseError extends Error {
  // outcome defaults to bad_model_output; timeouts and nonzero exits are bob_unavailable
  // (CONTRACTS section 8).
  constructor(message, cause, outcome = 'bad_model_output') {
    super(message);
    this.outcome = outcome;
    if (cause) this.cause = cause;
  }
}

// findResultLine scans stdout for the single JSON line with {"type":"result",...}. (G16)
function findResultLine(stdout) {
  const lines = stdout.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('{"type":"result"') || trimmed.startsWith('{ "type": "result"')) {
      return trimmed;
    }
  }
  return null;
}

// extractJsonFromText finds the first top-level JSON object {...} in a text string.
// Bob may emit the JSON surrounded by text or markdown.
function extractJsonFromText(text) {
  // Find the first '{' and last '}' at depth-0 level.
  let start = -1;
  let depth = 0;
  let inString = false;
  let escape = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (escape) { escape = false; continue; }
    if (inString) {
      if (ch === '\\') { escape = true; continue; }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0 && start >= 0) {
        return text.slice(start, i + 1);
      }
    }
  }
  return null;
}

// parseOutput extracts and parses Bob output. (G16)
// Returns { parsed, stats } or throws ParseError with outcome 'bad_model_output'.
//
// parsed  - the findings object from the model (may be further validated downstream)
// stats   - Bob's stats object (session_costs, duration_ms, etc.)
export function parseOutput(stdout, exitCode, timedOut) {
  if (timedOut) {
    throw new ParseError('Bob process timed out', null, 'bob_unavailable');
  }
  if (exitCode !== 0) {
    throw new ParseError(`Bob exited with code ${exitCode}`, null, 'bob_unavailable');
  }

  const resultLine = findResultLine(stdout);
  if (!resultLine) {
    throw new ParseError('No result JSON line found in Bob stdout');
  }

  let resultObj;
  try {
    resultObj = JSON.parse(resultLine);
  } catch (e) {
    throw new ParseError('Failed to parse Bob result JSON line', e);
  }

  const lastMessage = resultObj.last_message;
  if (typeof lastMessage !== 'string' || lastMessage.trim() === '') {
    throw new ParseError('Bob result has no last_message text');
  }

  const jsonStr = extractJsonFromText(lastMessage);
  if (!jsonStr) {
    throw new ParseError('No JSON object found in Bob last_message');
  }

  let parsed;
  try {
    parsed = JSON.parse(jsonStr);
  } catch (e) {
    throw new ParseError('Failed to parse findings JSON from last_message', e);
  }

  return { parsed, stats: resultObj.stats ?? null };
}

export default parseOutput;
