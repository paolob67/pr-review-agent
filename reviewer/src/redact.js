// redact.js
// Guardrails: G15 (secret redaction before diff is sent to Bob)
// Strips obvious credentials from a diff string before it leaves the prepare stage.
// Patterns are conservative to avoid false positives on ordinary code.
// No runtime dependencies.

const REDACTED = '[REDACTED]';

// Keyword context: we only redact long tokens when they appear adjacent to
// credential-related keywords within a 5-character window on either side.
const KEYWORD_RE = /(?:key|token|secret|password|api_key|apikey)/i;

// Build a pattern that matches a long alphanum string next to a credential keyword.
// We scan line by line for efficiency and to limit false positives.
function redactAdjacentToKeywords(line) {
  // Pattern: keyword-ish chars, optional separator, 32+ alphanum chars; or reversed.
  // The 5-char window is approximated by requiring the keyword and value to be on the same line
  // with at most a small separator between them.
  return line.replace(
    /(?:(?:key|token|secret|password|api_key|apikey)\s*[:=]\s*["']?)([A-Za-z0-9+/]{32,})("?)/gi,
    (match, value, quote) => match.replace(value, REDACTED)
  );
}

// AWS access key IDs: AKIA followed by 16 uppercase alphanumeric chars.
const AWS_KEY_RE = /\bAKIA[0-9A-Z]{16}\b/g;

// GitHub personal access tokens and OAuth tokens.
const GH_TOKEN_RE = /\bgh[pousr]_[A-Za-z0-9]{36,}\b/g;

// PEM private key headers.
const PRIVATE_KEY_RE = /-----BEGIN [A-Z ]+PRIVATE KEY-----/g;

// redactDiff takes a unified diff string and returns a copy with secrets replaced.
// It operates line by line to preserve diff structure. (G15)
export function redactDiff(diff) {
  if (typeof diff !== 'string') return diff;
  const lines = diff.split('\n');
  const out = lines.map(line => {
    let l = line;
    l = l.replace(AWS_KEY_RE, REDACTED);
    l = l.replace(GH_TOKEN_RE, REDACTED);
    l = l.replace(PRIVATE_KEY_RE, `-----BEGIN [REDACTED] PRIVATE KEY-----`);
    l = redactAdjacentToKeywords(l);
    return l;
  });
  return out.join('\n');
}

export default redactDiff;
