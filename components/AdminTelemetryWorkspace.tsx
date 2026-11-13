'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import {
  ShieldAlert,
  Users,
  Activity,
  Clock,
  CalendarDays,
  Search,
  Megaphone,
  Pin,
  PinOff,
  Trash2,
  Edit3,
  Plus,
  Check,
  X,
} from 'lucide-react';

interface AdminProfile {
  id: string;
  username: string;
  full_name?: string | null;
  college_name?: string | null;
  stream?: string | null;
  semester?: number | null;
  last_seen_at?: string | null;
  total_time_seconds?: number | null;
}

interface ActivityLog {
  id: string;
  user_id: string;
  email?: string | null;
  display_name?: string | null;
  activity_date: string;
  seconds_spent: number;
  sessions_count: number;
  last_active_at: string;
}

interface AppUpdate {
  id: string;
  version: string;
  title: string;
  content: string;
  is_pinned: boolean;
  created_at: string;
  updated_at?: string;
}

interface AdminTelemetryWorkspaceProps {
  user: any;
}

function getLocalTodayStr(): string {
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60000;
  return new Date(today.getTime() - offset).toISOString().split('T')[0];
}

function formatDuration(seconds: number): string {
  const mins = Math.round((seconds || 0) / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return `${hrs}h ${rem}m`;
}

export default function AdminTelemetryWorkspace({ user }: AdminTelemetryWorkspaceProps) {
  const isAdmin = user?.email === 'divyanshchauhan356@gmail.com';

  const [profiles, setProfiles] = useState<AdminProfile[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [updates, setUpdates] = useState<AppUpdate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  // Notice Board Manager State
  const [newVersion, setNewVersion] = useState('');
  const [newTitle, setNewTitle] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newPinned, setNewPinned] = useState(true);
  const [savingNotice, setSavingNotice] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editVersion, setEditVersion] = useState('');
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');

  const fetchTelemetry = useCallback(async () => {
    if (!isAdmin) return;
    setLoading(true);
    try {
      const [{ data: profData }, { data: logData }, { data: updData }] = await Promise.all([
        supabase
          .from('profiles')
          .select('id, username, full_name, college_name, stream, semester, last_seen_at, total_time_seconds'),
        supabase
          .from('user_activity_logs')
          .select('*')
          .order('activity_date', { ascending: false }),
        supabase
          .from('app_updates')
          .select('*')
          .order('is_pinned', { ascending: false })
          .order('created_at', { ascending: false }),
      ]);

      setProfiles(profData || []);
      setLogs(logData || []);
      setUpdates(updData || []);
    } catch (err: any) {
      toast.error('Telemetry fetch failed: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchTelemetry();
  }, [fetchTelemetry]);

  const todayStr = useMemo(() => getLocalTodayStr(), []);

  const sevenDaysAgoStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 6);
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().split('T')[0];
  }, []);

  const kpis = useMemo(() => {
    const totalUsers = profiles.length;
    const todayActiveUsers = new Set(
      logs.filter((l) => l.activity_date === todayStr).map((l) => l.user_id)
    );
    const sevenDayActiveUsers = new Set(
      logs.filter((l) => l.activity_date >= sevenDaysAgoStr).map((l) => l.user_id)
    );

    const totalSecondsAllLogs = logs.reduce((acc, l) => acc + (l.seconds_spent || 0), 0);
    const avgDailyMinutes =
      logs.length > 0 ? Math.round(totalSecondsAllLogs / 60 / logs.length) : 0;

    return {
      totalUsers,
      dau: todayActiveUsers.size,
      wau: sevenDayActiveUsers.size,
      avgDailyMinutes,
      todayActiveUsers,
    };
  }, [profiles, logs, todayStr, sevenDaysAgoStr]);

  const last14DaysChart = useMemo(() => {
    const days: { date: string; label: string; users: number; minutes: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const offset = d.getTimezoneOffset() * 60000;
      const dateStr = new Date(d.getTime() - offset).toISOString().split('T')[0];
      const dayLogs = logs.filter((l) => l.activity_date === dateStr);
      const distinctUsers = new Set(dayLogs.map((l) => l.user_id)).size;
      const totalMins = Math.round(
        dayLogs.reduce((acc, l) => acc + (l.seconds_spent || 0), 0) / 60
      );
      days.push({
        date: dateStr,
        label: dateStr.slice(5),
        users: distinctUsers,
        minutes: totalMins,
      });
    }
    return days;
  }, [logs]);

  const maxChartUsers = Math.max(1, ...last14DaysChart.map((d) => d.users));
  const maxChartMinutes = Math.max(1, ...last14DaysChart.map((d) => d.minutes));

  const userRows = useMemo(() => {
    const logsByUser = new Map<string, ActivityLog[]>();
    logs.forEach((l) => {
      const arr = logsByUser.get(l.user_id) || [];
      arr.push(l);
      logsByUser.set(l.user_id, arr);
    });

    const merged = profiles.map((p) => {
      const uLogs = logsByUser.get(p.id) || [];
      const latestLog = uLogs[0];
      const totalLogSeconds = uLogs.reduce((acc, l) => acc + (l.seconds_spent || 0), 0);
      const totalSeconds = Math.max(p.total_time_seconds || 0, totalLogSeconds);
      const activeToday = uLogs.some((l) => l.activity_date === todayStr);
      const displayName = p.full_name?.trim() || p.username || latestLog?.display_name || 'Student';
      const email = latestLog?.email || '—';
      const lastSeen = p.last_seen_at || latestLog?.last_active_at || null;

      return {
        id: p.id,
        displayName,
        email,
        college: p.college_name || '—',
        stream: p.stream || '',
        semester: p.semester || 1,
        activeToday,
        totalSeconds,
        lastSeen,
      };
    });

    if (!searchQuery.trim()) return merged;
    const q = searchQuery.toLowerCase();
    return merged.filter(
      (r) =>
        r.displayName.toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.college.toLowerCase().includes(q)
    );
  }, [profiles, logs, todayStr, searchQuery]);

  const handleCreateUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVersion.trim() || !newTitle.trim() || !newContent.trim()) return;
    setSavingNotice(true);

    try {
      const { error } = await supabase.from('app_updates').insert({
        version: newVersion.trim(),
        title: newTitle.trim(),
        content: newContent.trim(),
        is_pinned: newPinned,
      });
      if (error) throw error;
      toast.success('Notice published!');
      setNewVersion('');
      setNewTitle('');
      setNewContent('');
      await fetchTelemetry();
    } catch (err: any) {
      toast.error('Failed to publish notice: ' + err.message);
    } finally {
      setSavingNotice(false);
    }
  };

  const handleTogglePin = async (upd: AppUpdate) => {
    const { error } = await supabase
      .from('app_updates')
      .update({ is_pinned: !upd.is_pinned, updated_at: new Date().toISOString() })
      .eq('id', upd.id);
    if (error) {
      toast.error('Pin update failed: ' + error.message);
    } else {
      setUpdates((prev) =>
        prev.map((u) => (u.id === upd.id ? { ...u, is_pinned: !upd.is_pinned } : u))
      );
    }
  };

  const handleSaveEdit = async (id: string) => {
    const { error } = await supabase
      .from('app_updates')
      .update({
        version: editVersion.trim(),
        title: editTitle.trim(),
        content: editContent.trim(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) {
      toast.error('Update failed: ' + error.message);
    } else {
      toast.success('Notice updated.');
      setEditingId(null);
      await fetchTelemetry();
    }
  };

  const handleDeleteUpdate = async (id: string) => {
    const { error } = await supabase.from('app_updates').delete().eq('id', id);
    if (error) {
      toast.error('Delete failed: ' + error.message);
    } else {
      setUpdates((prev) => prev.filter((u) => u.id !== id));
      toast.success('Notice deleted.');
    }
  };

  if (!isAdmin) return null;

  if (loading) {
    return (
      <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-8 rounded-[28px] border border-zinc-200 dark:border-zinc-800 text-center text-xs text-zinc-400">
        Loading admin telemetry...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Admin Header */}
      <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-6 rounded-[24px] md:rounded-[28px] border border-zinc-200 dark:border-zinc-800 shadow-sm flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center">
            <ShieldAlert className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-bold tracking-tight">Admin Telemetry & Notice Studio</h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              Live user retention, session duration metrics, and global notice board control.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={fetchTelemetry}
          className="px-4 py-1.5 rounded-full bg-zinc-200/70 dark:bg-zinc-800/80 text-xs font-semibold hover:opacity-80 transition"
        >
          Refresh
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-6 rounded-[24px] border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-zinc-400">
            <span>Total Registered</span>
            <Users className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-3xl font-extrabold">{kpis.totalUsers}</div>
          <p className="text-[11px] text-zinc-400">Student profiles</p>
        </div>

        <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-6 rounded-[24px] border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-zinc-400">
            <span>Active Today (DAU)</span>
            <Activity className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-3xl font-extrabold text-emerald-500">{kpis.dau}</div>
          <p className="text-[11px] text-zinc-400">Logged activity on {todayStr}</p>
        </div>

        <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-6 rounded-[24px] border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-zinc-400">
            <span>7-Day Active</span>
            <CalendarDays className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-3xl font-extrabold text-purple-500">{kpis.wau}</div>
          <p className="text-[11px] text-zinc-400">Unique users in last 7 days</p>
        </div>

        <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-6 rounded-[24px] border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-zinc-400">
            <span>Avg Daily Time</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-3xl font-extrabold text-amber-500">{kpis.avgDailyMinutes}m</div>
          <p className="text-[11px] text-zinc-400">Per active user-day</p>
        </div>
      </div>

      {/* Visual Bar Chart: Last 14 Days */}
      <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-6 rounded-[24px] md:rounded-[28px] border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              14-Day Engagement Pulse
            </h3>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Daily Active Users (blue) & Total Minutes Spent (emerald)
            </p>
          </div>
          <div className="flex items-center gap-4 text-[11px] font-semibold">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> DAU
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Minutes
            </span>
          </div>
        </div>

        <div className="grid grid-cols-[repeat(14,minmax(0,1fr))] gap-1.5 items-end h-44 pt-4 border-b border-zinc-200 dark:border-zinc-800 pb-2 overflow-x-auto">
          {last14DaysChart.map((day) => {
            const uPct = Math.round((day.users / maxChartUsers) * 100);
            const mPct = Math.round((day.minutes / maxChartMinutes) * 100);
            return (
              <div
                key={day.date}
                className="flex flex-col items-center justify-end h-full gap-1.5 min-w-[26px] group"
                title={`${day.date}: ${day.users} DAU, ${day.minutes} mins`}
              >
                <div className="flex items-end gap-0.5 h-32 w-full justify-center">
                  <div
                    className="w-2.5 rounded-t-md bg-blue-500/80 group-hover:bg-blue-500 transition-all"
                    style={{ height: `${Math.max(4, uPct)}%` }}
                  />
                  <div
                    className="w-2.5 rounded-t-md bg-emerald-500/80 group-hover:bg-emerald-500 transition-all"
                    style={{ height: `${Math.max(4, mPct)}%` }}
                  />
                </div>
                <span className="text-[9px] font-mono text-zinc-400">{day.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Searchable User Activity Table */}
      <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-6 rounded-[24px] md:rounded-[28px] border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            User Activity Directory ({userRows.length})
          </h3>
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search name, email, or college..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-full pl-8 pr-4 py-1.5 text-xs focus:outline-none w-full sm:w-64"
            />
          </div>
        </div>

        <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-2xl">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-zinc-100/80 dark:bg-zinc-900/80 border-b border-zinc-200 dark:border-zinc-800 text-[11px] uppercase tracking-wider text-zinc-400">
                <th className="p-3 font-semibold">User</th>
                <th className="p-3 font-semibold">Email</th>
                <th className="p-3 font-semibold">College</th>
                <th className="p-3 font-semibold">Daily Status</th>
                <th className="p-3 font-semibold">Total Time</th>
                <th className="p-3 font-semibold">Last Seen</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 bg-white dark:bg-zinc-900">
              {userRows.map((u) => (
                <tr key={u.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40 transition">
                  <td className="p-3 font-semibold">{u.displayName}</td>
                  <td className="p-3 text-zinc-500 font-mono text-[11px]">{u.email}</td>
                  <td className="p-3 text-zinc-500">{u.college}</td>
                  <td className="p-3">
                    {u.activeToday ? (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                        Active Today
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-zinc-200/70 dark:bg-zinc-800 text-zinc-500">
                        Inactive
                      </span>
                    )}
                  </td>
                  <td className="p-3 font-mono font-semibold">{formatDuration(u.totalSeconds)}</td>
                  <td className="p-3 text-zinc-400 font-mono text-[11px]">
                    {u.lastSeen ? new Date(u.lastSeen).toLocaleString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Notice Board Manager */}
      <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-6 rounded-[24px] md:rounded-[28px] border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-5">
        <div className="flex items-center gap-2">
          <Megaphone className="w-4 h-4 text-blue-500" />
          <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Notice Board Manager (app_updates)
          </h3>
        </div>

        <form
          onSubmit={handleCreateUpdate}
          className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-3"
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input
              type="text"
              required
              placeholder="Version (e.g. v2.5.1)"
              value={newVersion}
              onChange={(e) => setNewVersion(e.target.value)}
              className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs focus:outline-none"
            />
            <input
              type="text"
              required
              placeholder="Notice Title"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="sm:col-span-2 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs focus:outline-none"
            />
          </div>

          <textarea
            required
            rows={2}
            placeholder="Release notes or announcement content..."
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs focus:outline-none"
          />

          <div className="flex items-center justify-between flex-wrap gap-2">
            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={newPinned}
                onChange={(e) => setNewPinned(e.target.checked)}
                className="accent-blue-600"
              />
              <span>Pin notice to top</span>
            </label>

            <button
              type="submit"
              disabled={savingNotice}
              className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{savingNotice ? 'Publishing...' : 'Publish Notice'}</span>
            </button>
          </div>
        </form>

        <div className="space-y-3">
          {updates.map((upd) => {
            const isEditing = editingId === upd.id;
            return (
              <div
                key={upd.id}
                className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-2"
              >
                {isEditing ? (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <input
                        type="text"
                        value={editVersion}
                        onChange={(e) => setEditVersion(e.target.value)}
                        className="bg-zinc-100 dark:bg-zinc-800 rounded-xl px-3 py-1.5 text-xs"
                      />
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        className="sm:col-span-2 bg-zinc-100 dark:bg-zinc-800 rounded-xl px-3 py-1.5 text-xs"
                      />
                    </div>
                    <textarea
                      rows={2}
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-xl px-3 py-1.5 text-xs"
                    />
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-xs font-semibold flex items-center gap-1"
                      >
                        <X className="w-3 h-3" /> Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(upd.id)}
                        className="px-3 py-1 rounded-xl bg-blue-600 text-white text-xs font-semibold flex items-center gap-1"
                      >
                        <Check className="w-3 h-3" /> Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-500">
                          {upd.version}
                        </span>
                        {upd.is_pinned && (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500">
                            Pinned
                          </span>
                        )}
                        <h4 className="text-xs font-bold">{upd.title}</h4>
                      </div>
                      <p className="text-xs text-zinc-500 dark:text-zinc-400">{upd.content}</p>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleTogglePin(upd)}
                        className="p-1.5 rounded-full text-zinc-400 hover:text-amber-500 transition"
                        title={upd.is_pinned ? 'Unpin' : 'Pin'}
                      >
                        {upd.is_pinned ? <PinOff className="w-3.5 h-3.5" /> : <Pin className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingId(upd.id);
                          setEditVersion(upd.version);
                          setEditTitle(upd.title);
                          setEditContent(upd.content);
                        }}
                        className="p-1.5 rounded-full text-zinc-400 hover:text-blue-500 transition"
                        title="Edit"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteUpdate(upd.id)}
                        className="p-1.5 rounded-full text-zinc-400 hover:text-rose-500 transition"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
