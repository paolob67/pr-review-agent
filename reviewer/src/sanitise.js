// sanitise.js
// Guardrails: G17 (markdown sanitiser), G35 (strip fake approval/header from model text)
// Sanitises all string fields in each finding before they are rendered into the comment.
// Prevents XSS, injection of fake advisory headers, spam, and prompt-injection amplification.
// No runtime dependencies.

// Bidirectional override/isolate control characters that can reorder displayed text.
// U+202A-202E, U+2066-U+2069, U+200F, U+200E, U+FEFF (BOM / ZWS)
const BIDI_RE = /[\u202A-\u202E\u2066-\u2069\u200E\u200F\uFEFF]/g;

// Raw HTML tags.
const HTML_TAG_RE = /<[^>]+>/g;

// Markdown images: ![alt](url) - remove entirely.
const MD_IMAGE_RE = /!\[.*?\]\(.*?\)/g;

// External links: [label](http/https url) - replace with just the label.
const EXT_LINK_RE = /\[([^\]]*)\]\(https?:\/\/[^\)]+\)/g;

// @mentions.
const MENTION_RE = /@[A-Za-z0-9_-]+/g;

// Marker comment start.
const MARKER_RE = /<!--\s*bob-pr-review[^>]*/gi;

// Fake advisory header: any line starting with > **AI Assisted (wrapper generates the real one).
const FAKE_HEADER_RE = /^>\s*\*\*AI Assisted[^\n]*/gim;

// Fake approval wording: any combination of LGTM, Approved, and checkmark emoji/text on the same run.
// We strip the entire phrase when these appear near each other.
const FAKE_APPROVAL_RE = /(?:LGTM\s*|Approved\s*)+(?::white_check_mark:|[\u2705\u2714])\s*(?:LGTM\s*|Approved\s*)*/gi;
const FAKE_APPROVAL_RE2 = /(?::white_check_mark:|[\u2705\u2714])\s*(?:LGTM|Approved)/gi;
// Also strip standalone "LGTM" and "Approved" adjacent to checkmark patterns in any order.
const FAKE_APPROVAL_RE3 = /(?:LGTM|Approved)\s+:white_check_mark:\s*(?:Approved|LGTM)?/gi;

// Field length caps from CONTRACTS section 4.
const CAPS = {
  summary: 600,
  title: 120,
  evidence: 400,
  explanation: 800,
  proposed_fix: 1500,
  reason: 400,
};

function cap(value, maxLen) {
  if (typeof value !== 'string') return value;
  return value.length > maxLen ? value.slice(0, maxLen) : value;
}

// sanitiseString cleans a single string field. (G17, G35)
export function sanitiseString(s) {
  if (typeof s !== 'string') return s;
  let out = s;
  out = out.replace(BIDI_RE, '');
  out = out.replace(HTML_TAG_RE, '');
  out = out.replace(MD_IMAGE_RE, '');
  out = out.replace(EXT_LINK_RE, '$1');
  out = out.replace(MENTION_RE, '');
  out = out.replace(MARKER_RE, '');
  out = out.replace(FAKE_HEADER_RE, '');
  out = out.replace(FAKE_APPROVAL_RE3, '');
  out = out.replace(FAKE_APPROVAL_RE, '');
  out = out.replace(FAKE_APPROVAL_RE2, '');
  return out.trim();
}

// sanitiseFinding cleans and caps all string fields in a single finding object.
function sanitiseFinding(f) {
  if (!f || typeof f !== 'object') return f;
  const out = { ...f };
  if (typeof out.title === 'string')        out.title       = cap(sanitiseString(out.title),       CAPS.title);
  if (typeof out.evidence === 'string')     out.evidence    = cap(sanitiseString(out.evidence),    CAPS.evidence);
  if (typeof out.explanation === 'string')  out.explanation = cap(sanitiseString(out.explanation), CAPS.explanation);
  if (typeof out.proposed_fix === 'string') out.proposed_fix = cap(sanitiseString(out.proposed_fix), CAPS.proposed_fix);
  return out;
}

// sanitiseAttentionItem cleans a needs_human_attention entry.
function sanitiseAttentionItem(item) {
  if (!item || typeof item !== 'object') return item;
  const out = { ...item };
  if (typeof out.title === 'string')  out.title  = cap(sanitiseString(out.title),  CAPS.title);
  if (typeof out.reason === 'string') out.reason = cap(sanitiseString(out.reason), CAPS.reason);
  return out;
}

// sanitiseOutput cleans the entire validated output object. (G17, G35)
export function sanitiseOutput(output) {
  if (!output || typeof output !== 'object') return output;
  const out = { ...output };
  if (typeof out.summary === 'string') {
    out.summary = cap(sanitiseString(out.summary), CAPS.summary);
  }
  if (Array.isArray(out.findings)) {
    out.findings = out.findings.map(sanitiseFinding);
  }
  if (Array.isArray(out.needs_human_attention)) {
    out.needs_human_attention = out.needs_human_attention.map(sanitiseAttentionItem);
  }
  return out;
}

export default sanitiseOutput;
