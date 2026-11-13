'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import {
  ClipboardList,
  Plus,
  Clock,
  AlertTriangle,
  ExternalLink,
  MessageSquare,
  Send,
  Trash2,
  CheckCircle2,
  Circle,
  Timer,
  Globe,
  Lock,
} from 'lucide-react';

interface Assignment {
  id: string;
  creator_id: string;
  creator_name: string;
  classroom_id: string | null;
  subject: string;
  title: string;
  description: string;
  due_date: string;
  file_url?: string | null;
  is_shared: boolean;
  created_at: string;
}

type ProgressStatus = 'pending' | 'in_progress' | 'completed';

interface ThreadMessage {
  id: string;
  assignment_id: string;
  user_id: string;
  author_name: string;
  message: string;
  file_url?: string | null;
  created_at: string;
}

interface AssignmentsWorkspaceProps {
  user: any;
  profile: any;
  allSlots: any[];
  activeClassroomId: string | null;
}

function formatCountdown(dueDateIso: string, nowMs: number): { text: string; msLeft: number; isOverdue: boolean } {
  const targetMs = new Date(dueDateIso).getTime();
  const diff = targetMs - nowMs;
  if (Number.isNaN(targetMs)) {
    return { text: 'No deadline', msLeft: Infinity, isOverdue: false };
  }
  if (diff <= 0) {
    return { text: 'Past Due', msLeft: diff, isOverdue: true };
  }
  const totalMinutes = Math.floor(diff / 60000);
  const days = Math.floor(totalMinutes / (60 * 24));
  const hours = Math.floor((totalMinutes % (60 * 24)) / 60);
  const mins = totalMinutes % 60;
  return {
    text: `${days}d ${hours}h ${mins}m left`,
    msLeft: diff,
    isOverdue: false,
  };
}

export default function AssignmentsWorkspace({
  user,
  profile,
  allSlots,
  activeClassroomId,
}: AssignmentsWorkspaceProps) {
  const publicName = useMemo(
    () =>
      profile?.full_name?.trim() ||
      profile?.username?.trim() ||
      user?.email?.split('@')[0] ||
      'Student',
    [profile?.full_name, profile?.username, user?.email]
  );

  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, ProgressStatus>>({});
  const [modeFilter, setModeFilter] = useState<'all' | 'solo' | 'classroom'>('all');
  const [loading, setLoading] = useState(true);
  const [nowMs, setNowMs] = useState<number>(() => Date.now());

  // Create Assignment Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [subject, setSubject] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState(() => {
    const d = new Date(Date.now() + 48 * 3600 * 1000);
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().slice(0, 16);
  });
  const [fileUrl, setFileUrl] = useState('');
  const [isShared, setIsShared] = useState(false);
  const [creating, setCreating] = useState(false);

  // Selected Assignment Modal + P2P Thread
  const [activeAssignment, setActiveAssignment] = useState<Assignment | null>(null);
  const [threads, setThreads] = useState<ThreadMessage[]>([]);
  const [loadingThreads, setLoadingThreads] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [replyFileUrl, setReplyFileUrl] = useState('');
  const [postingReply, setPostingReply] = useState(false);

  // Live ticking countdown every 15 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 15000);
    return () => clearInterval(timer);
  }, []);

  const uniqueSubjects = useMemo(() => {
    const set = new Set<string>();
    allSlots.forEach((s) => {
      if (s.subject) set.add(s.subject);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allSlots]);

  const fetchAssignments = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      let query = supabase
        .from('assignments')
        .select('*')
        .order('due_date', { ascending: true });

      if (activeClassroomId) {
        query = query.or(
          `creator_id.eq.${user.id},and(classroom_id.eq.${activeClassroomId},is_shared.eq.true)`
        );
      } else {
        query = query.eq('creator_id', user.id);
      }

      const [{ data: assignRows, error: assignErr }, { data: progRows }] = await Promise.all([
        query,
        supabase
          .from('assignment_progress')
          .select('assignment_id, status')
          .eq('user_id', user.id),
      ]);

      if (assignErr) throw assignErr;

      setAssignments(assignRows || []);
      const pMap: Record<string, ProgressStatus> = {};
      (progRows || []).forEach((p: any) => {
        pMap[p.assignment_id] = p.status as ProgressStatus;
      });
      setProgressMap(pMap);
    } catch (err: any) {
      toast.error('Failed to load assignments: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [user, activeClassroomId]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  const urgentAssignments = useMemo(() => {
    const fortyEightHoursMs = 48 * 60 * 60 * 1000;
    return assignments.filter((a) => {
      const status = progressMap[a.id] || 'pending';
      if (status === 'completed') return false;
      const { msLeft, isOverdue } = formatCountdown(a.due_date, nowMs);
      return !isOverdue && msLeft <= fortyEightHoursMs;
    });
  }, [assignments, progressMap, nowMs]);

  const filteredAssignments = useMemo(() => {
    return assignments.filter((a) => {
      if (modeFilter === 'solo') return !a.is_shared;
      if (modeFilter === 'classroom') return a.is_shared;
      return true;
    });
  }, [assignments, modeFilter]);

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !subject.trim() || !title.trim() || !dueDate) return;
    setCreating(true);

    try {
      const shareToClass = isShared && !!activeClassroomId;
      const dueIso = new Date(dueDate).toISOString();

      const { error } = await supabase.from('assignments').insert({
        creator_id: user.id,
        creator_name: publicName,
        classroom_id: shareToClass ? activeClassroomId : null,
        subject: subject.trim(),
        title: title.trim(),
        description: description.trim(),
        due_date: dueIso,
        file_url: fileUrl.trim() || null,
        is_shared: shareToClass,
      });

      if (error) throw error;

      toast.success('Assignment created!');
      setTitle('');
      setDescription('');
      setFileUrl('');
      setShowCreateModal(false);
      await fetchAssignments();
    } catch (err: any) {
      toast.error('Failed to create assignment: ' + err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleUpdateProgress = async (assignmentId: string, status: ProgressStatus) => {
    if (!user) return;
    setProgressMap((prev) => ({ ...prev, [assignmentId]: status }));

    const { error } = await supabase.from('assignment_progress').upsert(
      {
        assignment_id: assignmentId,
        user_id: user.id,
        status,
      },
      { onConflict: 'assignment_id,user_id' }
    );

    if (error) {
      toast.error('Failed to update status: ' + error.message);
    } else {
      toast.success(`Marked as ${status.replace('_', ' ')}`);
    }
  };

  const handleDeleteAssignment = async (id: string) => {
    try {
      const { error } = await supabase.from('assignments').delete().eq('id', id);
      if (error) throw error;
      setAssignments((prev) => prev.filter((a) => a.id !== id));
      if (activeAssignment?.id === id) setActiveAssignment(null);
      toast.success('Assignment deleted.');
    } catch (err: any) {
      toast.error('Delete failed: ' + err.message);
    }
  };

  const openAssignmentModal = async (assignment: Assignment) => {
    setActiveAssignment(assignment);
    setLoadingThreads(true);
    try {
      const { data, error } = await supabase
        .from('assignment_threads')
        .select('*')
        .eq('assignment_id', assignment.id)
        .order('created_at', { ascending: true });

      if (error) throw error;
      setThreads(data || []);
    } catch (err: any) {
      toast.error('Failed to load help thread: ' + err.message);
    } finally {
      setLoadingThreads(false);
    }
  };

  const handlePostThreadReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !activeAssignment || !replyText.trim()) return;
    setPostingReply(true);

    try {
      const { data, error } = await supabase
        .from('assignment_threads')
        .insert({
          assignment_id: activeAssignment.id,
          user_id: user.id,
          author_name: publicName,
          message: replyText.trim(),
          file_url: replyFileUrl.trim() || null,
        })
        .select()
        .single();

      if (error) throw error;

      setThreads((prev) => [...prev, data]);
      setReplyText('');
      setReplyFileUrl('');
    } catch (err: any) {
      toast.error('Failed to post reply: ' + err.message);
    } finally {
      setPostingReply(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Active Assignment Alert Banner (Due within 48h) */}
      {urgentAssignments.length > 0 && (
        <div className="backdrop-blur-xl bg-amber-500/10 border border-amber-500/30 p-4 md:p-5 rounded-[24px] shadow-sm space-y-2.5">
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <h3 className="text-xs font-bold uppercase tracking-wider">
              Urgent Deadlines — Due Within 48 Hours ({urgentAssignments.length})
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {urgentAssignments.map((a) => {
              const cd = formatCountdown(a.due_date, nowMs);
              return (
                <button
                  key={a.id}
                  type="button"
                  onClick={() => openAssignmentModal(a)}
                  className="text-left bg-white/80 dark:bg-zinc-900/80 p-3 rounded-2xl border border-amber-500/20 hover:border-amber-500/50 transition flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400 block">
                      {a.subject}
                    </span>
                    <span className="text-xs font-bold truncate block">{a.title}</span>
                  </div>
                  <span className="text-[11px] font-mono font-bold text-rose-500 bg-rose-500/10 px-2.5 py-1 rounded-full shrink-0">
                    {cd.text}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Header & Mode Switcher */}
      <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-6 rounded-[24px] md:rounded-[28px] border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-blue-500" />
            <h2 className="text-base font-bold tracking-tight">Assignments & P2P Help</h2>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Track solo homework or classroom submissions with live countdowns and classmate help threads.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <div className="inline-flex p-1 rounded-full bg-zinc-200/60 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700">
            {(['all', 'solo', 'classroom'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModeFilter(m)}
                className={`px-3 py-1 rounded-full text-[11px] font-semibold capitalize transition ${
                  modeFilter === m
                    ? 'bg-white dark:bg-zinc-900 text-zinc-900 dark:text-white shadow-sm'
                    : 'text-zinc-500 dark:text-zinc-400'
                }`}
              >
                {m === 'all' ? 'All' : m === 'solo' ? 'Solo Mode' : 'Classroom Mode'}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => {
              setSubject(uniqueSubjects[0] || '');
              setIsShared(modeFilter === 'classroom' && !!activeClassroomId);
              setShowCreateModal(true);
            }}
            className="px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Assignment</span>
          </button>
        </div>
      </div>

      {/* Assignments Grid */}
      {loading ? (
        <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-8 rounded-[28px] border border-zinc-200 dark:border-zinc-800 text-center text-xs text-zinc-400">
          Loading assignments...
        </div>
      ) : filteredAssignments.length === 0 ? (
        <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-12 rounded-[28px] border border-zinc-200 dark:border-zinc-800 text-center space-y-2">
          <ClipboardList className="w-9 h-9 mx-auto text-zinc-400" />
          <h3 className="text-sm font-bold">No Assignments Found</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
            Create a personal homework tracker or share a class assignment with your classroom.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredAssignments.map((a) => {
            const status = progressMap[a.id] || 'pending';
            const cd = formatCountdown(a.due_date, nowMs);

            return (
              <div
                key={a.id}
                onClick={() => openAssignmentModal(a)}
                className="bg-white dark:bg-zinc-900 p-5 rounded-2xl border border-zinc-200 dark:border-zinc-800 hover:shadow-sm hover:border-blue-500/40 transition cursor-pointer flex flex-col justify-between gap-4"
              >
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                        {a.subject}
                      </span>
                      <span
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border flex items-center gap-1 ${
                          a.is_shared
                            ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                            : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
                        }`}
                      >
                        {a.is_shared ? <Globe className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
                        {a.is_shared ? 'Classroom' : 'Solo'}
                      </span>
                    </div>

                    <span
                      className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                        status === 'completed'
                          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          : status === 'in_progress'
                          ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                          : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500'
                      }`}
                    >
                      {status.replace('_', ' ')}
                    </span>
                  </div>

                  <h3 className="text-sm font-bold tracking-tight">{a.title}</h3>
                  {a.description && (
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 line-clamp-2">
                      {a.description}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800 text-[11px]">
                  <div className="flex items-center gap-2 text-zinc-400">
                    <span>By {a.creator_name}</span>
                  </div>

                  <div className="flex items-center gap-2">
                    <span
                      className={`font-mono font-bold px-2.5 py-0.5 rounded-full ${
                        status === 'completed'
                          ? 'bg-emerald-500/10 text-emerald-500'
                          : cd.isOverdue
                          ? 'bg-rose-500/15 text-rose-500'
                          : 'bg-blue-500/10 text-blue-500'
                      }`}
                    >
                      {status === 'completed' ? 'Done' : cd.text}
                    </span>
                    <MessageSquare className="w-3.5 h-3.5 text-zinc-400" />
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: CREATE ASSIGNMENT */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800 rounded-[28px] max-w-lg w-full p-6 space-y-5 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-bold">New Assignment</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="w-6 h-6 rounded-full bg-zinc-200/60 dark:bg-zinc-800/60 text-xs flex items-center justify-center text-zinc-500"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateAssignment} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-400">Subject</label>
                  <input
                    type="text"
                    required
                    list="assign-subjects-list"
                    placeholder="e.g. DBMS"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none"
                  />
                  <datalist id="assign-subjects-list">
                    {uniqueSubjects.map((sub) => (
                      <option key={sub} value={sub} />
                    ))}
                  </datalist>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-400">Due Date & Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={dueDate}
                    onChange={(e) => setDueDate(e.target.value)}
                    className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-400">Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Lab File Experiment 5 — SQL Joins"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-400">Instructions / Description</label>
                <textarea
                  rows={3}
                  placeholder="Submission guidelines, rubric, or questions..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none resize-y"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-400">Attachment / Doc URL (Optional)</label>
                <input
                  type="url"
                  placeholder="https://drive.google.com/..."
                  value={fileUrl}
                  onChange={(e) => setFileUrl(e.target.value)}
                  className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none"
                />
              </div>

              {activeClassroomId && (
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isShared}
                    onChange={(e) => setIsShared(e.target.checked)}
                    className="accent-blue-600"
                  />
                  <span>Publish to active Classroom (shared with classmates + P2P help thread)</span>
                </label>
              )}

              <button
                type="submit"
                disabled={creating}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition shadow-sm"
              >
                {creating ? 'Creating...' : 'Create Assignment'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DEDICATED ASSIGNMENT DASHBOARD & P2P THREAD */}
      {activeAssignment && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800 rounded-[28px] max-w-2xl w-full p-6 space-y-5 shadow-2xl my-8 max-h-[90vh] flex flex-col">
            <div className="flex items-start justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3 shrink-0 gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20">
                    {activeAssignment.subject}
                  </span>
                  <span className="text-[11px] text-zinc-400">
                    Posted by {activeAssignment.creator_name}
                  </span>
                </div>
                <h3 className="text-base font-bold mt-1">{activeAssignment.title}</h3>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {activeAssignment.creator_id === user.id && (
                  <button
                    type="button"
                    onClick={() => handleDeleteAssignment(activeAssignment.id)}
                    className="p-1.5 rounded-full text-zinc-400 hover:text-rose-500 transition"
                    title="Delete assignment"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveAssignment(null)}
                  className="w-7 h-7 rounded-full bg-zinc-200/60 dark:bg-zinc-800/60 text-xs flex items-center justify-center text-zinc-500"
                >
                  ✕
                </button>
              </div>
            </div>

            <div className="space-y-5 overflow-y-auto pr-1">
              {/* Deadline & Personal Status Selector */}
              <div className="bg-zinc-50 dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 text-xs font-bold text-rose-500">
                    <Clock className="w-3.5 h-3.5" />
                    <span>{formatCountdown(activeAssignment.due_date, nowMs).text}</span>
                  </div>
                  <p className="text-[11px] text-zinc-400 font-mono">
                    Due: {new Date(activeAssignment.due_date).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {(
                    [
                      { key: 'pending', label: 'Pending', icon: Circle },
                      { key: 'in_progress', label: 'In Progress', icon: Timer },
                      { key: 'completed', label: 'Completed', icon: CheckCircle2 },
                    ] as const
                  ).map(({ key, label, icon: Icon }) => {
                    const active = (progressMap[activeAssignment.id] || 'pending') === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => handleUpdateProgress(activeAssignment.id, key)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center gap-1.5 transition border ${
                          active
                            ? key === 'completed'
                              ? 'bg-emerald-600 text-white border-transparent'
                              : key === 'in_progress'
                              ? 'bg-amber-500 text-white border-transparent'
                              : 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 border-transparent'
                            : 'bg-white dark:bg-zinc-800 border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Description & File URL */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Brief & Instructions
                </h4>
                <p className="text-xs text-zinc-600 dark:text-zinc-300 whitespace-pre-wrap leading-relaxed">
                  {activeAssignment.description || 'No additional instructions provided.'}
                </p>
                {activeAssignment.file_url && (
                  <a
                    href={activeAssignment.file_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/10 text-blue-500 border border-blue-500/20 text-xs font-semibold hover:bg-blue-500/20 transition"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    <span>Open Assignment Attachment</span>
                  </a>
                )}
              </div>

              {/* P2P Help Thread */}
              <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-blue-500" />
                  <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    Peer-to-Peer (P2P) Help Thread ({threads.length})
                  </h4>
                </div>

                <div className="space-y-2.5 max-h-60 overflow-y-auto pr-1">
                  {loadingThreads ? (
                    <p className="text-xs text-zinc-400 text-center py-4">Loading thread...</p>
                  ) : threads.length === 0 ? (
                    <p className="text-xs text-zinc-400 text-center py-4 bg-zinc-50 dark:bg-zinc-900/40 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
                      No messages yet. Share a hint, doubt, or reference link below!
                    </p>
                  ) : (
                    threads.map((msg) => (
                      <div
                        key={msg.id}
                        className="bg-zinc-50 dark:bg-zinc-900 p-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-1.5"
                      >
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-bold text-blue-500">{msg.author_name}</span>
                          <span className="text-zinc-400 font-mono text-[10px]">
                            {new Date(msg.created_at).toLocaleString()}
                          </span>
                        </div>
                        <p className="text-xs text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                          {msg.message}
                        </p>
                        {msg.file_url && (
                          <a
                            href={msg.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-500 hover:underline"
                          >
                            <ExternalLink className="w-3 h-3" />
                            <span>View Shared Link</span>
                          </a>
                        )}
                      </div>
                    ))
                  )}
                </div>

                <form onSubmit={handlePostThreadReply} className="space-y-2 pt-1">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      required
                      placeholder="Ask a doubt or share a hint..."
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      className="flex-1 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={postingReply || !replyText.trim()}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1 transition"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Send</span>
                    </button>
                  </div>
                  <input
                    type="url"
                    placeholder="Optional reference link (Drive / GitHub / PDF)"
                    value={replyFileUrl}
                    onChange={(e) => setReplyFileUrl(e.target.value)}
                    className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-1.5 text-[11px] focus:outline-none"
                  />
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
