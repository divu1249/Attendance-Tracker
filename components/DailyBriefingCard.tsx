'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Sparkles, RefreshCw, ChevronDown, ChevronUp, Wand2 } from 'lucide-react';

interface BriefingBullet {
  tag: string;
  title: string;
  detail: string;
  tone: 'emerald' | 'amber' | 'rose' | 'blue';
}

interface DailyBriefingData {
  headline: string;
  bullets: BriefingBullet[];
}

interface DailyBriefingCardProps {
  user: any;
  profile: any;
  todayDate: string;
  daySlots: Array<{
    id: string;
    subject: string;
    start_time: string;
    end_time: string;
    course_type: 'theory' | 'lab';
  }>;
  stats: {
    totalHeld: number;
    totalAttended: number;
    percentage: number;
    target: number;
    theoryHeld: number;
    theoryPct: number;
    labHeld: number;
    labTarget: number;
    labPct: number;
    safeBunks: number;
    recoveryClasses: number;
  };
  onOpenCopilot: (tab?: 'snap' | 'notes' | 'tutor') => void;
}

const TONE_STYLES: Record<string, string> = {
  emerald: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-600 dark:text-emerald-400',
  amber: 'bg-amber-500/10 border-amber-500/25 text-amber-600 dark:text-amber-400',
  rose: 'bg-rose-500/10 border-rose-500/25 text-rose-600 dark:text-rose-400',
  blue: 'bg-blue-500/10 border-blue-500/25 text-blue-600 dark:text-blue-400',
};

export default function DailyBriefingCard({
  user,
  profile,
  todayDate,
  daySlots,
  stats,
  onOpenCopilot,
}: DailyBriefingCardProps) {
  const [briefing, setBriefing] = useState<DailyBriefingData | null>(null);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const fetchedKeyRef = useRef<string | null>(null);
  const latestPropsRef = useRef({
    profile,
    daySlots,
    stats,
  });

  latestPropsRef.current = {
    profile,
    daySlots,
    stats,
  };

  const buildDeterministicFallback = useCallback((): DailyBriefingData => {
    const s = latestPropsRef.current.stats;
    const slots = latestPropsRef.current.daySlots;

    const marginText =
      s.totalHeld === 0
        ? 'Fresh ledger — record today’s classes to unlock bunk projections.'
        : s.safeBunks > 0
        ? `You hold ${s.safeBunks} safe bunk${s.safeBunks === 1 ? '' : 's'} above ${s.target}%.`
        : `Attend the next ${s.recoveryClasses} class${s.recoveryClasses === 1 ? '' : 'es'} consecutively to recover ${s.target}%.`;

    const labRisk =
      s.labHeld > 0 && s.labPct < s.labTarget
        ? `Lab attendance (${s.labPct.toFixed(1)}%) is below your ${s.labTarget}% lab bar.`
        : `Theory (${s.theoryHeld > 0 ? `${s.theoryPct.toFixed(1)}%` : '—'}) & Labs (${s.labHeld > 0 ? `${s.labPct.toFixed(1)}%` : '—'}) tracked separately.`;

    const classSummary =
      slots.length > 0
        ? `${slots.length} class${slots.length === 1 ? '' : 'es'} scheduled for ${todayDate}.`
        : `No regular lectures scheduled on ${todayDate}.`;

    return {
      headline: 'Today’s Morning Game Plan',
      bullets: [
        {
          tag: 'Margin',
          title: s.totalHeld > 0 ? `${s.percentage.toFixed(1)}% Standing` : 'Fresh Start',
          detail: marginText,
          tone: s.safeBunks > 0 ? 'emerald' : s.totalHeld === 0 ? 'blue' : 'rose',
        },
        {
          tag: 'Theory & Lab',
          title: 'Dual-Rule Check',
          detail: labRisk,
          tone: s.labHeld > 0 && s.labPct < s.labTarget ? 'amber' : 'blue',
        },
        {
          tag: 'Schedule',
          title: 'Today’s Sessions',
          detail: classSummary,
          tone: 'blue',
        },
      ],
    };
  }, [todayDate]);

  const generateAndCacheBriefing = useCallback(
    async (forceRefresh = false) => {
      if (!user?.id) return;
      const runKey = `${user.id}:${todayDate}`;
      if (!forceRefresh && fetchedKeyRef.current === runKey) {
        return;
      }
      fetchedKeyRef.current = runKey;

      const localKey = `sis_daily_briefing_${user.id}_${todayDate}`;

      if (!forceRefresh) {
        // 1. Check strictly private public.ai_daily_briefings cache first
        try {
          const { data: dbRow } = await supabase
            .from('ai_daily_briefings')
            .select('*')
            .eq('user_id', user.id)
            .eq('briefing_date', todayDate)
            .maybeSingle();

          const rawBriefing = dbRow?.briefing_data || dbRow?.content;
          if (rawBriefing) {
            const parsed =
              typeof rawBriefing === 'string' ? JSON.parse(rawBriefing) : rawBriefing;
            if (Array.isArray(parsed?.bullets) && parsed.bullets.length > 0) {
              setBriefing(parsed);
              return;
            }
          }
        } catch {
          // Table may not exist yet; check localStorage fallback
        }

        if (typeof window !== 'undefined') {
          try {
            const cachedLocal = localStorage.getItem(localKey);
            if (cachedLocal) {
              const parsed = JSON.parse(cachedLocal);
              if (Array.isArray(parsed?.bullets) && parsed.bullets.length > 0) {
                setBriefing(parsed);
                return;
              }
            }
          } catch {
            // Ignore
          }
        }
      }

      setLoading(true);
      try {
        const {
          profile: curProfile,
          daySlots: curSlots,
          stats: curStats,
        } = latestPropsRef.current;

        // Gather strictly personal 48h-7d upcoming exams and assignments
        const upcomingDeadlines: Array<{
          type: 'exam' | 'assignment';
          subject: string;
          title: string;
          date: string;
        }> = [];

        try {
          const exQuery = supabase
            .from('exam_datesheet')
            .select('subject, exam_date, room_no')
            .eq('user_id', user.id)
            .gte('exam_date', todayDate)
            .order('exam_date', { ascending: true })
            .limit(4);

          const asQuery = supabase
            .from('assignments')
            .select('subject, title, due_date')
            .eq('creator_id', user.id)
            .gte('due_date', new Date().toISOString())
            .order('due_date', { ascending: true })
            .limit(4);

          const [{ data: exRows }, { data: asRows }] = await Promise.all([exQuery, asQuery]);

          (exRows || []).forEach((ex: any) => {
            upcomingDeadlines.push({
              type: 'exam',
              subject: ex.subject,
              title: `Exam${ex.room_no ? ` (Room ${ex.room_no})` : ''}`,
              date: ex.exam_date,
            });
          });

          (asRows || []).forEach((a: any) => {
            upcomingDeadlines.push({
              type: 'assignment',
              subject: a.subject,
              title: a.title,
              date: a.due_date,
            });
          });
        } catch {
          // Non-fatal
        }

        const todayClassesPayload = curSlots.map((slot) => ({
          subject: slot.subject,
          start_time: slot.start_time,
          end_time: slot.end_time,
          course_type: slot.course_type,
        }));

        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        try {
          const { data: sessionRes } = await supabase.auth.getSession();
          if (sessionRes?.session?.access_token) {
            headers.Authorization = `Bearer ${sessionRes.session.access_token}`;
          }
        } catch {
          // Ignore
        }

        const res = await fetch('/api/ai', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            mode: 'daily_briefing',
            userId: user.id,
            date: todayDate,
            studentName: curProfile?.full_name || curProfile?.username || 'Student',
            attendance: {
              totalHeld: curStats.totalHeld,
              totalAttended: curStats.totalAttended,
              percentage: curStats.percentage,
              target: curStats.target,
              theoryHeld: curStats.theoryHeld,
              theoryPct: curStats.theoryPct,
              theoryTarget: curStats.target,
              labHeld: curStats.labHeld,
              labPct: curStats.labPct,
              labTarget: curStats.labTarget,
              safeBunks: curStats.safeBunks,
              recoveryClasses: curStats.recoveryClasses,
            },
            todayClasses: todayClassesPayload,
            upcomingDeadlines,
          }),
        });

        if (!res.ok) {
          setBriefing(buildDeterministicFallback());
          return;
        }

        const data = await res.json();
        const payload: DailyBriefingData = {
          headline: data.headline || 'Today’s Morning Game Plan',
          bullets:
            Array.isArray(data.bullets) && data.bullets.length > 0
              ? data.bullets.slice(0, 3)
              : buildDeterministicFallback().bullets,
        };

        setBriefing(payload);

        if (typeof window !== 'undefined') {
          localStorage.setItem(localKey, JSON.stringify(payload));
        }

        try {
          await supabase.from('ai_daily_briefings').upsert(
            {
              user_id: user.id,
              briefing_date: todayDate,
              briefing_data: payload,
            },
            { onConflict: 'user_id,briefing_date' }
          );
        } catch {
          // Non-fatal
        }
      } catch {
        setBriefing(buildDeterministicFallback());
      } finally {
        setLoading(false);
      }
    },
    [user?.id, todayDate, buildDeterministicFallback]
  );

  useEffect(() => {
    generateAndCacheBriefing(false);
  }, [generateAndCacheBriefing]);

  if (!user) return null;

  return (
    <div className="backdrop-blur-xl bg-gradient-to-br from-blue-600/10 via-white/75 to-violet-600/10 dark:from-blue-600/10 dark:via-zinc-900/70 dark:to-violet-600/10 p-5 rounded-[24px] border border-blue-500/25 shadow-sm space-y-3.5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 text-white flex items-center justify-center shadow-sm">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-xs md:text-sm font-bold tracking-tight">
              {briefing?.headline || 'AI Morning Game Plan'}
            </h3>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Daily synthesis for {todayDate}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onOpenCopilot('snap')}
            className="px-3 py-1.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold flex items-center gap-1 shadow-sm transition"
          >
            <Wand2 className="w-3 h-3" />
            <span>Open AI Copilot</span>
          </button>

          <button
            type="button"
            onClick={() => generateAndCacheBriefing(true)}
            disabled={loading}
            className="p-1.5 rounded-full bg-white/70 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700 hover:opacity-80 text-zinc-500 transition"
            title="Refresh daily briefing"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-blue-500' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-full bg-white/70 dark:bg-zinc-800/70 border border-zinc-200 dark:border-zinc-700 hover:opacity-80 text-zinc-500 transition"
            title={collapsed ? 'Expand briefing' : 'Collapse briefing'}
          >
            {collapsed ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronUp className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          {loading && !briefing ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 animate-pulse">
              <div className="h-20 rounded-2xl bg-white/60 dark:bg-zinc-900/60" />
              <div className="h-20 rounded-2xl bg-white/60 dark:bg-zinc-900/60" />
              <div className="h-20 rounded-2xl bg-white/60 dark:bg-zinc-900/60" />
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {(briefing?.bullets || []).map((b, idx) => {
                const badgeTone = TONE_STYLES[b.tone] || TONE_STYLES.blue;
                return (
                  <div
                    key={idx}
                    className="bg-white/80 dark:bg-zinc-900/80 p-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${badgeTone}`}
                      >
                        {b.tag}
                      </span>
                    </div>
                    <h4 className="text-xs font-bold tracking-tight">{b.title}</h4>
                    <p className="text-[11px] text-zinc-600 dark:text-zinc-400 leading-relaxed">
                      {b.detail}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
