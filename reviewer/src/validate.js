// validate.js
// Guardrails: G16 (output schema validation), G36 (findings contract validation)
// Validates the parsed findings object against the CONTRACTS section 4 schema.
// Invalid findings are dropped and counted.
// Low-confidence findings move to needs_human_attention.
// No runtime dependencies.

export class ValidationError extends Error {
  constructor(message) {
    super(message);
    this.outcome = 'bad_model_output';
  }
}

const VALID_CATEGORIES  = new Set(['standards', 'team_rule', 'security', 'other']);
const VALID_SEVERITIES  = new Set(['critical', 'high', 'medium', 'low', 'info']);
const VALID_CONFIDENCES = new Set(['high', 'medium', 'low']);

// parseDiffChangedLines returns a map: filename -> Set of changed line numbers.
// "Changed" means lines added (starting with '+') in the unified diff.
export function parseDiffChangedLines(diff) {
  if (!diff || typeof diff !== 'string') return new Map();
  const result = new Map();
  let currentFile = null;
  let lineNum = 0;

  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) {
      currentFile = line.slice(6).trim();
      if (!result.has(currentFile)) result.set(currentFile, new Set());
      lineNum = 0;
    } else if (line.startsWith('@@ ')) {
      // Parse @@ -l,s +l,s @@ line number hint
      const m = line.match(/\+(\d+)/);
      lineNum = m ? parseInt(m[1], 10) - 1 : 0;
    } else if (currentFile !== null) {
      if (line.startsWith('-')) {
        // Removed line: does not count as a changed line in the new file.
      } else if (line.startsWith('+')) {
        lineNum++;
        result.get(currentFile).add(lineNum);
      } else if (!line.startsWith('\\')) {
        // Context line.
        lineNum++;
      }
    }
  }
  return result;
}

// validateFindings validates and filters the parsed output object. (G16, G36)
//
// Parameters:
//   parsed   - raw object from parseOutput
//   diff     - unified diff string (for file/line validation)
//   ruleIds  - Set of known rule IDs from rules.js
//
// Returns { valid, dropped, movedToAttention }
//   valid              - the cleaned findings object
//   dropped            - count of dropped findings
//   movedToAttention   - count of findings moved to needs_human_attention
export function validateFindings(parsed, diff, ruleIds) {
  if (!parsed || typeof parsed !== 'object') {
    throw new ValidationError('Model output is not an object');
  }
  if (parsed.schema_version !== 1) {
    throw new ValidationError(`schema_version must be 1, got: ${parsed.schema_version}`);
  }

  const changedLines = parseDiffChangedLines(diff);
  const findings = Array.isArray(parsed.findings) ? parsed.findings : [];
  const attention = Array.isArray(parsed.needs_human_attention) ? parsed.needs_human_attention : [];

  const validFindings = [];
  let dropped = 0;
  let movedToAttention = 0;

  for (const f of findings) {
    const reason = validateOneFinding(f, changedLines, ruleIds);
    if (reason) {
      dropped++;
      process.stderr.write(`[validate] dropped finding "${f?.title ?? '?'}": ${reason}\n`);
      continue;
    }

    // Move low-confidence findings to needs_human_attention. (G36)
    if (f.confidence === 'low') {
      attention.push({
        title: f.title,
        reason: `Low confidence: ${f.explanation ?? ''}`.slice(0, 400),
        file: f.file ?? null,
        line: f.line ?? null,
      });
      movedToAttention++;
      continue;
    }

    validFindings.push(f);
  }

  if (findings.length > 0 && validFindings.length === 0 && movedToAttention === 0 && dropped === findings.length) {
    throw new ValidationError('All findings are invalid; cannot produce a review');
  }

  return {
    valid: {
      schema_version: 1,
      summary: typeof parsed.summary === 'string' ? parsed.summary : '',
      findings: validFindings,
      needs_human_attention: attention,
    },
    dropped,
    movedToAttention,
  };
}

function validateOneFinding(f, changedLines, ruleIds) {
  if (!f || typeof f !== 'object') return 'not an object';

  if (!VALID_CATEGORIES.has(f.category)) return `invalid category: ${f.category}`;
  if (!VALID_SEVERITIES.has(f.severity)) return `invalid severity: ${f.severity}`;
  if (!VALID_CONFIDENCES.has(f.confidence)) return `invalid confidence: ${f.confidence}`;

  // rule_id required for standards and team_rule, and must exist. (G36)
  if (f.category === 'standards' || f.category === 'team_rule') {
    if (!f.rule_id) return 'missing rule_id for standards/team_rule finding';
    if (!ruleIds.has(f.rule_id)) {
      return `rule_id "${f.rule_id}" not found in supplied rules`;
    }
  }

  // File must appear in the diff. (G36)
  if (typeof f.file !== 'string' || f.file === '') return 'missing file';
  if (!changedLines.has(f.file)) return `file "${f.file}" not in diff`;

  // Line must be a changed line in the diff. (G36)
  if (typeof f.line !== 'number' || !Number.isInteger(f.line)) return 'line is not an integer';
  const linesForFile = changedLines.get(f.file);
  if (!linesForFile.has(f.line)) return `line ${f.line} is not a changed line in "${f.file}"`;

  return null; // valid
}

export default validateFindings;
