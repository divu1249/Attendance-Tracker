'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import {
  CalendarClock,
  Plus,
  Trash2,
  CheckSquare,
  Square,
  BookOpen,
  MapPin,
  Clock,
  ExternalLink,
  Globe,
  Lock,
  Sparkles,
  FileText,
} from 'lucide-react';

interface SyllabusTopic {
  topic: string;
  done: boolean;
}

interface ExamEntry {
  id: string;
  user_id: string;
  author_name: string;
  classroom_id: string | null;
  subject: string;
  exam_date: string;
  end_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  room_no?: string | null;
  syllabus_topics: SyllabusTopic[];
  classes_optional: boolean;
  is_shared: boolean;
}

interface SubjectNote {
  id: string;
  user_id: string;
  author_name: string;
  classroom_id: string | null;
  subject: string;
  title: string;
  content: string;
  file_url?: string | null;
  unit_tag?: string | null;
  is_shared: boolean;
  created_at: string;
}

interface ExamsWorkspaceProps {
  user: any;
  profile: any;
  allSlots: any[];
  activeClassroomId: string | null;
}

function getLocalTodayStr(): string {
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60000;
  return new Date(today.getTime() - offset).toISOString().split('T')[0];
}

function getDaysDelta(dateStr: string): number {
  const todayStr = getLocalTodayStr();
  const [ty, tm, td] = todayStr.split('-').map(Number);
  const [ey, em, ed] = dateStr.split('-').map(Number);
  const tDate = new Date(ty, tm - 1, td, 12, 0, 0);
  const eDate = new Date(ey, em - 1, ed, 12, 0, 0);
  return Math.round((eDate.getTime() - tDate.getTime()) / (1000 * 60 * 60 * 24));
}

export default function ExamsWorkspace({
  user,
  profile,
  allSlots,
  activeClassroomId,
}: ExamsWorkspaceProps) {
  const publicName = useMemo(
    () =>
      profile?.full_name?.trim() ||
      profile?.username?.trim() ||
      user?.email?.split('@')[0] ||
      'Student',
    [profile?.full_name, profile?.username, user?.email]
  );

  const [exams, setExams] = useState<ExamEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Add exam modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [subject, setSubject] = useState('');
  const [examDate, setExamDate] = useState(() => getLocalTodayStr());
  const [endDate, setEndDate] = useState('');
  const [startTime, setStartTime] = useState('09:30');
  const [endTime, setEndTime] = useState('12:30');
  const [roomNo, setRoomNo] = useState('');
  const [classesOptional, setClassesOptional] = useState(true);
  const [isShared, setIsShared] = useState(false);
  const [initialTopicsText, setInitialTopicsText] = useState('');
  const [savingExam, setSavingExam] = useState(false);

  // Per-exam quick add topic input
  const [topicInputs, setTopicInputs] = useState<Record<string, string>>({});

  // Notes Drawer Modal for a specific Exam
  const [notesExam, setNotesExam] = useState<ExamEntry | null>(null);
  const [linkedNotes, setLinkedNotes] = useState<SubjectNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);

  // Quick-add note inside drawer
  const [quickTitle, setQuickTitle] = useState('');
  const [quickUnit, setQuickUnit] = useState('');
  const [quickContent, setQuickContent] = useState('');
  const [quickUrl, setQuickUrl] = useState('');
  const [quickShared, setQuickShared] = useState(false);
  const [savingQuickNote, setSavingQuickNote] = useState(false);

  const uniqueSubjects = useMemo(() => {
    const set = new Set<string>();
    allSlots.forEach((s) => {
      if (s.subject) set.add(s.subject);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allSlots]);

  const fetchExams = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      let query = supabase
        .from('exam_datesheet')
        .select('*')
        .order('exam_date', { ascending: true });

      if (activeClassroomId) {
        query = query.or(
          `user_id.eq.${user.id},and(classroom_id.eq.${activeClassroomId},is_shared.eq.true)`
        );
      } else {
        query = query.eq('user_id', user.id);
      }

      const { data, error } = await query;
      if (error) throw error;

      const normalized: ExamEntry[] = (data || []).map((row: any) => ({
        ...row,
        syllabus_topics: Array.isArray(row.syllabus_topics) ? row.syllabus_topics : [],
      }));
      setExams(normalized);
    } catch (err: any) {
      toast.error('Failed to load exams: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [user, activeClassroomId]);

  useEffect(() => {
    fetchExams();
  }, [fetchExams]);

  const handleCreateExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !subject.trim() || !examDate) return;
    setSavingExam(true);

    try {
      const topics: SyllabusTopic[] = initialTopicsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .map((topic) => ({ topic, done: false }));

      const shareToClass = isShared && !!activeClassroomId;

      const { error } = await supabase.from('exam_datesheet').insert({
        user_id: user.id,
        author_name: publicName,
        classroom_id: shareToClass ? activeClassroomId : null,
        subject: subject.trim(),
        exam_date: examDate,
        end_date: endDate.trim() ? endDate.trim() : null,
        start_time: startTime || null,
        end_time: endTime || null,
        room_no: roomNo.trim() || null,
        syllabus_topics: topics,
        classes_optional: classesOptional,
        is_shared: shareToClass,
      });

      if (error) throw error;

      toast.success('Exam added to datesheet!');
      setSubject('');
      setEndDate('');
      setRoomNo('');
      setInitialTopicsText('');
      setShowAddModal(false);
      await fetchExams();
    } catch (err: any) {
      toast.error('Failed to save exam: ' + err.message);
    } finally {
      setSavingExam(false);
    }
  };

  const handleDeleteExam = async (id: string) => {
    try {
      const { error } = await supabase.from('exam_datesheet').delete().eq('id', id);
      if (error) throw error;
      setExams((prev) => prev.filter((e) => e.id !== id));
      toast.success('Exam removed.');
    } catch (err: any) {
      toast.error('Failed to delete exam: ' + err.message);
    }
  };

  const persistSyllabus = async (exam: ExamEntry, nextTopics: SyllabusTopic[]) => {
    setExams((prev) =>
      prev.map((e) => (e.id === exam.id ? { ...e, syllabus_topics: nextTopics } : e))
    );

    const { error } = await supabase
      .from('exam_datesheet')
      .update({ syllabus_topics: nextTopics })
      .eq('id', exam.id);

    if (error) {
      toast.error('Could not sync syllabus checklist: ' + error.message);
    }
  };

  const handleToggleTopic = async (exam: ExamEntry, idx: number) => {
    const nextTopics = exam.syllabus_topics.map((item, i) =>
      i === idx ? { ...item, done: !item.done } : item
    );
    await persistSyllabus(exam, nextTopics);
  };

  const handleAddTopic = async (exam: ExamEntry) => {
    const text = (topicInputs[exam.id] || '').trim();
    if (!text) return;
    const nextTopics = [...exam.syllabus_topics, { topic: text, done: false }];
    setTopicInputs((prev) => ({ ...prev, [exam.id]: '' }));
    await persistSyllabus(exam, nextTopics);
  };

  const handleRemoveTopic = async (exam: ExamEntry, idx: number) => {
    const nextTopics = exam.syllabus_topics.filter((_, i) => i !== idx);
    await persistSyllabus(exam, nextTopics);
  };

  const openNotesDrawer = async (exam: ExamEntry) => {
    setNotesExam(exam);
    setQuickShared(!!activeClassroomId && exam.is_shared);
    setLoadingNotes(true);
    try {
      let query = supabase
        .from('subject_notes')
        .select('*')
        .ilike('subject', exam.subject)
        .order('created_at', { ascending: false });

      if (activeClassroomId) {
        query = query.or(
          `user_id.eq.${user.id},and(classroom_id.eq.${activeClassroomId},is_shared.eq.true)`
        );
      } else {
        query = query.eq('user_id', user.id);
      }

      const { data, error } = await query;
      if (error) throw error;
      setLinkedNotes(data || []);
    } catch (err: any) {
      toast.error('Failed to load subject notes: ' + err.message);
    } finally {
      setLoadingNotes(false);
    }
  };

  const handleQuickAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !notesExam || !quickTitle.trim() || !quickContent.trim()) return;
    setSavingQuickNote(true);

    try {
      const shareNote = quickShared && !!activeClassroomId;
      const { data, error } = await supabase
        .from('subject_notes')
        .insert({
          user_id: user.id,
          author_name: publicName,
          classroom_id: shareNote ? activeClassroomId : null,
          subject: notesExam.subject,
          title: quickTitle.trim(),
          unit_tag: quickUnit.trim() || null,
          content: quickContent.trim(),
          file_url: quickUrl.trim() || null,
          is_shared: shareNote,
        })
        .select()
        .single();

      if (error) throw error;

      setLinkedNotes((prev) => [data, ...prev]);
      setQuickTitle('');
      setQuickUnit('');
      setQuickContent('');
      setQuickUrl('');
      toast.success('Note added to ' + notesExam.subject + ' pool!');
    } catch (err: any) {
      toast.error('Failed to add note: ' + err.message);
    } finally {
      setSavingQuickNote(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-6 rounded-[24px] md:rounded-[28px] border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-blue-500" />
            <h2 className="text-base font-bold tracking-tight">Exam Datesheet & Syllabus Tracker</h2>
          </div>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
            Track exam countdowns, mark optional class days, tick off syllabus topics, and access subject notes.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setSubject(uniqueSubjects[0] || '');
            setShowAddModal(true);
          }}
          className="px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition w-fit"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Exam Entry</span>
        </button>
      </div>

      {/* Exam Datesheet Grid */}
      {loading ? (
        <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-8 rounded-[28px] border border-zinc-200 dark:border-zinc-800 text-center text-xs text-zinc-400">
          Loading exam datesheet...
        </div>
      ) : exams.length === 0 ? (
        <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-12 rounded-[28px] border border-zinc-200 dark:border-zinc-800 text-center space-y-2">
          <CalendarClock className="w-9 h-9 mx-auto text-zinc-400" />
          <h3 className="text-sm font-bold">No Exams Scheduled</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
            Add your upcoming mid-sems, finals, or practical dates to unlock syllabus checklists and linked revision notes.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {exams.map((exam) => {
            const delta = getDaysDelta(exam.exam_date);
            const endDelta = exam.end_date ? getDaysDelta(exam.end_date) : delta;
            const totalTopics = exam.syllabus_topics.length;
            const doneTopics = exam.syllabus_topics.filter((t) => t.done).length;
            const progressPct = totalTopics > 0 ? Math.round((doneTopics / totalTopics) * 100) : 0;

            return (
              <div
                key={exam.id}
                className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-6 rounded-[24px] md:rounded-[28px] border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4 flex flex-col justify-between"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-bold tracking-tight">{exam.subject}</h3>
                        {delta === 0 || (delta < 0 && endDelta >= 0) ? (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-rose-500/15 text-rose-500 border border-rose-500/20">
                            Exam Active Today
                          </span>
                        ) : delta > 0 ? (
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                              delta <= 3
                                ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/20'
                                : 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20'
                            }`}
                          >
                            In {delta} day{delta === 1 ? '' : 's'}
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-zinc-200 dark:bg-zinc-800 text-zinc-500">
                            Completed
                          </span>
                        )}

                        {exam.classes_optional && (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20">
                            Classes Optional
                          </span>
                        )}

                        {exam.is_shared && (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                            <Globe className="w-2.5 h-2.5" /> Shared
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 flex-wrap text-xs text-zinc-500 dark:text-zinc-400">
                        <span className="font-mono">
                          {exam.exam_date}
                          {exam.end_date ? ` → ${exam.end_date}` : ''}
                        </span>
                        {exam.start_time && (
                          <span className="flex items-center gap-1 font-mono">
                            <Clock className="w-3 h-3" />
                            {exam.start_time.slice(0, 5)}
                            {exam.end_time ? `–${exam.end_time.slice(0, 5)}` : ''}
                          </span>
                        )}
                        {exam.room_no && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-rose-500" />
                            {exam.room_no}
                          </span>
                        )}
                      </div>
                    </div>

                    {exam.user_id === user.id && (
                      <button
                        type="button"
                        onClick={() => handleDeleteExam(exam.id)}
                        className="p-1.5 rounded-full text-zinc-400 hover:text-rose-500 transition"
                        title="Delete exam entry"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Interactive Syllabus Checklist */}
                  <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-3">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold uppercase tracking-wider text-zinc-400 text-[11px]">
                        Syllabus Checklist
                      </span>
                      <span className="font-bold text-blue-500">
                        {doneTopics}/{totalTopics} ({progressPct}%)
                      </span>
                    </div>

                    <div className="w-full bg-zinc-100 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-300"
                        style={{ width: `${progressPct}%` }}
                      />
                    </div>

                    <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                      {exam.syllabus_topics.length === 0 ? (
                        <p className="text-[11px] text-zinc-400 py-1">
                          No syllabus topics added yet.
                        </p>
                      ) : (
                        exam.syllabus_topics.map((item, idx) => (
                          <div
                            key={idx}
                            className="flex items-center justify-between gap-2 text-xs py-1 px-2 rounded-xl hover:bg-zinc-50 dark:hover:bg-zinc-800/60 group"
                          >
                            <button
                              type="button"
                              onClick={() => handleToggleTopic(exam, idx)}
                              className="flex items-center gap-2 text-left flex-1 min-w-0"
                            >
                              {item.done ? (
                                <CheckSquare className="w-4 h-4 text-emerald-500 shrink-0" />
                              ) : (
                                <Square className="w-4 h-4 text-zinc-400 shrink-0" />
                              )}
                              <span
                                className={`truncate ${
                                  item.done ? 'line-through text-zinc-400' : 'font-medium'
                                }`}
                              >
                                {item.topic}
                              </span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleRemoveTopic(exam, idx)}
                              className="text-zinc-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition p-0.5"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        ))
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="text"
                        placeholder="Add topic (e.g. Unit 4 Trees)"
                        value={topicInputs[exam.id] || ''}
                        onChange={(e) =>
                          setTopicInputs((prev) => ({ ...prev, [exam.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddTopic(exam);
                          }
                        }}
                        className="flex-1 bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-1.5 text-xs focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => handleAddTopic(exam)}
                        className="px-3 py-1.5 rounded-xl bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-xs font-semibold transition"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-1">
                  <span className="text-[11px] text-zinc-400">
                    Added by {exam.author_name}
                  </span>

                  <button
                    type="button"
                    onClick={() => openNotesDrawer(exam)}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
                  >
                    <BookOpen className="w-3.5 h-3.5" />
                    <span>Open Subject Notes Pool</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL: ADD EXAM ENTRY */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800 rounded-[28px] max-w-lg w-full p-6 space-y-5 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <CalendarClock className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-bold">Add Exam / Datesheet Entry</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="w-6 h-6 rounded-full bg-zinc-200/60 dark:bg-zinc-800/60 text-xs flex items-center justify-center text-zinc-500"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateExam} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-400">Subject</label>
                <input
                  type="text"
                  required
                  list="exam-subjects-list"
                  placeholder="e.g. Data Structures"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none"
                />
                <datalist id="exam-subjects-list">
                  {uniqueSubjects.map((sub) => (
                    <option key={sub} value={sub} />
                  ))}
                </datalist>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-400">Exam Date</label>
                  <input
                    type="date"
                    required
                    value={examDate}
                    onChange={(e) => setExamDate(e.target.value)}
                    className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-400">End Date (Optional Range)</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-400">Start Time</label>
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-400">End Time</label>
                  <input
                    type="time"
                    value={endTime}
                    onChange={(e) => setEndTime(e.target.value)}
                    className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-400">Room / Hall</label>
                  <input
                    type="text"
                    placeholder="e.g. B-204"
                    value={roomNo}
                    onChange={(e) => setRoomNo(e.target.value)}
                    className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-400">
                  Syllabus Topics (comma-separated, optional)
                </label>
                <input
                  type="text"
                  placeholder="Unit 1 Graphs, Unit 2 Dynamic Programming, Previous Papers"
                  value={initialTopicsText}
                  onChange={(e) => setInitialTopicsText(e.target.value)}
                  className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none"
                />
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={classesOptional}
                    onChange={(e) => setClassesOptional(e.target.checked)}
                    className="rounded accent-blue-600"
                  />
                  <span>Mark regular lectures optional on this exam date</span>
                </label>

                {activeClassroomId && (
                  <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isShared}
                      onChange={(e) => setIsShared(e.target.checked)}
                      className="rounded accent-emerald-600"
                    />
                    <span>Share this exam entry with my active classroom</span>
                  </label>
                )}
              </div>

              <button
                type="submit"
                disabled={savingExam}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition shadow-sm"
              >
                {savingExam ? 'Saving...' : 'Save Exam Entry'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL / DRAWER: LINKED SUBJECT NOTES POOL */}
      {notesExam && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800 rounded-[28px] max-w-3xl w-full p-6 space-y-5 shadow-2xl my-8 max-h-[88vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3 shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-500" />
                <div>
                  <h3 className="text-sm font-bold">{notesExam.subject} — Exam Prep Notes Pool</h3>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                    Showing your private vault & active classroom shared notes for {notesExam.subject}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setNotesExam(null)}
                className="w-7 h-7 rounded-full bg-zinc-200/60 dark:bg-zinc-800/60 text-xs flex items-center justify-center text-zinc-500"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-12 gap-5 overflow-y-auto pr-1">
              {/* Quick Add Note Form */}
              <form
                onSubmit={handleQuickAddNote}
                className="md:col-span-5 bg-zinc-50 dark:bg-zinc-900/70 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-3 h-fit"
              >
                <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                  Quick Add Prep Note
                </h4>
                <input
                  type="text"
                  required
                  placeholder="Note Title"
                  value={quickTitle}
                  onChange={(e) => setQuickTitle(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none"
                />
                <input
                  type="text"
                  placeholder="Unit Tag (e.g. Unit 2)"
                  value={quickUnit}
                  onChange={(e) => setQuickUnit(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none"
                />
                <textarea
                  required
                  rows={3}
                  placeholder="Key formulas, important questions..."
                  value={quickContent}
                  onChange={(e) => setQuickContent(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none resize-y"
                />
                <input
                  type="url"
                  placeholder="PDF / Drive Link (optional)"
                  value={quickUrl}
                  onChange={(e) => setQuickUrl(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none"
                />

                {activeClassroomId && (
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <input
                      type="checkbox"
                      checked={quickShared}
                      onChange={(e) => setQuickShared(e.target.checked)}
                      className="accent-blue-600"
                    />
                    <span>Share to classroom notes pool</span>
                  </label>
                )}

                <button
                  type="submit"
                  disabled={savingQuickNote}
                  className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition"
                >
                  {savingQuickNote ? 'Saving...' : 'Save Note'}
                </button>
              </form>

              {/* Filtered Notes List */}
              <div className="md:col-span-7 space-y-3">
                {loadingNotes ? (
                  <p className="text-xs text-zinc-400 text-center py-8">Loading notes...</p>
                ) : linkedNotes.length === 0 ? (
                  <div className="py-10 text-center space-y-2 bg-zinc-50 dark:bg-zinc-900/40 rounded-2xl border border-dashed border-zinc-200 dark:border-zinc-800">
                    <FileText className="w-7 h-7 mx-auto text-zinc-400" />
                    <p className="text-xs text-zinc-500">
                      No notes found for <strong>{notesExam.subject}</strong> yet. Add one on the left!
                    </p>
                  </div>
                ) : (
                  linkedNotes.map((note) => (
                    <div
                      key={note.id}
                      className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-2"
                    >
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full flex items-center gap-1 border ${
                              note.is_shared
                                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                                : 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
                            }`}
                          >
                            {note.is_shared ? <Globe className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
                            {note.is_shared ? 'Shared' : 'Private'}
                          </span>
                          {note.unit_tag && (
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20">
                              {note.unit_tag}
                            </span>
                          )}
                        </div>
                        <span className="text-[10px] text-zinc-400">
                          By {note.author_name}
                        </span>
                      </div>

                      <h5 className="text-xs font-bold">{note.title}</h5>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap leading-relaxed">
                        {note.content}
                      </p>

                      {note.file_url && (
                        <a
                          href={note.file_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-500 hover:underline pt-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          <span>Open Attached Resource</span>
                        </a>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
