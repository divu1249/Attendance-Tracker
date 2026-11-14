import React from 'react';
import type { Metadata } from 'next';
import { createClient } from '@supabase/supabase-js';
import { ArrowLeft, BookOpen, Sparkles, LockOpen } from 'lucide-react';
import CopyTranscriptButton from '@/components/CopyTranscriptButton';

export const dynamic = 'force-dynamic';

interface SharedStudyRow {
  share_code: string;
  subject: string | null;
  topic: string | null;
  transcript_md: string;
  created_at: string;
}

function getServerSupabaseClient() {
  const rawUrl =
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://mcqffjdncqhahzoowgrk.supabase.co';
  const match = rawUrl.match(/^https?:\/\/supabase\.com\/([a-z0-9-]+)\/?$/i);
  const supabaseUrl = match ? `https://${match[1]}.supabase.co` : rawUrl;
  const key =
    (process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.SUPABASE_SERVICE_ROLE_KEY !== 'placeholder-service-role-key'
      ? process.env.SUPABASE_SERVICE_ROLE_KEY
      : process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) ||
    'sb_publishable_5_EkoaVXUp3s_X6I6BDmwA_8ZyRi3G3';

  return createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function fetchSharedSession(code: string): Promise<SharedStudyRow | null> {
  const cleanCode = decodeURIComponent(String(code || '')).trim();
  if (!cleanCode) return null;

  try {
    const sb = getServerSupabaseClient();
    const { data, error } = await sb
      .from('shared_study_sessions')
      .select('share_code, subject, topic, transcript_md, created_at')
      .eq('share_code', cleanCode)
      .maybeSingle();

    if (error || !data) return null;
    return data as SharedStudyRow;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: { code: string };
}): Promise<Metadata> {
  const session = await fetchSharedSession(params.code);
  if (!session) {
    return {
      title: 'Study Session Not Found | ShouldISkip',
      description: 'This shared study session link could not be found.',
    };
  }
  const sub = session.subject || 'Academic Study';
  const top = session.topic || 'Study Transcript';
  return {
    title: `${top} (${sub}) — ShouldISkip Study Transcript`,
    description: `Universal AI-readable study session transcript for ${sub}: ${top}.`,
  };
}

function renderSemanticTranscriptBlocks(markdown: string) {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let keyCounter = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (/^---+$/.test(trimmed)) {
      blocks.push(<hr key={`hr-${keyCounter++}`} className="my-6 border-zinc-200 dark:border-zinc-800" />);
      i += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const lang = trimmed.slice(3).trim();
      const codeLines: string[] = [];
      i += 1;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      i += 1;
      blocks.push(
        <pre
          key={`pre-${keyCounter++}`}
          className="my-4 p-4 rounded-2xl bg-zinc-950 text-zinc-100 text-xs sm:text-sm font-mono overflow-x-auto border border-zinc-800"
        >
          {lang && (
            <div className="text-[10px] uppercase tracking-wider text-zinc-400 mb-2 font-sans font-bold">
              {lang}
            </div>
          )}
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    if (trimmed.startsWith('# ')) {
      blocks.push(
        <h1
          key={`h1-${keyCounter++}`}
          className="text-xl sm:text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50 mt-2 mb-3"
        >
          {trimmed.slice(2).trim()}
        </h1>
      );
      i += 1;
      continue;
    }

    if (trimmed.startsWith('## ')) {
      const headingText = trimmed.slice(3).trim();
      const isPrompt = headingText.toLowerCase().startsWith('user prompt');
      const isAnswer = headingText.toLowerCase().startsWith('co-pilot answer');
      blocks.push(
        <h2
          key={`h2-${keyCounter++}`}
          className={`text-base sm:text-lg font-bold tracking-tight mt-6 mb-2.5 ${
            isPrompt
              ? 'text-blue-600 dark:text-blue-400'
              : isAnswer
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-zinc-900 dark:text-zinc-100'
          }`}
        >
          {headingText}
        </h2>
      );
      i += 1;
      continue;
    }

    if (trimmed.startsWith('### ')) {
      blocks.push(
        <h3
          key={`h3-${keyCounter++}`}
          className="text-sm sm:text-base font-bold text-zinc-800 dark:text-zinc-200 mt-4 mb-2"
        >
          {trimmed.slice(4).trim()}
        </h3>
      );
      i += 1;
      continue;
    }

    if (trimmed.startsWith('>')) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('>')) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push(
        <blockquote
          key={`bq-${keyCounter++}`}
          className="my-4 p-4 rounded-2xl bg-blue-500/10 border-l-4 border-blue-500 text-xs sm:text-sm text-zinc-700 dark:text-zinc-200 leading-relaxed"
        >
          {quoteLines.join(' ')}
        </blockquote>
      );
      continue;
    }

    if (/^[-*•]\s+/.test(trimmed)) {
      const listItems: string[] = [];
      while (i < lines.length && /^[-*•]\s+/.test(lines[i].trim())) {
        listItems.push(lines[i].trim().replace(/^[-*•]\s+/, ''));
        i += 1;
      }
      blocks.push(
        <ul
          key={`ul-${keyCounter++}`}
          className="my-3 pl-5 list-disc space-y-1.5 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed"
        >
          {listItems.map((item, idx) => (
            <li key={idx}>{item}</li>
          ))}
        </ul>
      );
      continue;
    }

    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !lines[i].trim().startsWith('#') &&
      !lines[i].trim().startsWith('>') &&
      !lines[i].trim().startsWith('```') &&
      !/^---+$/.test(lines[i].trim()) &&
      !/^[-*•]\s+/.test(lines[i].trim())
    ) {
      paraLines.push(lines[i]);
      i += 1;
    }

    blocks.push(
      <p
        key={`p-${keyCounter++}`}
        className="my-2.5 text-sm text-zinc-700 dark:text-zinc-300 leading-relaxed whitespace-pre-wrap"
      >
        {paraLines.join('\n')}
      </p>
    );
  }

  return blocks;
}

export default async function SharedStudyTranscriptPage({
  params,
}: {
  params: { code: string };
}) {
  const session = await fetchSharedSession(params.code);

  if (!session) {
    return (
      <main className="min-h-screen bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 flex items-center justify-center p-6">
        <article className="max-w-lg w-full backdrop-blur-xl bg-white/80 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 rounded-[28px] p-8 text-center space-y-4 shadow-sm">
          <div className="w-12 h-12 rounded-2xl bg-blue-500/10 text-blue-500 flex items-center justify-center mx-auto">
            <BookOpen className="w-6 h-6" />
          </div>
          <h1 className="text-lg font-bold tracking-tight">Study Transcript Not Found</h1>
          <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
            This shared study session link could not be found or has not been synced yet.
          </p>
          <div className="pt-2">
            <a
              href="/"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Return to ShouldISkip</span>
            </a>
          </div>
        </article>
      </main>
    );
  }

  const formattedDate = new Date(session.created_at).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 py-8 px-4 sm:px-6">
      <div className="max-w-4xl mx-auto space-y-5">
        <header className="backdrop-blur-xl bg-white/80 dark:bg-zinc-900/75 border border-zinc-200 dark:border-zinc-800 rounded-[24px] p-4 sm:p-5 flex items-center justify-between gap-3 flex-wrap shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 text-white flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold tracking-tight">
                  ShouldISkip Universal Study Transcript
                </span>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 inline-flex items-center gap-1">
                  <LockOpen className="w-2.5 h-2.5" />
                  Unlisted AI-Readable Link
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                {session.subject || 'General'} · {session.topic || 'Study Session'} · Shared {formattedDate}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <CopyTranscriptButton transcriptMd={session.transcript_md} />
            <a
              href="/"
              className="px-3 py-2 rounded-xl bg-zinc-200/70 dark:bg-zinc-800 hover:opacity-80 text-xs font-semibold inline-flex items-center gap-1 transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>App</span>
            </a>
          </div>
        </header>

        <article className="backdrop-blur-xl bg-white/90 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 rounded-[28px] p-6 sm:p-8 shadow-sm">
          {renderSemanticTranscriptBlocks(session.transcript_md)}

          <details className="mt-8 pt-5 border-t border-zinc-200 dark:border-zinc-800">
            <summary className="cursor-pointer text-xs font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 transition">
              View Raw AI-Readable Markdown Transcript
            </summary>
            <pre className="mt-3 p-4 rounded-2xl bg-zinc-100 dark:bg-zinc-950 text-xs font-mono text-zinc-800 dark:text-zinc-200 overflow-x-auto whitespace-pre-wrap border border-zinc-200 dark:border-zinc-800">
              {session.transcript_md}
            </pre>
          </details>
        </article>
      </div>
    </main>
  );
}
