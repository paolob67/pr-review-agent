// triage.js
// Guardrails: G36 (de-duplication, per-category cap, total cap, severity ordering)
// Post-validation triage: de-duplicate, rank by severity, and apply caps.
// No runtime dependencies.

// Severity order from highest to lowest.
const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];

function severityRank(s) {
  const idx = SEVERITY_ORDER.indexOf(s);
  return idx >= 0 ? idx : SEVERITY_ORDER.length;
}

// deduplicateFinding returns a string key for a finding used for dedup. (G36)
function dedupKey(f) {
  return `${f.file}:${f.line}:${f.rule_id ?? f.title ?? ''}`;
}

// triageFindings applies dedup, severity sort, per-category cap, and total cap. (G36)
//
// Parameters:
//   findings            - array of valid finding objects
//   maxPerCategory      - cap per category (default 5)
//   maxTotal            - total cap across all categories (default 15)
//
// Returns the filtered and sorted findings array.
export function triageFindings(findings, maxPerCategory = 5, maxTotal = 15) {
  if (!Array.isArray(findings) || findings.length === 0) return [];

  // Sort by severity descending (critical first).
  const sorted = [...findings].sort((a, b) => severityRank(a.severity) - severityRank(b.severity));

  // De-duplicate on (file, line, rule_id || title). Keep the first (highest severity) occurrence.
  const seen = new Set();
  const deduped = [];
  for (const f of sorted) {
    const key = dedupKey(f);
    if (!seen.has(key)) {
      seen.add(key);
      deduped.push(f);
    }
  }

  // Apply per-category cap. (G36)
  const categoryCounts = {};
  const cappedByCategory = [];
  for (const f of deduped) {
    const cat = f.category;
    categoryCounts[cat] = (categoryCounts[cat] ?? 0) + 1;
    if (categoryCounts[cat] <= maxPerCategory) {
      cappedByCategory.push(f);
    }
  }

  // Apply total cap. (G36)
  return cappedByCategory.slice(0, maxTotal);
}

export default triageFindings;
