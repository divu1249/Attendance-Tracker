/**
 * Resilient JSON extraction & LaTeX-backslash recovery helper for RichStudyResponse.
 * Shared across server (/api/ai) and client (AiCopilotDrawer / RichStudyRenderer)
 * so raw JSON strings are never dumped into the UI.
 */

function escapeSingleLatexBackslashesInRawJson(jsonText: string): string {
  // 1. Protect valid 2-char JSON escapes that could actually be single-backslash LaTeX commands
  //    (e.g., \frac, \forall, \times, \theta, \text, \nabla, \neq, \rho, \right, \beta, \begin)
  let fixed = jsonText.replace(
    /(?<!\\)\\(?=(?:frac|forall|flat|times|theta|text|tau|tilde|triangle|tan|to\b|top\b|nabla|neq|nu\b|natural|norm|not\b|newline|nexists|nleq|ngeq|nsim|nmid|rho|right|rangle|rceil|rfloor|beta|bar|begin|binom|big|boxed|bullet|bot\b|bmatrix)[a-zA-Z]*)/g,
    '\\\\'
  );

  // 2. Escape any remaining backslash that is NOT followed by a valid JSON escape character (" \/ b f n r t u)
  fixed = fixed.replace(/(?<!\\)\\(?!["\\/bfnrtu])/g, '\\\\');

  // 3. Remove trailing commas before } or ]
  fixed = fixed.replace(/,\s*([}\]])/g, '$1');

  return fixed;
}

function escapeLiteralControlCharsInsideJsonStrings(jsonText: string): string {
  let out = '';
  let inString = false;
  let escaped = false;

  for (let i = 0; i < jsonText.length; i++) {
    const ch = jsonText[i];

    if (escaped) {
      out += ch;
      escaped = false;
      continue;
    }

    if (ch === '\\') {
      out += ch;
      if (inString) escaped = true;
      continue;
    }

    if (ch === '"') {
      inString = !inString;
      out += ch;
      continue;
    }

    if (inString) {
      if (ch === '\n') {
        out += '\\n';
        continue;
      }
      if (ch === '\r') {
        out += '\\r';
        continue;
      }
      if (ch === '\t') {
        out += '\\t';
        continue;
      }
    }

    out += ch;
  }

  return out;
}

function stripCodeFencesAndExtractObject(rawText: string): string {
  const trimmed = rawText.trim();

  // Check for fenced ```json ... ``` or ``` ... ``` block first
  const fenceMatch = /```(?:json)?\s*([\s\S]*?)```/i.exec(trimmed);
  const unfenced = fenceMatch
    ? fenceMatch[1].trim()
    : trimmed
        .replace(/^```json\s*/i, '')
        .replace(/^```\s*/i, '')
        .replace(/\s*```$/i, '')
        .trim();

  const firstBrace = unfenced.indexOf('{');
  if (firstBrace === -1) return unfenced;

  const afterFirst = unfenced.slice(firstBrace).trim();
  if (afterFirst.endsWith('}')) {
    const lastBrace = afterFirst.lastIndexOf('}');
    return afterFirst.slice(0, lastBrace + 1);
  }
  return afterFirst;
}

function extractStringFieldFallback(raw: string, key: string): string | undefined {
  const pattern = new RegExp(
    `"${key}"\\s*:\\s*"((?:[^"\\\\]|\\\\[\\s\\S])*)"`,
    'i'
  );
  const m = pattern.exec(raw);
  if (m?.[1]) {
    return m[1]
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\([a-zA-Z]+)/g, '\\$1')
      .trim();
  }

  // Fallback for truncated JSON string value that hit max_tokens before closing quote
  if (key === 'explanation_markdown' || key === 'core_intuition') {
    const partialPattern = new RegExp(`"${key}"\\s*:\\s*"([\\s\\S]+)$`, 'i');
    const pm = partialPattern.exec(raw);
    if (pm?.[1]) {
      return pm[1]
        .replace(/\\n/g, '\n')
        .replace(/\\"/g, '"')
        .replace(/\\\\([a-zA-Z]+)/g, '\\$1')
        .replace(/[\\"]+$/, '')
        .trim();
    }
  }

  return undefined;
}

function extractStringArrayFallback(raw: string, key: string): string[] {
  const pattern = new RegExp(`"${key}"\\s*:\\s*\\[([\\s\\S]*?)\\]`, 'i');
  const m = pattern.exec(raw);
  if (!m?.[1]) return [];
  const items: string[] = [];
  const itemRegex = /"((?:[^"\\]|\\[\s\S])*)"/g;
  let im: RegExpExecArray | null;
  while ((im = itemRegex.exec(m[1])) !== null) {
    const val = im[1]
      .replace(/\\n/g, '\n')
      .replace(/\\"/g, '"')
      .replace(/\\\\([a-zA-Z]+)/g, '\\$1')
      .trim();
    if (val) items.push(val);
  }
  return items;
}

export function safeParseStudyJson<T = any>(rawInput: unknown): T | null {
  if (!rawInput) return null;
  if (typeof rawInput === 'object') return rawInput as T;
  if (typeof rawInput !== 'string') return null;

  const rawText = rawInput.trim();
  if (!rawText) return null;

  const candidate = stripCodeFencesAndExtractObject(rawText);
  if (!candidate.startsWith('{') && !candidate.startsWith('[')) {
    return null;
  }

  // Attempt 1: Strict native JSON.parse
  try {
    const parsed = JSON.parse(candidate);
    if (parsed && typeof parsed === 'object') return parsed as T;
  } catch {
    // Continue to repair passes
  }

  // Attempt 2: Repair single-backslash LaTeX commands & trailing commas
  try {
    const escapedLatex = escapeSingleLatexBackslashesInRawJson(candidate);
    const parsed = JSON.parse(escapedLatex);
    if (parsed && typeof parsed === 'object') return parsed as T;
  } catch {
    // Continue to control-char repair
  }

  // Attempt 3: Escape literal newlines/tabs inside JSON strings + LaTeX repair
  try {
    const escapedBoth = escapeLiteralControlCharsInsideJsonStrings(
      escapeSingleLatexBackslashesInRawJson(candidate)
    );
    const parsed = JSON.parse(escapedBoth);
    if (parsed && typeof parsed === 'object') return parsed as T;
  } catch {
    // Continue to partial field recovery if it looks like a RichStudyResponse payload
  }

  // Attempt 4: Partial field recovery so raw JSON is never dumped on screen
  if (
    /"core_intuition"\s*:/.test(candidate) ||
    /"explanation_markdown"\s*:/.test(candidate) ||
    /"title"\s*:/.test(candidate)
  ) {
    const title = extractStringFieldFallback(candidate, 'title');
    const subjectTag = extractStringFieldFallback(candidate, 'subject_tag');
    const coreIntuition =
      extractStringFieldFallback(candidate, 'core_intuition') ||
      extractStringFieldFallback(candidate, 'overview');
    const explanationMarkdown =
      extractStringFieldFallback(candidate, 'explanation_markdown') ||
      extractStringFieldFallback(candidate, 'explanation');
    const keyTakeaways = extractStringArrayFallback(candidate, 'key_takeaways');
    const examTips = extractStringArrayFallback(candidate, 'exam_tips');

    if (title || coreIntuition || explanationMarkdown || keyTakeaways.length > 0) {
      return {
        title: title || 'Study Guide',
        subject_tag: subjectTag || 'Academic Study',
        core_intuition: coreIntuition || '',
        explanation_markdown: explanationMarkdown || '',
        key_takeaways: keyTakeaways,
        exam_tips: examTips,
      } as T;
    }
  }

  return null;
}

export function looksLikeRawJsonObject(text: string): boolean {
  const t = (text || '').trim();
  if (!t) return false;
  const unfenced = t
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .trim();
  return (
    unfenced.startsWith('{') &&
    (/"core_intuition"\s*:/.test(unfenced) ||
      /"explanation_markdown"\s*:/.test(unfenced) ||
      /"problem_solution"\s*:/.test(unfenced) ||
      /"infographic"\s*:/.test(unfenced))
  );
}
