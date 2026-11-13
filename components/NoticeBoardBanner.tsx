'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Megaphone, ChevronDown, ChevronUp, Pin, Sparkles, X, History } from 'lucide-react';

export const APP_RELEASE = {
  version: 'v2.5.0',
  title: 'Classrooms, Notes Pool, Exams & Assignments OS',
  content:
    'Added shared classrooms, live bunk consensus, subject notes pools, exam datesheets with syllabus checklists, and assignment countdowns.',
};

interface AppUpdate {
  id: string;
  version: string;
  title: string;
  content: string;
  is_pinned: boolean;
  created_at: string;
  updated_at?: string;
}

interface NoticeBoardBannerProps {
  userEmail?: string;
}

export default function NoticeBoardBanner({ userEmail }: NoticeBoardBannerProps) {
  const [updates, setUpdates] = useState<AppUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [showAllModal, setShowAllModal] = useState(false);

  const fetchUpdates = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('app_updates')
        .select('*')
        .order('is_pinned', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('NoticeBoard fetch warning:', error.message);
        setLoading(false);
        return;
      }

      let rows: AppUpdate[] = data || [];

      if (
        userEmail === 'divyanshchauhan356@gmail.com' &&
        !rows.some((u) => u.version === APP_RELEASE.version)
      ) {
        const { error: upsertErr } = await supabase
          .from('app_updates')
          .upsert(
            {
              version: APP_RELEASE.version,
              title: APP_RELEASE.title,
              content: APP_RELEASE.content,
              is_pinned: true,
            },
            { onConflict: 'version' }
          );

        if (upsertErr) {
          await supabase.from('app_updates').insert({
            version: APP_RELEASE.version,
            title: APP_RELEASE.title,
            content: APP_RELEASE.content,
            is_pinned: true,
          });
        }

        const { data: refreshed } = await supabase
          .from('app_updates')
          .select('*')
          .order('is_pinned', { ascending: false })
          .order('created_at', { ascending: false });

        if (refreshed) rows = refreshed;
      }

      setUpdates(rows);
    } catch (err) {
      console.warn('NoticeBoard error:', err);
    } finally {
      setLoading(false);
    }
  }, [userEmail]);

  useEffect(() => {
    fetchUpdates();
  }, [fetchUpdates]);

  if (loading || isDismissed || updates.length === 0) {
    return null;
  }

  const latest = updates[0];

  return (
    <>
      <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-4 md:p-5 rounded-[24px] border border-zinc-200 dark:border-zinc-800 shadow-sm transition-all">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-500 flex items-center justify-center shrink-0 mt-0.5">
              <Megaphone className="w-4 h-4" />
            </div>

            <div className="min-w-0 space-y-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                  {latest.version}
                </span>
                {latest.is_pinned && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1">
                    <Pin className="w-2.5 h-2.5" /> Pinned
                  </span>
                )}
                <h3 className="text-xs md:text-sm font-bold tracking-tight truncate">
                  {latest.title}
                </h3>
              </div>

              {!isCollapsed && (
                <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed">
                  {latest.content}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowAllModal(true)}
              className="px-3 py-1.5 rounded-full bg-zinc-200/70 dark:bg-zinc-800/80 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-xs font-semibold transition flex items-center gap-1.5"
            >
              <History className="w-3.5 h-3.5 text-blue-500" />
              <span className="hidden sm:inline">View All Updates</span>
              <span className="sm:hidden">All ({updates.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setIsCollapsed(!isCollapsed)}
              className="p-1.5 rounded-full bg-zinc-200/60 dark:bg-zinc-800/60 hover:opacity-80 text-zinc-500 transition"
              title={isCollapsed ? 'Expand notice' : 'Collapse notice'}
            >
              {isCollapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={() => setIsDismissed(true)}
              className="p-1.5 rounded-full bg-zinc-200/60 dark:bg-zinc-800/60 hover:text-rose-500 text-zinc-500 transition"
              title="Dismiss notice"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {showAllModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800 rounded-[28px] max-w-xl w-full p-6 space-y-5 shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-bold">Notice Board & Release Changelog</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAllModal(false)}
                className="w-7 h-7 rounded-full bg-zinc-200/60 dark:bg-zinc-800/60 text-xs flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 overflow-y-auto pr-1">
              {updates.map((upd) => (
                <div
                  key={upd.id}
                  className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 hover:shadow-sm transition space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                        {upd.version}
                      </span>
                      {upd.is_pinned && (
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/20 flex items-center gap-1">
                          <Pin className="w-2.5 h-2.5" /> Pinned
                        </span>
                      )}
                      <h4 className="text-xs font-bold">{upd.title}</h4>
                    </div>
                    <span className="text-[10px] text-zinc-400 font-mono">
                      {new Date(upd.created_at).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric',
                      })}
                    </span>
                  </div>
                  <p className="text-xs text-zinc-600 dark:text-zinc-400 leading-relaxed whitespace-pre-wrap">
                    {upd.content}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
