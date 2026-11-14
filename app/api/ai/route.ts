import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';
import type {
  RichStudyResponse,
  ProblemSolution,
  StudyInfographic,
  StudyReference,
} from '@/lib/aiTypes';
import {
  safeParseStudyJson as parseStudyJsonShared,
  looksLikeRawJsonObject,
} from '@/lib/studyJsonParser';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type AiMode = 'parse_records' | 'study_material' | 'web_study_tutor' | 'daily_briefing';

interface RateBucket {
  minuteTimestamps: number[];
  burstTimestamps: number[];
}

const TOKEN_LIMIT_MESSAGE =
  'Built-in free AI token limit reached for now. Please wait a minute to retry, or copy your question and notes to continue in ChatGPT or Google Gemini while the quota resets.';

// In-memory sliding-window rate limiter per client key
const rateLimitMap = new Map<string, RateBucket>();
const MINUTE_WINDOW_MS = 60_000;
const MAX_PER_MINUTE = 20;
const BURST_WINDOW_MS = 10_000;
const MAX_PER_BURST = 5;

function checkRateLimit(clientKey: string): { allowed: boolean; retryAfterSec?: number } {
  const now = Date.now();
  const existing = rateLimitMap.get(clientKey) || { minuteTimestamps: [], burstTimestamps: [] };

  existing.minuteTimestamps = existing.minuteTimestamps.filter((ts) => now - ts < MINUTE_WINDOW_MS);
  existing.burstTimestamps = existing.burstTimestamps.filter((ts) => now - ts < BURST_WINDOW_MS);

  if (existing.burstTimestamps.length >= MAX_PER_BURST) {
    const oldestBurst = existing.burstTimestamps[0] || now;
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((BURST_WINDOW_MS - (now - oldestBurst)) / 1000)),
    };
  }

  if (existing.minuteTimestamps.length >= MAX_PER_MINUTE) {
    const oldestMin = existing.minuteTimestamps[0] || now;
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((MINUTE_WINDOW_MS - (now - oldestMin)) / 1000)),
    };
  }

  existing.minuteTimestamps.push(now);
  existing.burstTimestamps.push(now);
  rateLimitMap.set(clientKey, existing);

  if (rateLimitMap.size > 1000) {
    const firstKey = rateLimitMap.keys().next().value;
    if (firstKey) rateLimitMap.delete(firstKey);
  }

  return { allowed: true };
}

function getGeminiClient(timeoutMs = 15_000): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function getSupabaseEnv() {
  return {
    supabaseUrl:
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mcqffjdncqhahzoowgrk.supabase.co',
    anonKey:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      'sb_publishable_5_EkoaVXUp3s_X6I6BDmwA_8ZyRi3G3',
  };
}

function getSupabaseForRequest(req: NextRequest) {
  const { supabaseUrl, anonKey } = getSupabaseEnv();
  const authHeader = req.headers.get('authorization');

  if (authHeader && authHeader.startsWith('Bearer ')) {
    return createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  if (
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY !== 'placeholder-service-role-key'
  ) {
    return createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return null;
}

function getPublicSupabaseClient(req: NextRequest) {
  const scoped = getSupabaseForRequest(req);
  if (scoped) return scoped;
  const { supabaseUrl, anonKey } = getSupabaseEnv();
  return createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isRealRateLimitError(err: any): boolean {
  const status = err?.status ?? err?.statusCode ?? err?.code;
  if (status === 429 || status === '429') return true;
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    /\b429\b/.test(msg) ||
    msg.includes('resource_exhausted') ||
    msg.includes('rate_limit_exceeded')
  );
}

function isNotFoundModelError(err: any): boolean {
  const status = err?.status ?? err?.statusCode ?? err?.code;
  if (status === 404 || status === '404') return true;
  const msg = String(err?.message || err || '').toLowerCase();
  return (
    /\b404\b/.test(msg) ||
    msg.includes('not_found') ||
    msg.includes('not found') ||
    msg.includes('model_not_found') ||
    msg.includes('no longer available') ||
    msg.includes('does not exist')
  );
}

const GROQ_MODEL_PRIORITY = [
  'openai/gpt-oss-120b',
  'llama-3.3-70b-versatile',
  'meta-llama/llama-4-scout-17b-16e-instruct',
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'openai/gpt-oss-20b',
  'qwen/qwen3-32b',
  'llama-3.1-8b-instant',
  'gemma2-9b-it',
];

let cachedGroqModels: { models: string[]; fetchedAt: number } | null = null;

async function getActiveGroqChatModels(groqKey: string): Promise<string[]> {
  const now = Date.now();
  if (cachedGroqModels && now - cachedGroqModels.fetchedAt < 10 * 60_000) {
    return cachedGroqModels.models;
  }

  try {
    const res = await fetch('https://api.groq.com/openai/v1/models', {
      headers: { Authorization: `Bearer ${groqKey}` },
      signal: AbortSignal.timeout(4000),
    });
    if (res.ok) {
      const json = await res.json();
      const rawIds: string[] = Array.isArray(json?.data)
        ? json.data
            .filter((m: any) => m?.id && m?.active !== false)
            .map((m: any) => String(m.id))
            .filter(
              (id: string) =>
                !/whisper|tts|playai|orpheus|guard|safeguard|embed/i.test(id)
            )
        : [];

      if (rawIds.length > 0) {
        const prioritized = GROQ_MODEL_PRIORITY.filter((id) => rawIds.includes(id));
        const remaining = rawIds.filter((id) => !prioritized.includes(id));
        const merged = [...prioritized, ...remaining];
        cachedGroqModels = { models: merged, fetchedAt: now };
        return merged;
      }
    }
  } catch {
    // Fall back to default candidate list below
  }

  return ['openai/gpt-oss-120b', 'llama-3.1-8b-instant', 'openai/gpt-oss-20b'];
}

async function callGeminiModelCandidates(
  ai: GoogleGenAI,
  candidates: string[],
  params: {
    contents: any;
    config?: Record<string, any>;
    fastMode?: boolean;
  }
): Promise<{ response: any; model: string }> {
  let lastErr: any = null;
  for (let i = 0; i < candidates.length; i += 1) {
    const model = candidates[i];
    const base = { ...(params.config || {}) };
    if (model === 'gemini-4-hydrogen' && params.fastMode !== false && !base.thinkingConfig) {
      base.thinkingConfig = { thinkingLevel: ThinkingLevel.LOW };
    }
    if (model !== 'gemini-4-hydrogen' && base.thinkingConfig) {
      delete base.thinkingConfig;
    }

    try {
      const response = await ai.models.generateContent({
        model,
        contents: params.contents,
        config: Object.keys(base).length > 0 ? base : undefined,
      });
      return { response, model };
    } catch (err: any) {
      lastErr = err;
      const hasMore = i < candidates.length - 1;
      if (hasMore && (isNotFoundModelError(err) || String(err?.message || '').toLowerCase().includes('unsupported'))) {
        continue;
      }
      throw err;
    }
  }
  throw lastErr || new Error('No Gemini candidate succeeded');
}

async function callGeminiWithFallback(
  ai: GoogleGenAI,
  params: {
    contents: any;
    config?: Record<string, any>;
    fastMode?: boolean;
    skipSecondaryModel?: boolean;
    preferredModel?: string;
  }
): Promise<any> {
  const candidates = params.preferredModel
    ? [params.preferredModel, 'gemini-3.8-flash', 'gemini-4-hydrogen', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite']
    : ['gemini-4-hydrogen', 'gemini-3.8-flash', 'gemini-3.1-flash-lite', 'gemini-3.5-flash-lite'];

  const uniqueCandidates = Array.from(new Set(candidates));

  if (params.skipSecondaryModel) {
    const { response } = await callGeminiModelCandidates(
      ai,
      uniqueCandidates.slice(0, 2),
      params
    );
    return response;
  }

  let lastErr: any = null;
  for (let i = 0; i < uniqueCandidates.length; i += 1) {
    const model = uniqueCandidates[i];
    try {
      const { response } = await callGeminiModelCandidates(ai, [model], params);
      return response;
    } catch (err: any) {
      lastErr = err;
      const msg = String(err?.message || err || '').toLowerCase();
      const shouldTryNext =
        isNotFoundModelError(err) ||
        isRealRateLimitError(err) ||
        msg.includes('503') ||
        msg.includes('504') ||
        msg.includes('quota') ||
        msg.includes('unavailable') ||
        msg.includes('deadline_exceeded') ||
        msg.includes('unsupported') ||
        msg.includes('timeout') ||
        msg.includes('aborted');

      if (shouldTryNext && i < uniqueCandidates.length - 1) {
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function callGroqChat(
  messages: Array<{ role: string; content: string }>,
  options?: {
    model?: string;
    useBrowserSearch?: boolean;
    jsonMode?: boolean;
    timeoutMs?: number;
    maxTokens?: number;
  }
) {
  const groqKey = process.env.GROQ_API_KEY;
  if (!groqKey) return null;

  let targetModel = options?.model;
  if (!targetModel) {
    const active = await getActiveGroqChatModels(groqKey);
    targetModel = active[0] || 'openai/gpt-oss-120b';
  }

  const payload: Record<string, any> = {
    model: targetModel,
    messages,
    max_tokens: options?.maxTokens ?? 2200,
  };

  if (options?.useBrowserSearch) {
    payload.tools = [{ type: 'browser_search' }];
  }
  if (options?.jsonMode) {
    payload.response_format = { type: 'json_object' };
  }

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${groqKey}`,
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(options?.timeoutMs || 18_000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    if (res.status === 404) {
      cachedGroqModels = null;
    }
    throw new Error(`Groq API error (${res.status}): ${text.slice(0, 320)}`);
  }

  return await res.json();
}

function cleanCitationArtifacts(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/\u000c/g, '\\f')
    .replace(/\u0008/g, '\\b')
    .replace(/\[(\d+)\s*\*\s*L\d+(?:-L?\d+)?\]/gi, '[$1]')
    .replace(/【(\d+)(?:†[^】]*)?】/g, '[$1]')
    .replace(/\\\\([a-zA-Z]+)/g, '\\$1')
    .trim();
}

function getDomainFromUrl(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return 'source';
  }
}

function sanitizeSvgString(svg?: string): string | undefined {
  if (!svg || typeof svg !== 'string') return undefined;
  const trimmed = svg.trim();
  if (!trimmed.toLowerCase().includes('<svg')) return undefined;
  // Strip executable tags & event handler attributes
  return trimmed
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<foreignObject[\s\S]*?>[\s\S]*?<\/foreignObject>/gi, '')
    .replace(/<(iframe|object|embed)[\s\S]*?>[\s\S]*?<\/\1>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');
}

function sanitizeArrayLine(raw: any): string {
  const s = cleanCitationArtifacts(String(raw || ''));
  if (!s || /^\|[\s-:|]+\|$/.test(s)) return '';
  if (s.startsWith('|') && s.endsWith('|')) {
    return s
      .replace(/^\|\s*/, '')
      .replace(/\s*\|$/, '')
      .replace(/\s*\|\s*/g, ' — ')
      .trim();
  }
  return s.replace(/^[-*•]\s+/, '').trim();
}

function isIgnoredReferenceUrl(url: string): boolean {
  const lower = url.toLowerCase();
  return (
    lower.includes('w3.org/2000/svg') ||
    lower.includes('w3.org/1999/xhtml') ||
    lower.includes('example.com')
  );
}

function extractUrlsFromText(text: string): StudyReference[] {
  const results: StudyReference[] = [];
  const seen = new Set<string>();

  const mdLinkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
  let mdMatch: RegExpExecArray | null;
  while ((mdMatch = mdLinkRegex.exec(text)) !== null) {
    const url = mdMatch[2].replace(/[.,;\\]+$/, '');
    if (!seen.has(url) && !isIgnoredReferenceUrl(url)) {
      seen.add(url);
      results.push({
        title: cleanCitationArtifacts(mdMatch[1].trim()) || getDomainFromUrl(url),
        url,
        domain: getDomainFromUrl(url),
      });
    }
  }

  const rawUrlRegex = /https?:\/\/[^\s<>()\]"']+/g;
  let urlMatch: RegExpExecArray | null;
  while ((urlMatch = rawUrlRegex.exec(text)) !== null) {
    const url = urlMatch[0].replace(/[.,;!?\\]+$/, '');
    if (!seen.has(url) && !isIgnoredReferenceUrl(url)) {
      seen.add(url);
      const domain = getDomainFromUrl(url);
      results.push({ title: domain, url, domain });
    }
  }

  return results.slice(0, 8);
}

function safeParseStudyJson<T = any>(rawText: unknown): T | null {
  return parseStudyJsonShared<T>(rawText);
}

function safeParseJson<T = any>(rawText: string | undefined, fallback: T): T {
  const parsed = safeParseStudyJson<T>(rawText);
  return parsed !== null ? parsed : fallback;
}

function normalizeProblemSolution(raw: any): ProblemSolution | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const steps = Array.isArray(raw.steps)
    ? raw.steps
        .map((st: any, idx: number) => ({
          step_number: Number(st?.step_number) || idx + 1,
          title: cleanCitationArtifacts(String(st?.title || `Step ${idx + 1}`)),
          explanation: cleanCitationArtifacts(String(st?.explanation || '')),
          equation_latex: st?.equation_latex
            ? cleanCitationArtifacts(String(st.equation_latex))
            : undefined,
        }))
        .filter((st: any) => st.explanation || st.equation_latex)
    : [];

  const given = Array.isArray(raw.given_parameters)
    ? raw.given_parameters
        .map((g: any) => ({
          label: cleanCitationArtifacts(String(g?.label || '')),
          value_latex: cleanCitationArtifacts(String(g?.value_latex || '')),
        }))
        .filter((g: any) => g.label || g.value_latex)
    : [];

  const formulas = Array.isArray(raw.key_formulas)
    ? raw.key_formulas
        .map((f: any) => ({
          name: cleanCitationArtifacts(String(f?.name || '')),
          latex: cleanCitationArtifacts(String(f?.latex || '')),
        }))
        .filter((f: any) => f.name || f.latex)
    : [];

  const finalAns = cleanCitationArtifacts(String(raw.final_answer_latex || ''));
  const hasSolution =
    Boolean(raw.has_solution) && (steps.length > 0 || Boolean(finalAns) || formulas.length > 0);

  if (!hasSolution) return undefined;

  return {
    has_solution: true,
    given_parameters: given,
    key_formulas: formulas,
    steps,
    final_answer_latex: finalAns,
  };
}

function normalizeInfographic(raw: any): StudyInfographic | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const allowedTypes = ['flowchart', 'layered_architecture', 'comparison_bars', 'svg_diagram'];
  const type = allowedTypes.includes(raw.type) ? raw.type : undefined;
  if (!type) return undefined;

  const caption = cleanCitationArtifacts(String(raw.caption || 'Visual Concept Diagram'));
  const nodes = Array.isArray(raw.nodes)
    ? raw.nodes
        .map((n: any, idx: number) => ({
          id: String(n?.id || `node-${idx + 1}`),
          label: cleanCitationArtifacts(String(n?.label || '')),
          sublabel: cleanCitationArtifacts(String(n?.sublabel || '')),
          badge: n?.badge ? cleanCitationArtifacts(String(n.badge)) : undefined,
          accent: ['blue', 'emerald', 'amber', 'purple', 'rose'].includes(n?.accent)
            ? n.accent
            : undefined,
        }))
        .filter((n: any) => n.label)
    : undefined;

  const metrics = Array.isArray(raw.metrics)
    ? raw.metrics
        .map((m: any) => ({
          label: cleanCitationArtifacts(String(m?.label || '')),
          value_display: cleanCitationArtifacts(String(m?.value_display || '')),
          percentage: Math.max(0, Math.min(100, Number(m?.percentage) || 0)),
          note: cleanCitationArtifacts(String(m?.note || '')),
        }))
        .filter((m: any) => m.label)
    : undefined;

  const svgMarkup = sanitizeSvgString(raw.svg_markup);

  if (
    (type === 'flowchart' || type === 'layered_architecture') &&
    (!nodes || nodes.length === 0)
  ) {
    return undefined;
  }
  if (type === 'comparison_bars' && (!metrics || metrics.length === 0)) {
    return undefined;
  }
  if (type === 'svg_diagram' && !svgMarkup) {
    return undefined;
  }

  return {
    type,
    caption,
    nodes,
    metrics,
    svg_markup: svgMarkup,
  };
}

function normalizeRichStudyResponse(
  rawObj: any,
  fallbackTitle: string,
  fallbackSubject: string,
  extraRefs: StudyReference[] = []
): RichStudyResponse {
  const title = cleanCitationArtifacts(String(rawObj?.title || fallbackTitle)) || fallbackTitle;
  const subjectTag =
    cleanCitationArtifacts(String(rawObj?.subject_tag || fallbackSubject || 'Academic Study')) ||
    'Academic Study';
  const coreIntuition = cleanCitationArtifacts(
    String(rawObj?.core_intuition || rawObj?.overview || '')
  );
  const explanationMarkdown = cleanCitationArtifacts(
    String(rawObj?.explanation_markdown || rawObj?.explanation || '')
  );

  const rawTakeaways = Array.isArray(rawObj?.key_takeaways)
    ? rawObj.key_takeaways
    : Array.isArray(rawObj?.keyPoints)
    ? rawObj.keyPoints
    : [];
  const keyTakeaways = rawTakeaways.map(sanitizeArrayLine).filter(Boolean).slice(0, 8);

  const rawTips = Array.isArray(rawObj?.exam_tips)
    ? rawObj.exam_tips
    : Array.isArray(rawObj?.examTips)
    ? rawObj.examTips
    : [];
  const examTips = rawTips.map(sanitizeArrayLine).filter(Boolean).slice(0, 6);

  const modelRefs: StudyReference[] = Array.isArray(rawObj?.references)
    ? rawObj.references
        .filter((r: any) => r?.url && /^https?:\/\//i.test(String(r.url)))
        .map((r: any) => {
          const url = String(r.url).trim();
          return {
            title: cleanCitationArtifacts(String(r.title || getDomainFromUrl(url))),
            url,
            domain: String(r.domain || getDomainFromUrl(url)),
          };
        })
    : [];

  const mergedRefs = [...modelRefs, ...extraRefs]
    .filter((r, idx, arr) => r.url && arr.findIndex((x) => x.url === r.url) === idx)
    .slice(0, 8);

  return {
    title,
    subject_tag: subjectTag,
    core_intuition: coreIntuition,
    explanation_markdown: explanationMarkdown,
    problem_solution: normalizeProblemSolution(rawObj?.problem_solution),
    infographic: normalizeInfographic(rawObj?.infographic),
    key_takeaways: keyTakeaways,
    exam_tips: examTips,
    references: mergedRefs,
  };
}

function parseMarkdownFallbackToRichStudy(
  rawText: string,
  fallbackTitle: string,
  fallbackSubject: string,
  extraRefs: StudyReference[] = []
): RichStudyResponse {
  // CRITICAL: Parse JSON FIRST on raw model output before cleanCitationArtifacts runs,
  // so valid JSON escapes (\\frac, \\nabla) are never corrupted before JSON.parse().
  const parsedJson = safeParseStudyJson<any>(rawText);
  if (
    parsedJson &&
    typeof parsedJson === 'object' &&
    (parsedJson.explanation_markdown ||
      parsedJson.explanation ||
      parsedJson.core_intuition ||
      Array.isArray(parsedJson.key_takeaways) ||
      parsedJson.problem_solution ||
      parsedJson.infographic ||
      parsedJson.title)
  ) {
    return normalizeRichStudyResponse(
      parsedJson,
      fallbackTitle,
      fallbackSubject,
      [...extraRefs, ...extractUrlsFromText(rawText)]
    );
  }

  // Never dump raw JSON strings into core_intuition or explanation_markdown
  if (looksLikeRawJsonObject(rawText)) {
    return normalizeRichStudyResponse(
      {
        title: fallbackTitle,
        subject_tag: fallbackSubject || 'Academic Study',
        core_intuition: `Structured study guide for ${fallbackTitle}.`,
        explanation_markdown:
          'The AI response could not be formatted cleanly. Please retry your query for the full textbook layout.',
        key_takeaways: [],
        exam_tips: [],
      },
      fallbackTitle,
      fallbackSubject,
      [...extraRefs, ...extractUrlsFromText(rawText)]
    );
  }

  const sanitized = cleanCitationArtifacts(rawText);
  const lines = sanitized.split('\n');
  let title = fallbackTitle;
  const intuitionLines: string[] = [];
  const explanationLines: string[] = [];
  const keyTakeaways: string[] = [];
  const examTips: string[] = [];
  let section: 'intuition' | 'explanation' | 'takeaways' | 'tips' | 'references' = 'explanation';
  const isTableSep = (s: string) => /^\|[\s-:|]+\|$/.test(s.trim());

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const lower = line.toLowerCase();
    if (/^#{1,3}\s*title[:\s]/i.test(line) || /^title:\s*/i.test(line)) {
      title =
        line.replace(/^#{1,3}\s*title[:\s]*/i, '').replace(/^title:\s*/i, '').trim() || title;
      continue;
    }
    if (/^#{1,3}\s*(core\s*intuition|intuition|overview)/i.test(line)) {
      section = 'intuition';
      continue;
    }
    if (
      /^#{1,3}\s*(key\s*(points|takeaways)|takeaways|highlights)/i.test(line) ||
      /^\*{0,2}key\s*(points|takeaways)[:\s*]*$/i.test(lower)
    ) {
      section = 'takeaways';
      continue;
    }
    if (
      /^#{1,3}\s*(exam\s*tips|pitfalls|common\s*mistakes)/i.test(line) ||
      /^\*{0,2}exam\s*tips[:\s*]*$/i.test(lower)
    ) {
      section = 'tips';
      continue;
    }
    if (
      /^#{1,3}\s*(references|sources|links)/i.test(line) ||
      /^\*{0,2}(verified\s*)?references[:\s*]*$/i.test(lower)
    ) {
      section = 'references';
      continue;
    }
    if (/^#{1,3}\s*explanation/i.test(line)) {
      section = 'explanation';
      continue;
    }

    if (section === 'intuition') {
      if (line) intuitionLines.push(line);
    } else if (section === 'takeaways') {
      if (isTableSep(line)) continue;
      const cleaned = sanitizeArrayLine(line);
      if (cleaned) keyTakeaways.push(cleaned);
    } else if (section === 'tips') {
      if (isTableSep(line)) continue;
      const cleaned = sanitizeArrayLine(line);
      if (cleaned) examTips.push(cleaned);
    } else if (section === 'explanation') {
      explanationLines.push(rawLine);
    }
  }

  const expl = explanationLines.join('\n').trim() || sanitized.trim();
  const intuition =
    intuitionLines.join(' ').trim() ||
    expl
      .replace(/```[\s\S]*?```/g, '')
      .replace(/#{1,4}\s+/g, '')
      .split(/(?<=[.!?])\s+/)
      .slice(0, 2)
      .join(' ')
      .slice(0, 280);

  return normalizeRichStudyResponse(
    {
      title,
      subject_tag: fallbackSubject || 'Academic Study',
      core_intuition: intuition,
      explanation_markdown: expl,
      key_takeaways: keyTakeaways.slice(0, 6),
      exam_tips: examTips.slice(0, 4),
    },
    fallbackTitle,
    fallbackSubject,
    [...extraRefs, ...extractUrlsFromText(sanitized)]
  );
}

function buildDeterministicBriefing(
  date: string,
  attendance: Record<string, any>,
  todayClasses: any[],
  upcomingDeadlines: any[]
) {
  const totalHeld = Number(attendance?.totalHeld || 0);
  const pct = Number(attendance?.percentage || 0);
  const target = Number(attendance?.target || attendance?.theoryTarget || 75);
  const safeBunks = Number(attendance?.safeBunks || 0);
  const recoveryClasses = Number(attendance?.recoveryClasses || 0);
  const theoryHeld = Number(attendance?.theoryHeld || 0);
  const theoryPct = Number(attendance?.theoryPct || 0);
  const labHeld = Number(attendance?.labHeld || 0);
  const labTarget = Number(attendance?.labTarget || 80);
  const labPct = Number(attendance?.labPct || 0);

  const firstDeadline =
    Array.isArray(upcomingDeadlines) && upcomingDeadlines.length > 0 ? upcomingDeadlines[0] : null;

  return {
    headline: 'Today’s Morning Game Plan',
    bullets: [
      {
        tag: 'Attendance',
        title: totalHeld > 0 ? `${pct.toFixed(1)}% Standing` : 'Fresh Ledger',
        detail:
          totalHeld === 0
            ? 'Mark today’s classes to unlock real-time bunk projections.'
            : safeBunks > 0
            ? `You hold ${safeBunks} safe bunk${safeBunks === 1 ? '' : 's'} above ${target}%.`
            : `Attend the next ${recoveryClasses} consecutive class${
                recoveryClasses === 1 ? '' : 'es'
              } to reach ${target}%.`,
        tone: safeBunks > 0 ? 'emerald' : totalHeld === 0 ? 'blue' : 'rose',
      },
      {
        tag: 'Theory & Lab',
        title: labHeld > 0 && labPct < labTarget ? 'Lab Threshold Watch' : 'Dual-Rule Balance',
        detail:
          labHeld > 0 && labPct < labTarget
            ? `Lab standing (${labPct.toFixed(1)}%) is below your ${labTarget}% lab target — prioritize practicals today.`
            : `Theory (${theoryHeld > 0 ? `${theoryPct.toFixed(1)}%` : '—'}) and Labs (${
                labHeld > 0 ? `${labPct.toFixed(1)}%` : '—'
              }) are both on track.`,
        tone: labHeld > 0 && labPct < labTarget ? 'amber' : 'blue',
      },
      {
        tag: 'Priority Prep',
        title: firstDeadline ? `${firstDeadline.subject} Upcoming` : 'Today’s Schedule',
        detail: firstDeadline
          ? `${firstDeadline.title} scheduled for ${String(firstDeadline.date || date).slice(0, 10)}.`
          : `${todayClasses.length} session${
              todayClasses.length === 1 ? '' : 's'
            } scheduled on ${date}. Review notes early.`,
        tone: firstDeadline ? 'amber' : 'blue',
      },
    ],
  };
}

const RICH_STUDY_TEXTBOOK_INSTRUCTIONS = `Output ONLY a single raw valid JSON object (zero markdown code fences like \`\`\`json, zero prose outside JSON) matching this exact RichStudyResponse interface:
{
  "title": string,
  "subject_tag": string,
  "core_intuition": string, // 2 crisp sentences plain-English explanation (inline $LaTeX$ allowed)
  "explanation_markdown": string, // High-yield, crisp textbook explanation (350-500 words max) using ### headings, **bold**, inline \`code\`, fenced code blocks (\`\`\`lang ... \`\`\`), compact Markdown pipe tables, and LaTeX math
  "problem_solution": { // Populate ONLY when query involves math, derivations, circuits, algorithms, complexity, or numerical problem solving; otherwise omit or set has_solution: false
    "has_solution": boolean,
    "given_parameters": [{"label": string, "value_latex": string}],
    "key_formulas": [{"name": string, "latex": string}],
    "steps": [{"step_number": number, "title": string, "explanation": string, "equation_latex": string}],
    "final_answer_latex": string
  },
  "infographic": { // ALWAYS include a compact, high-clarity visual infographic
    "type": "flowchart" | "layered_architecture" | "comparison_bars" | "svg_diagram",
    "caption": string,
    "nodes": [{"id": string, "label": string, "sublabel": string, "badge": string, "accent": "blue" | "emerald" | "amber" | "purple" | "rose"}], // 3-5 compact nodes for flowchart & layered_architecture
    "metrics": [{"label": string, "value_display": string, "percentage": number, "note": string}], // Required for comparison_bars (0-100)
    "svg_markup": string // Clean compact <svg viewBox="0 0 640 240" ...> with labeled boxes, directional arrows, curves, or schematics using strokes #3b82f6, #10b981, #f59e0b, #8b5cf6 and fill="currentColor" text labels
  },
  "key_takeaways": string[], // 3-5 concise single-line bullets (NO Markdown pipe tables inside strings)
  "exam_tips": string[], // 2-3 practical exam pitfalls & memory hooks (NO Markdown pipe tables inside strings)
  "references": [{"title": string, "url": string, "domain": string}]
}

MATHEMATICAL, VISUAL & TOKEN-EFFICIENCY RULES:
1. Keep "explanation_markdown" focused, structured, and crisp (350-500 words max) with zero filler prose.
2. Enforce strict JSON double-escaped backslashes for ALL LaTeX commands inside JSON strings (e.g., "\\\\frac{a}{b}", "\\\\sigma", "\\\\cdot", "\\\\times", "\\\\nabla", "\\\\theta"). Wrap inline math in $ ... $ and standalone equations in $$ ... $$. Inside problem_solution fields (value_latex, key_formulas.latex, equation_latex, final_answer_latex), write pure LaTeX expressions cleanly (without $$ wrappers).
3. Whenever solving a numerical problem, derivation, circuit, or algorithm trace, set problem_solution.has_solution = true and include clear algebraic/logical steps; for conceptual-only queries, set has_solution = false.
4. ALWAYS generate a compact "infographic" object: prefer "svg_diagram" (viewBox="0 0 640 240") for physics/math/circuit/crystal/tree diagrams, "flowchart" for process stages, "layered_architecture" for OSI/memory/software stacks, or "comparison_bars" for tradeoffs.
5. Never include internal search citation artifacts like [2*L28-L33] or raw code fences wrapping the outer JSON.`;

export async function POST(req: NextRequest) {
  try {
    const geminiKey = process.env.GEMINI_API_KEY;
    const groqKey = process.env.GROQ_API_KEY;

    if (!geminiKey && !groqKey) {
      return NextResponse.json(
        {
          error_code: 'MISSING_API_KEY',
          message:
            'AI keys (GEMINI_API_KEY / GROQ_API_KEY) are not configured in this preview environment yet.',
        },
        { status: 503, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const mode = (body.mode || body.action) as AiMode;
    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      'anon';
    const rateKey = `${body.userId || clientIp}:${mode || 'ai'}`;

    const limit = checkRateLimit(rateKey);
    if (!limit.allowed) {
      return NextResponse.json(
        {
          error_code: 'TOKEN_LIMIT_EXCEEDED',
          message: TOKEN_LIMIT_MESSAGE,
          retryAfterSeconds: Math.min(limit.retryAfterSec || 45, 45),
        },
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const gemini = getGeminiClient(mode === 'daily_briefing' ? 10_000 : 18_000);
    const hasGroq = !!groqKey;

    // =========================================================================
    // MODE 1: parse_records (Snap-to-Ledger & Natural Language Organizer)
    // =========================================================================
    if (mode === 'parse_records') {
      const { prompt = '', imageBase64, imageMimeType, subjects = [], todayDate } = body;

      if (!prompt.trim() && !imageBase64) {
        return NextResponse.json(
          { error: 'Provide a text instruction or upload an image of a circular/datesheet.' },
          { status: 400 }
        );
      }

      const today = todayDate || new Date().toISOString().split('T')[0];
      const knownSubjects =
        Array.isArray(subjects) && subjects.length > 0 ? subjects.join(', ') : 'None provided';

      const sysInstruction = `You are ShouldISkip's Snap-to-Ledger parser for college students.
Today's date is ${today}.
Student's enrolled subjects: ${knownSubjects}.
Extract structured student records from the user's text and/or uploaded circular/datesheet image.
Classify the overall batch into one primary type: "exam", "assignment", or "attendance".
Rules:
- Use YYYY-MM-DD for dates and HH:MM (24-hour) for times.
- For "assignment", provide "due_date" as YYYY-MM-DDTHH:MM (default 23:59 if time is omitted).
- For "exam", provide "date" (exam_date), optional "start_time", "end_time", "room_no", "syllabus_topics" (array of topic strings), and "classes_optional" (boolean, default true).
- For "attendance", provide "date" and "status" ("present" | "absent" | "od").
- Match subject names cleanly against the student's enrolled subjects when obvious, otherwise keep the extracted subject name.
Return strictly valid JSON matching the requested schema.`;

      const userPromptText =
        prompt.trim() || 'Extract all exam dates, assignment deadlines, or attendance updates from this image.';

      if (gemini) {
        try {
          const parts: any[] = [];
          if (imageBase64) {
            const cleanBase64 = String(imageBase64).includes(',')
              ? String(imageBase64).split(',')[1]
              : String(imageBase64);
            parts.push({
              inlineData: {
                mimeType: imageMimeType || 'image/png',
                data: cleanBase64,
              },
            });
          }
          parts.push({ text: userPromptText });

          const response = await callGeminiWithFallback(gemini, {
            contents: { parts },
            skipSecondaryModel: hasGroq && !imageBase64,
            config: {
              systemInstruction: sysInstruction,
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  type: { type: Type.STRING, description: 'One of: exam, assignment, attendance' },
                  summary: { type: Type.STRING, description: 'Short 1-sentence confirmation summary' },
                  items: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        subject: { type: Type.STRING },
                        title: { type: Type.STRING },
                        date: { type: Type.STRING, description: 'YYYY-MM-DD' },
                        due_date: { type: Type.STRING, description: 'YYYY-MM-DDTHH:MM' },
                        start_time: { type: Type.STRING, description: 'HH:MM' },
                        end_time: { type: Type.STRING, description: 'HH:MM' },
                        room_no: { type: Type.STRING },
                        description: { type: Type.STRING },
                        syllabus_topics: {
                          type: Type.ARRAY,
                          items: { type: Type.STRING },
                        },
                        classes_optional: { type: Type.BOOLEAN },
                        status: { type: Type.STRING, description: 'present, absent, or od' },
                      },
                      required: ['subject'],
                    },
                  },
                },
                required: ['type', 'items'],
              },
            },
          });

          const parsed = safeParseJson(response.text, {
            type: 'assignment',
            items: [],
            summary: '',
          });
          return NextResponse.json({
            engine: 'gemini',
            type: ['exam', 'assignment', 'attendance'].includes(parsed.type)
              ? parsed.type
              : 'assignment',
            summary: parsed.summary || 'Extracted staged items for review.',
            items: Array.isArray(parsed.items) ? parsed.items : [],
          });
        } catch (geminiErr) {
          console.warn('Gemini parse_records failed:', geminiErr);
          if (!hasGroq || imageBase64) throw geminiErr;
        }
      }

      if (imageBase64) {
        return NextResponse.json(
          { error: 'Image parsing requires GEMINI_API_KEY. Please paste text details instead.' },
          { status: 400 }
        );
      }

      const groqRes = await callGroqChat(
        [
          {
            role: 'system',
            content: `${sysInstruction}\nReturn JSON with keys: "type" ("exam"|"assignment"|"attendance"), "summary" (string), and "items" (array of objects).`,
          },
          { role: 'user', content: userPromptText },
        ],
        { jsonMode: true }
      );
      const parsed = safeParseJson(groqRes?.choices?.[0]?.message?.content, {
        type: 'assignment',
        items: [],
        summary: '',
      });
      return NextResponse.json({
        engine: 'groq',
        type: ['exam', 'assignment', 'attendance'].includes(parsed.type)
          ? parsed.type
          : 'assignment',
        summary: parsed.summary || 'Extracted staged items for review.',
        items: Array.isArray(parsed.items) ? parsed.items : [],
      });
    }

    // =========================================================================
    // MODE 2: study_material (100% Private Notes-First Textbook Synthesis)
    // =========================================================================
    if (mode === 'study_material') {
      const {
        subject = '',
        syllabusTopics = [],
        notesList = [],
        studyMode = body.artifactMode || (body.mode !== 'study_material' ? body.mode : 'summary'),
      } = body;

      const normalizedMode: 'summary' | 'gap_analysis' | 'flashcards' =
        studyMode === 'gap_analysis' || studyMode === 'flashcards' ? studyMode : 'summary';

      if (!subject.trim()) {
        return NextResponse.json({ error: 'Subject is required.' }, { status: 400 });
      }

      const cleanNotes = (Array.isArray(notesList) ? notesList : []).map((n: any) => ({
        title: String(n.title || 'Untitled Note').trim(),
        unit_tag: n.unit_tag ? String(n.unit_tag).trim() : null,
        content: String(n.content || '').trim(),
      }));

      const cleanSyllabus = (Array.isArray(syllabusTopics) ? syllabusTopics : [])
        .map((t: any) => (typeof t === 'string' ? t : t?.topic || ''))
        .map((s: string) => s.trim())
        .filter(Boolean);

      const sourceHash = crypto
        .createHash('sha256')
        .update(
          JSON.stringify({
            schema: 'rich-v4',
            userId: body.userId || 'private',
            subject: subject.trim().toLowerCase(),
            mode: normalizedMode,
            syllabus: cleanSyllabus,
            notes: cleanNotes.map((n) => `${n.title}|${n.unit_tag || ''}|${n.content}`),
          })
        )
        .digest('hex');

      // Strictly private user cache in public.ai_study_artifacts
      const sb = getSupabaseForRequest(req);
      if (sb && body.userId) {
        try {
          const { data: cachedRow } = await sb
            .from('ai_study_artifacts')
            .select('*')
            .eq('user_id', body.userId)
            .eq('source_hash', sourceHash)
            .limit(1)
            .maybeSingle();

          const cachedPayload = cachedRow?.payload || cachedRow?.content;
          if (cachedPayload) {
            return NextResponse.json({
              cached: true,
              sourceHash,
              artifactType: normalizedMode,
              subject,
              ...(typeof cachedPayload === 'string'
                ? safeParseJson(cachedPayload, {})
                : cachedPayload),
            });
          }
        } catch {
          // Non-fatal if table does not exist yet
        }
      }

      if (cleanNotes.length === 0 && normalizedMode !== 'gap_analysis') {
        return NextResponse.json({
          cached: false,
          sourceHash,
          artifactType: normalizedMode,
          subject,
          title: `${subject} — Notes Needed`,
          overview:
            'No personal notes were found for this subject yet. Add notes to your private Subject Notes Pool or ask the Web Study Tutor to generate and save textbook study material.',
          sections: [],
          missingTopics: cleanSyllabus.map((t: string) => `${t} [Not in Your Notes]`),
          flashcards: [],
          citations: [],
        });
      }

      const formattedNotes =
        cleanNotes.length > 0
          ? cleanNotes
              .map(
                (n, i) =>
                  `[Note ${i + 1}: "${n.title}"${n.unit_tag ? ` (${n.unit_tag})` : ''}]\n${n.content}`
              )
              .join('\n\n---\n\n')
          : '(No notes provided)';

      const formattedSyllabus =
        cleanSyllabus.length > 0 ? cleanSyllabus.join(', ') : '(No syllabus topics provided)';

      const strictPrompt = `You are a strict, zero-hallucination private academic study synthesizer for "${subject}".
Use ONLY the user's provided personal notes and syllabus below.
Ground every fact, formula, and example strictly in the provided student notes and cite the exact note title.
Mark any syllabus topic not present in the notes as "[Not in Your Notes]".
Do NOT invent facts, formulas, or definitions that are not present in the provided notes.

TASK MODE: ${normalizedMode}
SYLLABUS TOPICS: ${formattedSyllabus}

PERSONAL STUDENT NOTES:
${formattedNotes}

Instructions by mode:
- If "summary":
  1. Produce concise, high-yield revision "sections" grouped by concept/unit, where each point cites the exact note title in "citation". Use clean LaTeX ($...$ / $$...$$) for any math/equations found in the notes.
  2. Also populate "rich_study" following the RichStudyResponse textbook layout strictly grounded in the user's notes (including "core_intuition", "explanation_markdown" with ### headings and LaTeX, "problem_solution" ONLY if numerical/formula derivations exist in the notes, "infographic" ONLY for structures/flows/comparisons explicitly present in the notes, "key_takeaways", and "exam_tips").
  3. List any syllabus topics missing from the notes in "missingTopics" suffixed with " [Not in Your Notes]".
- If "gap_analysis": Compare SYLLABUS TOPICS against PERSONAL STUDENT NOTES. List covered topics (with the citing note title) in "coveredTopics", and list every missing or insufficiently covered syllabus topic in "missingTopics" suffixed with " [Not in Your Notes]".
- If "flashcards": Generate 6-12 crisp Q&A flashcards strictly from the provided student notes (wrapping formulas in $...$), each with "front", "back", and "citation" (exact note title).

Return strictly valid JSON.`;

      let rawResult: any = null;
      let usedEngine: 'gemini' | 'groq' = 'gemini';

      if (gemini) {
        try {
          const response = await callGeminiWithFallback(gemini, {
            contents: `${strictPrompt}\n\nFor rich_study:\n${RICH_STUDY_TEXTBOOK_INSTRUCTIONS}`,
            skipSecondaryModel: hasGroq,
            config: {
              responseMimeType: 'application/json',
            },
          });
          rawResult = safeParseStudyJson(response.text);
        } catch (geminiErr) {
          console.warn('Gemini study_material failed:', geminiErr);
          if (!hasGroq) throw geminiErr;
        }
      }

      if (!rawResult && hasGroq) {
        usedEngine = 'groq';
        const groqRes = await callGroqChat(
          [
            {
              role: 'system',
              content: `Output ONLY raw valid JSON with double-escaped backslashes for all LaTeX commands (\\\\frac, \\\\sigma, \\\\cdot, \\\\times) and zero markdown code fences. Keys: "title", "overview", "sections" ([{heading, points: [{text, citation}]}]), "coveredTopics" ([{topic, citation}]), "missingTopics" (string[]), "flashcards" ([{front, back, citation}]), "citations" (string[]), and optional "rich_study" matching the RichStudyResponse schema.\n${RICH_STUDY_TEXTBOOK_INSTRUCTIONS}`,
            },
            { role: 'user', content: strictPrompt },
          ],
          { jsonMode: true }
        );
        rawResult =
          safeParseStudyJson(groqRes?.choices?.[0]?.message?.content) || {
            title: `${subject} Study Pack`,
            overview: 'Generated from your private notes.',
            sections: [],
            coveredTopics: [],
            missingTopics: [],
            flashcards: [],
            citations: [],
          };
      }

      const fallbackObj = {
        title: `${subject} Study Pack`,
        overview: 'Generated from your private notes.',
        sections: [],
        coveredTopics: [],
        missingTopics: [],
        flashcards: [],
        citations: [],
      };
      const baseJson = rawResult && typeof rawResult === 'object' ? rawResult : fallbackObj;

      const richStudy =
        normalizedMode === 'summary'
          ? normalizeRichStudyResponse(
              baseJson.rich_study || {
                title: baseJson.title,
                subject_tag: subject,
                core_intuition: baseJson.overview,
                explanation_markdown: (Array.isArray(baseJson.sections) ? baseJson.sections : [])
                  .map(
                    (sec: any) =>
                      `### ${sec.heading}\n${(sec.points || [])
                        .map((p: any) => `- ${p.text} *(${p.citation})*`)
                        .join('\n')}`
                  )
                  .join('\n\n'),
                key_takeaways: (baseJson.citations || []).slice(0, 5),
                exam_tips: [],
              },
              baseJson.title || `${subject} Revision Guide`,
              subject
            )
          : undefined;

      const resultJson = {
        title: cleanCitationArtifacts(String(baseJson.title || `${subject} Study Pack`)),
        overview: cleanCitationArtifacts(
          String(baseJson.overview || richStudy?.core_intuition || 'Generated from your private notes.')
        ),
        sections: Array.isArray(baseJson.sections)
          ? baseJson.sections.map((sec: any) => ({
              heading: cleanCitationArtifacts(String(sec?.heading || 'Key Concepts')),
              points: Array.isArray(sec?.points)
                ? sec.points.map((pt: any) => ({
                    text: cleanCitationArtifacts(String(pt?.text || '')),
                    citation: cleanCitationArtifacts(String(pt?.citation || 'Personal Note')),
                  }))
                : [],
            }))
          : [],
        coveredTopics: Array.isArray(baseJson.coveredTopics) ? baseJson.coveredTopics : [],
        missingTopics: Array.isArray(baseJson.missingTopics) ? baseJson.missingTopics : [],
        flashcards: Array.isArray(baseJson.flashcards) ? baseJson.flashcards : [],
        citations: Array.isArray(baseJson.citations) ? baseJson.citations : [],
        ...(richStudy ? { richStudy } : {}),
      };

      // Strictly private server-side cache write
      if (sb && body.userId) {
        try {
          await sb.from('ai_study_artifacts').insert({
            user_id: body.userId,
            subject: subject.trim(),
            unit_tag: 'Full Syllabus',
            artifact_type: normalizedMode,
            source_hash: sourceHash,
            payload: resultJson,
          });
        } catch {
          // Client handles fallback insert silently
        }
      }

      return NextResponse.json({
        cached: false,
        engine: usedEngine,
        sourceHash,
        artifactType: normalizedMode,
        subject,
        ...resultJson,
      });
    }

    // =========================================================================
    // MODE 3: web_study_tutor (4-Step TPM Waterfall + Public Topic Cache)
    // =========================================================================
    if (mode === 'web_study_tutor') {
      const subject = String(body.subject || '').trim();
      const topic = String(body.topic || '').trim();
      const question = String(body.question || '').trim();
      const attachedNotes = String(body.attachedNotesText ?? body.contextNotes ?? '')
        .trim()
        .slice(0, 6000);
      const queryTopic = topic || question;

      if (!queryTopic) {
        return NextResponse.json(
          { error: 'Enter a topic or question to research.' },
          { status: 400 }
        );
      }

      const hasPrivateNotes = attachedNotes.length > 0;
      const cacheKey = `${subject.toLowerCase()}::${topic.toLowerCase()}::${question.toLowerCase()}`;
      const publicSb = getPublicSupabaseClient(req);
      const authSb = getSupabaseForRequest(req);

      // Step 0: Global Public Textbook Topic Cache (ONLY when no private user notes attached)
      if (!hasPrivateNotes && publicSb) {
        try {
          const { data: cachedRow } = await publicSb
            .from('ai_topic_cache')
            .select('payload, subject, topic')
            .eq('cache_key', cacheKey)
            .maybeSingle();

          if (cachedRow?.payload) {
            const rawCached =
              typeof cachedRow.payload === 'string'
                ? safeParseStudyJson<any>(cachedRow.payload)
                : cachedRow.payload;
            if (rawCached && typeof rawCached === 'object') {
              const cachedRichStudy = normalizeRichStudyResponse(
                rawCached,
                queryTopic,
                subject || cachedRow.subject || 'General'
              );
              return NextResponse.json({
                cached: true,
                engine: 'cache',
                model: 'ai_topic_cache',
                ...cachedRichStudy,
                richStudy: cachedRichStudy,
                explanation: cachedRichStudy.explanation_markdown,
                keyPoints: cachedRichStudy.key_takeaways,
                examTips: cachedRichStudy.exam_tips,
              });
            }
          }
        } catch {
          // Non-fatal if public.ai_topic_cache table has not been provisioned yet
        }
      }

      // Stateless high-efficiency prompt (no chatHistory bloat)
      const tutorPrompt = `Subject: ${subject || 'General University Course'}
Topic / Doubt: ${queryTopic}
${question && topic ? `Specific Question / Problem Statement: ${question}` : ''}
${hasPrivateNotes ? `Student's personal note context:\n${attachedNotes}` : ''}

Produce a crisp, publication-grade digital textbook response tailored for university exam prep and deep conceptual mastery.

${RICH_STUDY_TEXTBOOK_INSTRUCTIONS}`;

      const strictJsonSystemPrompt = `You are ShouldISkip's Academic Textbook AI Tutor. Output ONLY raw valid JSON with double-escaped backslashes for all LaTeX commands (\\\\frac, \\\\sigma, \\\\cdot, \\\\times) and zero markdown code fences.\n${RICH_STUDY_TEXTBOOK_INSTRUCTIONS}`;
      const geminiSystemInstruction = `You are ShouldISkip's Academic Textbook AI Tutor. Output ONLY raw valid JSON matching the RichStudyResponse schema with properly escaped backslashes (\\\\frac, \\\\sigma, \\\\cdot, \\\\times) for all LaTeX commands and zero markdown code fences. Keep explanation_markdown crisp (350-500 words max).`;

      let resolvedRichStudy: RichStudyResponse | null = null;
      let resolvedEngine: 'groq' | 'gemini' = 'gemini';
      let resolvedModel = 'gemini-3.8-flash';
      let attemptedModels = 0;
      let rateLimitModels = 0;

      // Step 1 (Primary): Google Gemini Flash (gemini-3.8-flash -> fallback on 404 to gemini-4-hydrogen)
      if (!resolvedRichStudy && gemini) {
        attemptedModels += 1;
        try {
          const { response, model } = await callGeminiModelCandidates(
            gemini,
            ['gemini-3.8-flash', 'gemini-4-hydrogen'],
            {
              contents: tutorPrompt,
              fastMode: true,
              config: {
                systemInstruction: geminiSystemInstruction,
                responseMimeType: 'application/json',
              },
            }
          );

          const rawText = String(response?.text || '');
          if (!rawText.trim()) {
            throw new Error(`Empty response from ${model}`);
          }

          resolvedRichStudy = parseMarkdownFallbackToRichStudy(
            rawText,
            queryTopic,
            subject || 'General'
          );
          resolvedEngine = 'gemini';
          resolvedModel = model;
        } catch (err1: any) {
          if (isRealRateLimitError(err1)) rateLimitModels += 1;
          console.warn('Waterfall Step 1 (Gemini Flash) fell back:', err1?.message || err1);
        }
      }

      // Discover active Groq models once if Groq fallback is needed
      const activeGroqModels =
        !resolvedRichStudy && groqKey ? await getActiveGroqChatModels(groqKey) : [];
      const groqModel1 = activeGroqModels[0];
      const groqModel2 = activeGroqModels[1];

      // Step 2 (Failover 1): First active Groq model (JSON mode, zero tools, 3200 maxTokens)
      if (!resolvedRichStudy && groqKey && groqModel1) {
        attemptedModels += 1;
        try {
          const groqRes = await callGroqChat(
            [
              { role: 'system', content: strictJsonSystemPrompt },
              { role: 'user', content: tutorPrompt },
            ],
            {
              model: groqModel1,
              useBrowserSearch: false,
              jsonMode: true,
              timeoutMs: 18_000,
              maxTokens: 3200,
            }
          );
          const rawContent = String(groqRes?.choices?.[0]?.message?.content || '');
          if (!rawContent.trim()) {
            throw new Error(`Empty response from ${groqModel1}`);
          }
          if (looksLikeRawJsonObject(rawContent) && !safeParseStudyJson(rawContent)) {
            throw new Error(`Unparseable raw JSON from ${groqModel1}`);
          }
          resolvedRichStudy = parseMarkdownFallbackToRichStudy(
            rawContent,
            queryTopic,
            subject || 'General'
          );
          resolvedEngine = 'groq';
          resolvedModel = groqModel1;
        } catch (err2: any) {
          if (isRealRateLimitError(err2)) rateLimitModels += 1;
          console.warn(`Waterfall Step 2 (${groqModel1}) fell back:`, err2?.message || err2);
        }
      }

      // Step 3 (Failover 2): Second active Groq model (JSON mode, zero tools, 3200 maxTokens)
      if (!resolvedRichStudy && groqKey && groqModel2) {
        attemptedModels += 1;
        try {
          const groqRes = await callGroqChat(
            [
              { role: 'system', content: strictJsonSystemPrompt },
              { role: 'user', content: tutorPrompt },
            ],
            {
              model: groqModel2,
              useBrowserSearch: false,
              jsonMode: true,
              timeoutMs: 18_000,
              maxTokens: 3200,
            }
          );
          const rawContent = String(groqRes?.choices?.[0]?.message?.content || '');
          if (!rawContent.trim()) {
            throw new Error(`Empty response from ${groqModel2}`);
          }
          if (looksLikeRawJsonObject(rawContent) && !safeParseStudyJson(rawContent)) {
            throw new Error(`Unparseable raw JSON from ${groqModel2}`);
          }
          resolvedRichStudy = parseMarkdownFallbackToRichStudy(
            rawContent,
            queryTopic,
            subject || 'General'
          );
          resolvedEngine = 'groq';
          resolvedModel = groqModel2;
        } catch (err3: any) {
          if (isRealRateLimitError(err3)) rateLimitModels += 1;
          console.warn(`Waterfall Step 3 (${groqModel2}) fell back:`, err3?.message || err3);
        }
      }

      // Step 4 (Failover 3): Google Gemini Flash-Lite (gemini-3.5-flash-lite -> fallback on 404 to gemini-3.1-flash-lite)
      if (!resolvedRichStudy && gemini) {
        attemptedModels += 1;
        try {
          const { response, model } = await callGeminiModelCandidates(
            gemini,
            ['gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'],
            {
              contents: tutorPrompt,
              fastMode: false,
              config: {
                systemInstruction: geminiSystemInstruction,
                responseMimeType: 'application/json',
              },
            }
          );

          const rawText = String(response?.text || '');
          if (!rawText.trim()) {
            throw new Error(`Empty response from ${model}`);
          }

          resolvedRichStudy = parseMarkdownFallbackToRichStudy(
            rawText,
            queryTopic,
            subject || 'General'
          );
          resolvedEngine = 'gemini';
          resolvedModel = model;
        } catch (err4: any) {
          if (isRealRateLimitError(err4)) rateLimitModels += 1;
          console.warn('Waterfall Step 4 (Gemini Flash-Lite) failed:', err4?.message || err4);
        }
      }

      if (!resolvedRichStudy) {
        // ONLY return 429 TOKEN_LIMIT_EXCEEDED if all attempted models returned 429 / rate limit
        if (attemptedModels > 0 && rateLimitModels === attemptedModels) {
          return NextResponse.json(
            {
              error_code: 'TOKEN_LIMIT_EXCEEDED',
              message: TOKEN_LIMIT_MESSAGE,
              retryAfterSeconds: 45,
            },
            { status: 429, headers: { 'Content-Type': 'application/json' } }
          );
        }

        return NextResponse.json(
          {
            error_code: 'AI_PROVIDER_ERROR',
            message: 'Temporary AI formatting hiccup. Please click retry.',
          },
          { status: 502, headers: { 'Content-Type': 'application/json' } }
        );
      }

      // Save non-private textbook topic response into public.ai_topic_cache (non-fatal)
      if (!hasPrivateNotes && authSb) {
        try {
          await authSb.from('ai_topic_cache').upsert(
            {
              cache_key: cacheKey,
              subject: subject || resolvedRichStudy.subject_tag || 'General',
              topic: queryTopic,
              payload: resolvedRichStudy,
            },
            { onConflict: 'cache_key', ignoreDuplicates: true }
          );
        } catch {
          // Graceful no-op if ai_topic_cache table doesn't exist yet or RLS prevents write
        }
      }

      return NextResponse.json({
        cached: false,
        engine: resolvedEngine,
        model: resolvedModel,
        ...resolvedRichStudy,
        richStudy: resolvedRichStudy,
        explanation: resolvedRichStudy.explanation_markdown,
        keyPoints: resolvedRichStudy.key_takeaways,
        examTips: resolvedRichStudy.exam_tips,
      });
    }

    // =========================================================================
    // MODE 4: daily_briefing (Smart Morning Game Plan)
    // =========================================================================
    if (mode === 'daily_briefing') {
      const {
        date,
        studentName = 'Student',
        attendance = {},
        todayClasses = [],
        upcomingDeadlines = [],
      } = body;

      const briefingPrompt = `Generate a sharp, motivating, actionable Morning Briefing for college student ${studentName} on ${date}.
Data snapshot:
- Overall Attendance: ${
        attendance.totalHeld > 0
          ? `${Number(attendance.percentage || 0).toFixed(1)}% (${attendance.totalAttended}/${
              attendance.totalHeld
            })`
          : 'Fresh ledger (no classes recorded yet)'
      }
- Theory: ${
        attendance.theoryHeld > 0
          ? `${Number(attendance.theoryPct || 0).toFixed(1)}% (target ${
              attendance.theoryTarget || 75
            }%)`
          : 'No theory classes yet'
      }
- Labs: ${
        attendance.labHeld > 0
          ? `${Number(attendance.labPct || 0).toFixed(1)}% (target ${attendance.labTarget || 80}%)`
          : 'No labs yet'
      }
- Margin: ${
        attendance.safeBunks > 0
          ? `${attendance.safeBunks} safe bunks available`
          : attendance.recoveryClasses > 0
          ? `Need +${attendance.recoveryClasses} consecutive classes`
          : 'Fresh start'
      }
- Today's Classes: ${JSON.stringify(todayClasses)}
- Upcoming Exams & Assignments (next 48h-7d): ${JSON.stringify(upcomingDeadlines)}

Produce EXACTLY 3 crisp, actionable bullet cards covering:
1. Attendance & Bunk Strategy for today's classes.
2. Theory/Lab risk or safe-margin check.
3. Priority deadline / exam prep action for today.`;

      let briefingJson: any = null;
      let briefingEngine: 'gemini' | 'groq' | 'deterministic' = 'gemini';

      if (gemini) {
        try {
          const response = await callGeminiWithFallback(gemini, {
            contents: briefingPrompt,
            skipSecondaryModel: true,
            config: {
              responseMimeType: 'application/json',
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  headline: { type: Type.STRING },
                  bullets: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        tag: { type: Type.STRING },
                        title: { type: Type.STRING },
                        detail: { type: Type.STRING },
                        tone: { type: Type.STRING, description: 'emerald, amber, rose, or blue' },
                      },
                      required: ['tag', 'title', 'detail', 'tone'],
                    },
                  },
                },
                required: ['headline', 'bullets'],
              },
            },
          });
          briefingJson = safeParseJson(response.text, {
            headline: 'Today’s Game Plan',
            bullets: [],
          });
        } catch (geminiErr) {
          console.warn('Gemini daily_briefing fallback:', geminiErr);
        }
      }

      if (!briefingJson && hasGroq) {
        try {
          briefingEngine = 'groq';
          const groqRes = await callGroqChat(
            [
              {
                role: 'system',
                content:
                  'Return strictly valid JSON: {"headline": string, "bullets": [{"tag": string, "title": string, "detail": string, "tone": "emerald"|"amber"|"rose"|"blue"}]} with exactly 3 bullets.',
              },
              { role: 'user', content: briefingPrompt },
            ],
            { jsonMode: true }
          );
          briefingJson = safeParseJson(groqRes?.choices?.[0]?.message?.content, {
            headline: 'Today’s Game Plan',
            bullets: [],
          });
        } catch (groqErr) {
          console.warn('Groq daily_briefing fallback:', groqErr);
        }
      }

      if (!briefingJson || !Array.isArray(briefingJson.bullets) || briefingJson.bullets.length === 0) {
        briefingEngine = 'deterministic';
        briefingJson = buildDeterministicBriefing(
          date,
          attendance,
          todayClasses,
          upcomingDeadlines
        );
      }

      return NextResponse.json({
        engine: briefingEngine,
        date,
        headline: briefingJson?.headline || 'Today’s Morning Game Plan',
        bullets: Array.isArray(briefingJson?.bullets) ? briefingJson.bullets.slice(0, 3) : [],
      });
    }

    return NextResponse.json(
      {
        error_code: 'AI_PROVIDER_ERROR',
        message: 'Invalid AI mode specified.',
      },
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    const rawMsg = String(err?.message || 'Unexpected AI server error');
    console.warn('AI Copilot API error:', rawMsg);

    if (isRealRateLimitError(err)) {
      return NextResponse.json(
        {
          error_code: 'TOKEN_LIMIT_EXCEEDED',
          message: TOKEN_LIMIT_MESSAGE,
          retryAfterSeconds: 45,
        },
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return NextResponse.json(
      {
        error_code: 'AI_PROVIDER_ERROR',
        message: rawMsg,
      },
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
