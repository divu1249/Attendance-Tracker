'use client';

import React, { useState, useMemo } from 'react';
import katex from 'katex';
import 'katex/dist/katex.min.css';
import {
  Copy,
  Check,
  ArrowRight,
  ArrowDown,
  Calculator,
  Sparkles,
  Lightbulb,
  BookOpen,
  ExternalLink,
  Layers,
  BarChart3,
  Workflow,
  Sigma,
  CheckCircle2,
} from 'lucide-react';
import type {
  RichStudyResponse,
  ProblemSolution,
  StudyInfographic,
  StudyInfographicNode,
} from '@/lib/aiTypes';
import { safeParseStudyJson, looksLikeRawJsonObject } from '@/lib/studyJsonParser';

export type { RichStudyResponse, ProblemSolution, StudyInfographic };

interface RichStudyRendererProps {
  content?: string;
  data?: RichStudyResponse | null;
  className?: string;
  compact?: boolean;
  hideReferences?: boolean;
}

type BlockNode =
  | { type: 'code'; lang: string; code: string }
  | { type: 'display_math'; tex: string }
  | { type: 'table'; headers: string[]; rows: string[][] }
  | { type: 'heading'; level: number; text: string }
  | { type: 'divider' }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'paragraph'; text: string };

/**
 * Strips Groq / search line-range citation artifacts ([2*L28-L33], 【2†L10-L20】)
 * and normalizes LaTeX delimiters (\[...\] -> $$...$$, \(...\) -> $...$,
 * and double-escaped commands like \\frac -> \frac) before math parsing.
 */
function normalizeLatexDelimiters(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/\u000c/g, '\\f')
    .replace(/\u0008/g, '\\b')
    .replace(/\\\\([a-zA-Z]+)/g, '\\$1')
    .replace(/\\\[([\s\S]+?)\\\]/g, (_, inner) => `\n$$\n${inner.trim()}\n$$\n`)
    .replace(/\\\(([\s\S]+?)\\\)/g, (_, inner) => `$${inner.trim()}$`);
}

function unescapeLiteralNewlinesOutsideLatex(raw: string): string {
  return raw.replace(
    /\\n(?!(?:abla|atural|eq|ewline|exists|geq|leq|mid|ot\b|orm|sim|subset|cong|parallel|vdash|rightarrow|u\b|i\b))/g,
    '\n'
  );
}

function sanitizeStudyText(raw: string): string {
  if (!raw) return '';
  const withNewlines = unescapeLiteralNewlinesOutsideLatex(raw.replace(/\r\n/g, '\n'));
  const cleanCitations = withNewlines
    .replace(/\[(\d+)\s*\*\s*L\d+(?:-L?\d+)?\]/gi, '[$1]')
    .replace(/【(\d+)(?:†[^】]*)?】/g, '[$1]');
  return normalizeLatexDelimiters(cleanCitations);
}

function stripLatexWrappers(tex: string): string {
  let s = (tex || '')
    .trim()
    .replace(/\u000c/g, '\\f')
    .replace(/\u0008/g, '\\b')
    .replace(/\\\\([a-zA-Z]+)/g, '\\$1');
  if (s.startsWith('$$') && s.endsWith('$$') && s.length >= 4) {
    s = s.slice(2, -2).trim();
  } else if (s.startsWith('$') && s.endsWith('$') && s.length >= 2) {
    s = s.slice(1, -1).trim();
  } else if (s.startsWith('\\[') && s.endsWith('\\]') && s.length >= 4) {
    s = s.slice(2, -2).trim();
  } else if (s.startsWith('\\(') && s.endsWith('\\)') && s.length >= 4) {
    s = s.slice(2, -2).trim();
  }
  return s;
}

function renderKatexHtml(tex: string, displayMode: boolean): string {
  const clean = stripLatexWrappers(tex);
  if (!clean) return '';
  try {
    return katex.renderToString(clean, {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: false,
    });
  } catch {
    return clean;
  }
}

export function LatexFormula({
  tex,
  displayMode = false,
  className = '',
}: {
  tex: string;
  displayMode?: boolean;
  className?: string;
}) {
  const html = useMemo(() => renderKatexHtml(tex, displayMode), [tex, displayMode]);
  if (!tex?.trim()) return null;

  if (displayMode) {
    return (
      <div
        className={`bg-zinc-100/80 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 my-2 text-center overflow-x-auto text-zinc-900 dark:text-zinc-100 ${className}`}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <span
      className={`inline-block align-middle max-w-full overflow-x-auto text-zinc-900 dark:text-zinc-100 ${className}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

function isPipeTableRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return false;
  if (trimmed.startsWith('|') && (trimmed.match(/\|/g) || []).length >= 2) return true;
  return false;
}

function isPipeSeparatorRow(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) return false;
  const inner = trimmed
    .replace(/^\|/, '')
    .replace(/\|(?:\s*\[\d+\])?$/, '');
  const cells = inner.split('|').map((c) => c.trim());
  return cells.length > 0 && cells.every((c) => /^:?-{2,}:?$/.test(c));
}

function splitPipeRow(line: string): string[] {
  const trimmed = line.trim().replace(/\|(\s*\[\d+\])+$/, '|');
  const inner = trimmed.slice(
    trimmed.startsWith('|') ? 1 : 0,
    trimmed.endsWith('|') ? -1 : trimmed.length
  );
  return inner.split('|').map((cell) => cell.trim());
}

function parseBlocks(markdown: string): BlockNode[] {
  const normalizedInput = (markdown || '').replace(/\r\n/g, '\n');
  // Preserve fenced code blocks before LaTeX / literal-newline normalization
  const codeBlocks: Array<{ lang: string; code: string }> = [];
  const withPlaceholders = normalizedInput.replace(
    /```([a-zA-Z0-9_+-]*)\n([\s\S]*?)```/g,
    (_, lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push({ lang: (lang || 'code').trim() || 'code', code: code.replace(/\n$/, '') });
      return `\n@@CODE_BLOCK_${idx}@@\n`;
    }
  );

  const clean = sanitizeStudyText(withPlaceholders);
  const lines = clean.split('\n');
  const blocks: BlockNode[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i++;
      continue;
    }

    // 0. Preserved Fenced Code Block placeholder
    const placeholderMatch = /^@@CODE_BLOCK_(\d+)@@$/.exec(trimmed);
    if (placeholderMatch) {
      const saved = codeBlocks[Number(placeholderMatch[1])];
      if (saved) {
        blocks.push({ type: 'code', lang: saved.lang, code: saved.code });
      }
      i++;
      continue;
    }

    // 1. Unclosed or inline Fenced Code Block fallback
    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim() || 'code';
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length && lines[i].trim().startsWith('```')) {
        i++;
      }
      blocks.push({ type: 'code', lang, code: codeLines.join('\n') });
      continue;
    }

    // 2. Display Math Block ($$ ... $$ single-line or multi-line)
    if (trimmed.startsWith('$$')) {
      if (trimmed.endsWith('$$') && trimmed.length > 4) {
        blocks.push({ type: 'display_math', tex: trimmed.slice(2, -2).trim() });
        i++;
        continue;
      }
      const mathLines: string[] = [trimmed.slice(2)];
      i++;
      while (i < lines.length) {
        const curTrim = lines[i].trim();
        if (curTrim.endsWith('$$')) {
          mathLines.push(curTrim.slice(0, -2));
          i++;
          break;
        }
        mathLines.push(lines[i]);
        i++;
      }
      blocks.push({ type: 'display_math', tex: mathLines.join('\n').trim() });
      continue;
    }

    // 3. Markdown Pipe Table
    if (isPipeTableRow(trimmed)) {
      const tableLines: string[] = [];
      while (i < lines.length && isPipeTableRow(lines[i].trim())) {
        tableLines.push(lines[i].trim());
        i++;
      }
      const nonSeparatorRows = tableLines.filter((r) => !isPipeSeparatorRow(r));
      if (nonSeparatorRows.length >= 1) {
        const headers = splitPipeRow(nonSeparatorRows[0]);
        const rows = nonSeparatorRows.slice(1).map(splitPipeRow);
        blocks.push({ type: 'table', headers, rows });
      }
      continue;
    }

    // 4. Horizontal Divider
    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: 'divider' });
      i++;
      continue;
    }

    // 5. Headings (#, ##, ###, ####)
    const headingMatch = /^(#{1,4})\s+(.+)$/.exec(trimmed);
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: headingMatch[1].length,
        text: headingMatch[2].trim(),
      });
      i++;
      continue;
    }

    // 6. Unordered List
    if (/^[-*•]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*•]\s+/, '').trim());
        i++;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    // 7. Ordered List
    if (/^\d+[.)]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+[.)]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+[.)]\s+/, '').trim());
        i++;
      }
      blocks.push({ type: 'ol', items });
      continue;
    }

    // 8. Paragraph
    const paraLines: string[] = [];
    while (i < lines.length) {
      const cur = lines[i].trim();
      if (
        !cur ||
        cur.startsWith('```') ||
        cur.startsWith('$$') ||
        isPipeTableRow(cur) ||
        /^(-{3,}|\*{3,}|_{3,})$/.test(cur) ||
        /^(#{1,4})\s+/.test(cur) ||
        /^[-*•]\s+/.test(cur) ||
        /^\d+[.)]\s+/.test(cur)
      ) {
        break;
      }
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: 'paragraph', text: paraLines.join('\n').trim() });
    } else {
      i++;
    }
  }

  return blocks;
}

/**
 * MathText: parses display math ($$ ... $$), inline math ($ ... $), bold, italic,
 * inline code, [Not in Your Notes] tags, Markdown links, and superscript citations [1].
 */
export function MathText({ text }: { text: string }) {
  const sanitized = sanitizeStudyText(text);
  // Split display math $$...$$ first so multi-word or inline display formulas render properly
  const displayRegex = /(\$\$[\s\S]+?\$\$)/g;
  const segments = sanitized.split(displayRegex);

  return (
    <>
      {segments.map((seg, sIdx) => {
        if (!seg) return null;
        if (seg.startsWith('$$') && seg.endsWith('$$') && seg.length >= 4) {
          return <LatexFormula key={`dm-${sIdx}`} tex={seg.slice(2, -2)} displayMode />;
        }
        return <React.Fragment key={`in-${sIdx}`}>{renderInlineTokens(seg)}</React.Fragment>;
      })}
    </>
  );
}

function renderInlineTokens(text: string): React.ReactNode[] {
  // Token order: inline code, inline LaTeX ($...$), bold (**...**), italic (*...*),
  // missing note tag, markdown link, or citation badge [1].
  const tokenRegex =
    /(`[^`]+`|\$(?!\s)(?:\\.|[^$\n])+?(?<!\s)\$|\*\*[^*]+\*\*|\*[^*\n]+\*|\[Not in (?:Your )?Notes\]|\[[^\]]+\]\(https?:\/\/[^\s)]+\)|\[\d+\])/gi;
  const parts = text.split(tokenRegex);

  return parts.map((part, idx) => {
    if (!part) return null;

    // Inline code
    if (part.startsWith('`') && part.endsWith('`') && part.length >= 2) {
      return (
        <code
          key={idx}
          className="px-1.5 py-0.5 mx-0.5 rounded-md bg-zinc-200/80 dark:bg-zinc-800 text-blue-700 dark:text-emerald-300 font-mono text-[11px] border border-zinc-300/60 dark:border-zinc-700/70"
        >
          {part.slice(1, -1)}
        </code>
      );
    }

    // Inline LaTeX $...$
    if (part.startsWith('$') && part.endsWith('$') && part.length >= 3) {
      const inner = part.slice(1, -1);
      // Guard plain currency values like "$50" or "$1,200.50"
      if (/^\d[\d,.]*(?:\s*[-–]\s*\$?\d[\d,.]*)?$/.test(inner.trim())) {
        return <React.Fragment key={idx}>{part}</React.Fragment>;
      }
      return (
        <span
          key={idx}
          className="inline-block align-middle mx-0.5 text-zinc-900 dark:text-zinc-100"
          dangerouslySetInnerHTML={{ __html: renderKatexHtml(inner, false) }}
        />
      );
    }

    // Bold
    if (part.startsWith('**') && part.endsWith('**') && part.length >= 4) {
      return (
        <strong key={idx} className="font-bold text-zinc-900 dark:text-zinc-100">
          {renderInlineTokens(part.slice(2, -2))}
        </strong>
      );
    }

    // Italic
    if (part.startsWith('*') && part.endsWith('*') && part.length >= 2) {
      return (
        <em key={idx} className="italic text-zinc-700 dark:text-zinc-300">
          {part.slice(1, -1)}
        </em>
      );
    }

    // Missing note alert flag
    if (/^\[Not in (?:Your )?Notes\]$/i.test(part)) {
      return (
        <span
          key={idx}
          className="inline-flex items-center px-2 py-0.5 mx-0.5 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/25 font-mono text-[10px] font-bold"
        >
          {part}
        </span>
      );
    }

    // Markdown link [title](url)
    const linkMatch = /^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/.exec(part);
    if (linkMatch) {
      return (
        <a
          key={idx}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 dark:text-blue-400 underline underline-offset-2 hover:opacity-80 font-medium"
        >
          {linkMatch[1]}
        </a>
      );
    }

    // Superscript citation pill [2]
    const citeMatch = /^\[(\d+)\]$/.exec(part);
    if (citeMatch) {
      return (
        <sup
          key={idx}
          className="inline-flex items-center px-1.5 py-0.2 mx-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-[10px] font-mono font-bold align-super"
        >
          [{citeMatch[1]}]
        </sup>
      );
    }

    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function CodeCard({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard unavailable
    }
  };

  return (
    <div className="rounded-xl overflow-hidden bg-zinc-950 border border-zinc-800 shadow-sm my-2">
      <div className="flex items-center justify-between px-3.5 py-2 bg-zinc-900/90 border-b border-zinc-800">
        <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-zinc-400">
          {lang || 'code'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 px-2 py-0.5 rounded-md bg-zinc-800 hover:bg-zinc-700 text-zinc-300 text-[10px] font-semibold transition"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              <span>Copy Code</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-3.5 overflow-x-auto text-[11px] leading-relaxed font-mono text-emerald-300">
        <code>{code}</code>
      </pre>
    </div>
  );
}

/**
 * Step-by-Step Problem Solver Card:
 * Given Data & Key Formulas Strip -> Numbered Step Timeline -> Emerald Final Answer Box
 */
export function SolutionCard({ solution }: { solution: ProblemSolution }) {
  const [copiedFinal, setCopiedFinal] = useState(false);

  if (!solution?.has_solution) return null;

  const handleCopyFinal = async () => {
    try {
      await navigator.clipboard.writeText(solution.final_answer_latex || '');
      setCopiedFinal(true);
      setTimeout(() => setCopiedFinal(false), 1800);
    } catch {
      // Clipboard unavailable
    }
  };

  return (
    <div className="backdrop-blur-xl bg-white/80 dark:bg-zinc-900/75 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-4 my-3 shadow-sm">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-2.5">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-xl bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <Calculator className="w-3.5 h-3.5" />
          </div>
          <div>
            <h4 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
              Step-by-Step Derivation &amp; Solution
            </h4>
            <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
              Verified equations &amp; intermediate steps
            </p>
          </div>
        </div>
        <span className="text-[10px] font-mono text-zinc-400 tabular-nums">
          {solution.steps?.length || 0} Steps
        </span>
      </div>

      {/* Given Data & Key Formulas Strip */}
      {(solution.given_parameters?.length > 0 || solution.key_formulas?.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {solution.given_parameters?.length > 0 && (
            <div className="bg-zinc-50 dark:bg-zinc-950/70 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400 block">
                Given Parameters
              </span>
              <div className="flex flex-wrap gap-1.5">
                {solution.given_parameters.map((g, idx) => (
                  <div
                    key={idx}
                    className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200/80 dark:border-zinc-800 text-[11px] flex items-center gap-1.5"
                  >
                    <span className="font-semibold text-zinc-500 dark:text-zinc-400">
                      {g.label}:
                    </span>
                    <LatexFormula tex={g.value_latex} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {solution.key_formulas?.length > 0 && (
            <div className="bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/20 rounded-xl p-3 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 flex items-center gap-1">
                <Sigma className="w-3 h-3" /> Key Formulas
              </span>
              <div className="space-y-1.5">
                {solution.key_formulas.map((f, idx) => (
                  <div
                    key={idx}
                    className="px-2.5 py-1.5 rounded-lg bg-white/90 dark:bg-zinc-900/90 border border-blue-500/15 text-[11px] flex items-center justify-between gap-2 flex-wrap"
                  >
                    <span className="font-semibold text-zinc-600 dark:text-zinc-300">
                      {f.name}
                    </span>
                    <LatexFormula tex={f.latex} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Numbered Step Timeline */}
      {solution.steps?.length > 0 && (
        <div className="space-y-3">
          {solution.steps.map((step, idx) => {
            const isLast = idx === solution.steps.length - 1;
            return (
              <div key={idx} className="relative flex gap-3">
                <div className="flex flex-col items-center shrink-0">
                  <div className="w-6 h-6 rounded-full bg-blue-600 text-white text-[11px] font-bold font-mono tabular-nums flex items-center justify-center shadow-sm">
                    {step.step_number || idx + 1}
                  </div>
                  {!isLast && (
                    <div className="w-px flex-1 bg-zinc-200 dark:bg-zinc-800 my-1" />
                  )}
                </div>

                <div className="flex-1 min-w-0 bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 space-y-1.5">
                  <h5 className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                    <MathText text={step.title} />
                  </h5>
                  {step.explanation && (
                    <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                      <MathText text={step.explanation} />
                    </p>
                  )}
                  {step.equation_latex && (
                    <LatexFormula tex={step.equation_latex} displayMode className="!my-1.5" />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Final Answer Box */}
      {solution.final_answer_latex && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Final Answer
            </span>
            <button
              type="button"
              onClick={handleCopyFinal}
              className="px-2.5 py-1 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-700 dark:text-emerald-300 text-[10px] font-semibold flex items-center gap-1 transition"
            >
              {copiedFinal ? (
                <>
                  <Check className="w-3 h-3" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  <span>Copy Result</span>
                </>
              )}
            </button>
          </div>
          <div className="bg-white/80 dark:bg-zinc-900/80 border border-emerald-500/20 rounded-xl px-4 py-3 text-center overflow-x-auto">
            <LatexFormula
              tex={solution.final_answer_latex}
              displayMode
              className="!bg-transparent !border-0 !p-0 !m-0"
            />
          </div>
        </div>
      )}
    </div>
  );
}

const ACCENT_TOP_BORDERS: Record<NonNullable<StudyInfographicNode['accent']>, string> = {
  blue: 'border-t-2 border-t-blue-500',
  emerald: 'border-t-2 border-t-emerald-500',
  amber: 'border-t-2 border-t-amber-500',
  purple: 'border-t-2 border-t-violet-500',
  rose: 'border-t-2 border-t-rose-500',
};

const ACCENT_BADGE_COLORS: Record<NonNullable<StudyInfographicNode['accent']>, string> = {
  blue: 'bg-blue-500/10 text-blue-600 dark:text-blue-400',
  emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
  amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
  purple: 'bg-violet-500/10 text-violet-600 dark:text-violet-400',
  rose: 'bg-rose-500/10 text-rose-600 dark:text-rose-400',
};

function sanitizeClientSvg(rawSvg?: string): string | null {
  if (!rawSvg || !rawSvg.toLowerCase().includes('<svg')) return null;
  const cleaned = rawSvg
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?>[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/<(iframe|object|embed)[\s\S]*?>[\s\S]*?<\/\1>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .trim();
  return cleaned.startsWith('<svg') ? cleaned : null;
}

/**
 * Dynamic Visual Infographic Renderer:
 * supports flowchart, layered_architecture, comparison_bars, svg_diagram
 */
export function InfographicCard({ infographic }: { infographic: StudyInfographic }) {
  const safeSvg = useMemo(
    () => (infographic.type === 'svg_diagram' ? sanitizeClientSvg(infographic.svg_markup) : null),
    [infographic.type, infographic.svg_markup]
  );

  if (!infographic) return null;

  const nodes = infographic.nodes || [];
  const metrics = infographic.metrics || [];

  const typeLabel =
    infographic.type === 'flowchart'
      ? 'Process Flowchart'
      : infographic.type === 'layered_architecture'
      ? 'Layered Architecture'
      : infographic.type === 'comparison_bars'
      ? 'Comparative Metrics'
      : 'Concept Diagram';

  const TypeIcon =
    infographic.type === 'comparison_bars'
      ? BarChart3
      : infographic.type === 'layered_architecture'
      ? Layers
      : Workflow;

  return (
    <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/90 dark:bg-zinc-950/80 p-4 my-4 space-y-3 shadow-sm">
      {/* Infographic Header with Caption */}
      <div className="flex items-start justify-between gap-2 pb-2 border-b border-zinc-200/70 dark:border-zinc-800/70">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-6 h-6 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 flex items-center justify-center shrink-0">
            <TypeIcon className="w-3.5 h-3.5" />
          </div>
          <h5 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 leading-snug">
            {infographic.caption ? <MathText text={infographic.caption} /> : typeLabel}
          </h5>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0">
          {typeLabel}
        </span>
      </div>

      {/* 1. Flowchart */}
      {infographic.type === 'flowchart' && nodes.length > 0 && (
        <div className="flex flex-col md:flex-row md:flex-wrap md:items-stretch gap-2">
          {nodes.map((node, idx) => {
            const accent = node.accent || 'blue';
            const isLast = idx === nodes.length - 1;
            return (
              <React.Fragment key={node.id || idx}>
                <div
                  className={`flex-1 min-w-[145px] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 ${ACCENT_TOP_BORDERS[accent]} rounded-xl p-3 space-y-1.5 shadow-sm`}
                >
                  {node.badge && (
                    <span
                      className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full ${ACCENT_BADGE_COLORS[accent]}`}
                    >
                      <MathText text={node.badge} />
                    </span>
                  )}
                  <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                    <MathText text={node.label} />
                  </div>
                  {node.sublabel && (
                    <div className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-snug">
                      <MathText text={node.sublabel} />
                    </div>
                  )}
                </div>
                {!isLast && (
                  <div className="flex items-center justify-center text-zinc-400 py-0.5 md:py-0">
                    <ArrowDown className="w-4 h-4 md:hidden" />
                    <ArrowRight className="w-4 h-4 hidden md:block" />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* 2. Layered Architecture */}
      {infographic.type === 'layered_architecture' && nodes.length > 0 && (
        <div className="space-y-1.5">
          {nodes.map((node, idx) => {
            const accent = node.accent || 'blue';
            const isLast = idx === nodes.length - 1;
            return (
              <React.Fragment key={node.id || idx}>
                <div
                  className={`bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 ${ACCENT_TOP_BORDERS[accent]} rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3 flex-wrap shadow-sm`}
                >
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <span
                      className={`w-6 h-6 rounded-lg font-mono text-[10px] font-bold tabular-nums flex items-center justify-center shrink-0 mt-0.5 ${ACCENT_BADGE_COLORS[accent]}`}
                    >
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <div className="space-y-0.5 min-w-0 flex-1">
                      <div className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                        <MathText text={node.label} />
                      </div>
                      {node.sublabel && (
                        <div className="text-[11px] text-zinc-500 dark:text-zinc-400">
                          <MathText text={node.sublabel} />
                        </div>
                      )}
                    </div>
                  </div>
                  {node.badge && (
                    <span
                      className={`text-[10px] font-mono font-bold px-2.5 py-0.5 rounded-full shrink-0 ${ACCENT_BADGE_COLORS[accent]}`}
                    >
                      <MathText text={node.badge} />
                    </span>
                  )}
                </div>
                {!isLast && (
                  <div className="flex justify-center text-zinc-400">
                    <ArrowDown className="w-3.5 h-3.5" />
                  </div>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* 3. Comparison Bars */}
      {infographic.type === 'comparison_bars' && metrics.length > 0 && (
        <div className="space-y-3 bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3.5">
          {metrics.map((m, idx) => {
            const widthPct = Math.max(4, Math.min(100, Number(m.percentage) || 0));
            const barColors = [
              'bg-blue-500',
              'bg-emerald-500',
              'bg-amber-500',
              'bg-violet-500',
              'bg-rose-500',
            ];
            return (
              <div key={idx} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                    <MathText text={m.label} />
                  </span>
                  <span className="font-mono font-bold tabular-nums text-blue-600 dark:text-blue-400">
                    <MathText text={m.value_display} />
                  </span>
                </div>
                <div className="w-full h-2 rounded-full bg-zinc-200/80 dark:bg-zinc-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${barColors[idx % barColors.length]}`}
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
                {m.note && (
                  <p className="text-[10px] text-zinc-500 dark:text-zinc-400">
                    <MathText text={m.note} />
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 4. Sanitized Vector SVG Diagram */}
      {infographic.type === 'svg_diagram' && (
        <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 overflow-x-auto text-zinc-800 dark:text-zinc-200">
          {safeSvg ? (
            <div
              className="w-full flex items-center justify-center [&>svg]:w-full [&>svg]:max-w-[640px] [&>svg]:h-auto [&>svg]:max-h-[300px]"
              dangerouslySetInnerHTML={{ __html: safeSvg }}
            />
          ) : (
            <div className="py-6 text-center text-xs text-zinc-400">
              Diagram vector preview unavailable.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function MarkdownBlocks({
  content,
  compact = false,
}: {
  content: string;
  compact?: boolean;
}) {
  if (!content || !content.trim()) return null;
  const blocks = parseBlocks(content);

  return (
    <div
      className={`${
        compact ? 'space-y-2' : 'space-y-3'
      } text-xs text-zinc-700 dark:text-zinc-300 leading-relaxed`}
    >
      {blocks.map((block, idx) => {
        if (block.type === 'code') {
          return <CodeCard key={idx} lang={block.lang} code={block.code} />;
        }

        if (block.type === 'display_math') {
          return <LatexFormula key={idx} tex={block.tex} displayMode />;
        }

        if (block.type === 'table') {
          return (
            <div
              key={idx}
              className="overflow-x-auto rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-950/60 my-2"
            >
              <table className="w-full text-left border-collapse text-[11px]">
                <thead className="bg-zinc-100/90 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                  <tr>
                    {block.headers.map((h, hIdx) => (
                      <th
                        key={hIdx}
                        className="px-3 py-2 font-bold text-zinc-800 dark:text-zinc-200 whitespace-nowrap"
                      >
                        <MathText text={h} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-200/70 dark:divide-zinc-800/70">
                  {block.rows.map((row, rIdx) => (
                    <tr
                      key={rIdx}
                      className="hover:bg-zinc-50/60 dark:hover:bg-zinc-900/40 transition"
                    >
                      {block.headers.map((_, cIdx) => (
                        <td
                          key={cIdx}
                          className="px-3 py-2 align-top text-zinc-700 dark:text-zinc-300"
                        >
                          <MathText text={row[cIdx] || ''} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        if (block.type === 'divider') {
          return <hr key={idx} className="border-zinc-200 dark:border-zinc-800 my-2" />;
        }

        if (block.type === 'heading') {
          const sizeClass =
            block.level === 1
              ? 'text-sm font-extrabold text-zinc-900 dark:text-zinc-100 pt-1'
              : block.level === 2
              ? 'text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400 pt-1'
              : 'text-xs font-bold text-zinc-900 dark:text-zinc-100 pt-0.5';
          return (
            <h4 key={idx} className={sizeClass}>
              <MathText text={block.text} />
            </h4>
          );
        }

        if (block.type === 'ul') {
          return (
            <ul key={idx} className="space-y-1.5 pl-4 list-disc marker:text-blue-500">
              {block.items.map((item, liIdx) => (
                <li key={liIdx}>
                  <MathText text={item} />
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === 'ol') {
          return (
            <ol
              key={idx}
              className="space-y-1.5 pl-4 list-decimal marker:text-blue-500 marker:font-bold"
            >
              {block.items.map((item, liIdx) => (
                <li key={liIdx}>
                  <MathText text={item} />
                </li>
              ))}
            </ol>
          );
        }

        return (
          <p key={idx} className="whitespace-pre-wrap">
            <MathText text={block.text} />
          </p>
        );
      })}
    </div>
  );
}

export default function RichStudyRenderer({
  content,
  data,
  className = '',
  compact = false,
  hideReferences = false,
}: RichStudyRendererProps) {
  // Defensive recovery: if a JSON string ever slipped into `data` or `content`, parse it before rendering
  const resolvedData = useMemo<RichStudyResponse | null>(() => {
    if (data && typeof data === 'object') {
      // Also guard if core_intuition or explanation_markdown itself contains a nested raw JSON string
      const nestedRaw =
        looksLikeRawJsonObject(data.core_intuition || '')
          ? safeParseStudyJson<RichStudyResponse>(data.core_intuition)
          : looksLikeRawJsonObject(data.explanation_markdown || '')
          ? safeParseStudyJson<RichStudyResponse>(data.explanation_markdown)
          : null;
      return nestedRaw ? { ...data, ...nestedRaw } : data;
    }
    if (typeof data === 'string') {
      return safeParseStudyJson<RichStudyResponse>(data);
    }
    if (typeof content === 'string' && looksLikeRawJsonObject(content)) {
      return safeParseStudyJson<RichStudyResponse>(content);
    }
    return null;
  }, [data, content]);

  if (resolvedData) {
    return (
      <div className={`space-y-4 ${className}`}>
        {/* Textbook Header + Subject Pill Badge */}
        {(resolvedData.title || resolvedData.subject_tag) && (
          <div className="flex items-center justify-between gap-2 flex-wrap">
            {resolvedData.title && (
              <h3 className="text-base font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">
                <MathText text={resolvedData.title} />
              </h3>
            )}
            {resolvedData.subject_tag && (
              <span className="text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20 shrink-0">
                {resolvedData.subject_tag}
              </span>
            )}
          </div>
        )}

        {/* Core Intuition Glass Card */}
        {resolvedData.core_intuition && !looksLikeRawJsonObject(resolvedData.core_intuition) && (
          <div className="backdrop-blur-xl bg-blue-500/5 dark:bg-blue-500/10 border border-blue-500/20 rounded-2xl p-4 space-y-1.5 shadow-sm">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
              <Sparkles className="w-3 h-3" />
              <span>Core Intuition</span>
            </div>
            <p className="text-xs text-zinc-700 dark:text-zinc-200 leading-relaxed">
              <MathText text={resolvedData.core_intuition} />
            </p>
          </div>
        )}

        {/* Dynamic Infographic */}
        {resolvedData.infographic && <InfographicCard infographic={resolvedData.infographic} />}

        {/* Step-by-Step Problem Solution */}
        {resolvedData.problem_solution?.has_solution && (
          <SolutionCard solution={resolvedData.problem_solution} />
        )}

        {/* Deep Textbook Explanation */}
        {resolvedData.explanation_markdown &&
          !looksLikeRawJsonObject(resolvedData.explanation_markdown) && (
            <MarkdownBlocks content={resolvedData.explanation_markdown} compact={compact} />
          )}

        {/* Key Takeaways */}
        {Array.isArray(resolvedData.key_takeaways) && resolvedData.key_takeaways.length > 0 && (
          <div className="bg-zinc-50 dark:bg-zinc-950/60 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-2">
            <h5 className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <BookOpen className="w-3.5 h-3.5" />
              <span>High-Yield Takeaways</span>
            </h5>
            <ul className="space-y-1.5">
              {resolvedData.key_takeaways.map((kp, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                  <span className="text-emerald-500 font-bold mt-0.5">•</span>
                  <div className="flex-1 min-w-0">
                    <MathText text={kp} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Exam Tips */}
        {Array.isArray(resolvedData.exam_tips) && resolvedData.exam_tips.length > 0 && (
          <div className="bg-amber-500/10 p-4 rounded-2xl border border-amber-500/20 space-y-2">
            <h5 className="text-[11px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
              <Lightbulb className="w-3.5 h-3.5" />
              <span>Exam Tips &amp; Pitfalls</span>
            </h5>
            <ul className="space-y-1.5">
              {resolvedData.exam_tips.map((tip, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-zinc-700 dark:text-zinc-300">
                  <span className="text-amber-500 font-bold mt-0.5">•</span>
                  <div className="flex-1 min-w-0">
                    <MathText text={tip} />
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Verified Web References */}
        {!hideReferences &&
          Array.isArray(resolvedData.references) &&
          resolvedData.references.length > 0 && (
            <div className="space-y-2">
              <h5 className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">
                Verified Web References
              </h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {resolvedData.references.map((ref, idx) => (
                  <a
                    key={idx}
                    href={ref.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-2.5 rounded-xl bg-zinc-50 dark:bg-zinc-950/60 border border-zinc-200 dark:border-zinc-800 hover:border-blue-500/50 transition flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <span className="font-semibold text-blue-600 dark:text-blue-400 block truncate">
                        {ref.title || ref.domain || ref.url}
                      </span>
                      <span className="text-[10px] text-zinc-400 block truncate">
                        {ref.domain ? `${ref.domain} · ${ref.url}` : ref.url}
                      </span>
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}
      </div>
    );
  }

  return (
    <div className={className}>
      <MarkdownBlocks content={content || ''} compact={compact} />
    </div>
  );
}
