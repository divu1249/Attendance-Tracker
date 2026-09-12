'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  Moon,
  Sun,
  Plus,
  Trash2,
  GripVertical,
  CheckCircle,
  ArrowRight,
  User,
  GraduationCap,
  School,
  Lock,
  Mail,
  LayoutGrid,
  Layers,
  HelpCircle
} from 'lucide-react';

interface SubjectBlock {
  id: string;
  name: string;
  prof: string;
  tagColor: string;
}

const PASTEL_COLORS = [
  'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
  'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
  'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
  'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
];

export default function RootAuthAndOnboarding() {
  const [darkMode, setDarkMode] = useState(true);
  const [viewState, setViewState] = useState<'auth' | 'academic' | 'canvas'>('auth');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  // Form profile state
  const [authData, setAuthData] = useState({
    email: '',
    password: '',
    username: '',
    collegeName: '',
    stream: '',
    semester: '1',
    targetThreshold: '75',
  });

  // Reusable blocks palette
  const [subjectBlocks, setSubjectBlocks] = useState<SubjectBlock[]>([
    { id: 'sb-1', name: 'DSA', prof: 'Dr. Sharma', tagColor: PASTEL_COLORS[0] },
    { id: 'sb-2', name: 'Operating Systems', prof: 'Prof. Roy', tagColor: PASTEL_COLORS[1] },
    { id: 'sb-3', name: 'Applied Math', prof: 'Dr. Mehta', tagColor: PASTEL_COLORS[2] },
  ]);

  const [newSubName, setNewSubName] = useState('');
  const [newProfName, setNewProfName] = useState('');

  // Timetable grid dimensions
  const [rowDays, setRowDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [colSlots, setColSlots] = useState<string[]>([
    '08:30 - 09:30',
    '09:30 - 10:30',
    '10:45 - 11:45',
    '11:45 - 12:45',
    '01:30 - 02:30',
  ]);

  // Matrix cell store: "rowIndex-colIndex" -> SubjectBlock
  const [matrixData, setMatrixData] = useState<Record<string, SubjectBlock | null>>({});

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [darkMode]);

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, block: SubjectBlock) => {
    e.dataTransfer.setData('application/json', JSON.stringify(block));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDrop = (rowIndex: number, colIndex: number, e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/json');
    if (!raw) return;
    try {
      const droppedBlock: SubjectBlock = JSON.parse(raw);
      setMatrixData((prev) => ({
        ...prev,
        [`${rowIndex}-${colIndex}`]: droppedBlock,
      }));
    } catch (err) {
      console.error(err);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  };

  const clearCell = (rowIndex: number, colIndex: number) => {
    setMatrixData((prev) => {
      const updated = { ...prev };
      delete updated[`${rowIndex}-${colIndex}`];
      return updated;
    });
  };

  const handleCreateBlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSubName.trim()) return;
    const nextColor = PASTEL_COLORS[subjectBlocks.length % PASTEL_COLORS.length];
    setSubjectBlocks((prev) => [
      ...prev,
      {
        id: `sb-${Date.now()}`,
        name: newSubName.trim(),
        prof: newProfName.trim() || 'Faculty',
        tagColor: nextColor,
      },
    ]);
    setNewSubName('');
    setNewProfName('');
  };

  // Auth submission
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    if (!isSignUp) {
      // Existing user sign-in
      const { data, error } = await supabase.auth.signInWithPassword({
        email: authData.email,
        password: authData.password,
      });

      if (error) {
        setErrorMsg(error.message);
        setLoading(false);
      } else if (data?.user) {
        window.location.href = '/dashboard';
      }
    } else {
      // Move to academic configuration
      setLoading(false);
      setViewState('academic');
    }
  };

  // Complete registration and commit schedule
  const handleFinalLaunch = async () => {
    setLoading(true);
    setErrorMsg('');

    try {
      const { data: userReg, error: signErr } = await supabase.auth.signUp({
        email: authData.email,
        password: authData.password,
      });

      if (signErr || !userReg.user) {
        throw new Error(signErr?.message || 'Failed to complete registration');
      }

      const uid = userReg.user.id;

      // 1. Profile insertion
      await supabase.from('profiles').insert({
        id: uid,
        email: authData.email,
        username: authData.username || authData.email.split('@')[0],
        college_name: authData.collegeName || 'Campus Studio',
        stream: authData.stream || 'B.Tech',
        semester: parseInt(authData.semester) || 1,
        target_threshold: parseFloat(authData.targetThreshold) || 75,
      });

      // 2. Parse matrix items into weekday slots
      const dayMap: Record<string, number> = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
      };

      const finalSlots: any[] = [];
      rowDays.forEach((day, rIdx) => {
        colSlots.forEach((slotTime, cIdx) => {
          const item = matrixData[`${rIdx}-${cIdx}`];
          if (item) {
            let start = '09:00';
            let end = '10:00';
            const parts = slotTime.split('-').map((s) => s.trim());
            if (parts.length === 2 && parts[0].includes(':') && parts[1].includes(':')) {
              start = parts[0];
              end = parts[1];
            }

            finalSlots.push({
              user_id: uid,
              subject: item.name,
              day_of_week: dayMap[day] !== undefined ? dayMap[day] : 1,
              start_time: start,
              end_time: end,
            });
          }
        });
      });

      if (finalSlots.length > 0) {
        await supabase.from('timetable').insert(finalSlots);
      }

      window.location.href = '/dashboard';
    } catch (err: any) {
      setErrorMsg(err.message || 'Error initializing profile');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--surface)] text-[var(--foreground)] font-sans antialiased flex flex-col justify-between">
      {/* Top Bar */}
      <nav className="border-b border-[var(--border)] px-6 py-3.5 flex items-center justify-between backdrop-blur-md bg-[var(--surface)]/80 sticky top-0 z-30">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded-lg bg-zinc-800 dark:bg-zinc-200 flex items-center justify-center text-white dark:text-zinc-900 font-bold text-xs">
            A
          </div>
          <span className="font-semibold tracking-tight text-sm">Attendance Studio</span>
        </div>

        <button
          onClick={() => setDarkMode(!darkMode)}
          className="p-2 rounded-xl border border-[var(--border)] bg-[var(--card)] hover:bg-zinc-100 dark:hover:bg-zinc-800/60 transition text-zinc-500"
          title="Toggle appearance"
        >
          {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-zinc-600" />}
        </button>
      </nav>

      {/* Main Flow */}
      <main className="flex-1 flex flex-col justify-center p-4 md:p-8 max-w-7xl mx-auto w-full">
        {errorMsg && (
          <div className="mb-6 max-w-md mx-auto p-3.5 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-rose-500" />
            {errorMsg}
          </div>
        )}

        {/* SCREEN 1: AUTHENTICATION */}
        {viewState === 'auth' && (
          <div className="max-w-md mx-auto w-full border border-[var(--border)] bg-[var(--card)] rounded-2xl p-7 shadow-sm">
            <div className="text-center mb-6">
              <h1 className="text-xl font-semibold tracking-tight">
                {isSignUp ? 'Create your workspace' : 'Welcome back'}
              </h1>
              <p className="text-xs text-[var(--muted)] mt-1">
                {isSignUp
                  ? 'Build your schedule and set your attendance target'
                  : 'Enter your credentials to view your ledger'}
              </p>
            </div>

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {isSignUp && (
                <div>
                  <label className="text-xs font-medium text-[var(--muted)] block mb-1">Username / Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
                    <input
                      type="text"
                      required
                      placeholder="alex"
                      value={authData.username}
                      onChange={(e) => setAuthData({ ...authData, username: e.target.value })}
                      className="w-full bg-zinc-50 dark:bg-zinc-900/50 border border-[var(--border)] rounded-xl py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-400"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-[var(--muted)] block mb-1">Email</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
                  <input
                    type="email"
                    required
                    placeholder="student@university.edu"
                    value={authData.email}
                    onChange={(e) => setAuthData({ ...authData, email: e.target.value })}
                    className="w-full bg-zinc-50 dark:bg-zinc-900/50 border border-[var(--border)] rounded-xl py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-400"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--muted)] block mb-1">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={authData.password}
                    onChange={(e) => setAuthData({ ...authData, password: e.target.value })}
                    className="w-full bg-zinc-50 dark:bg-zinc-900/50 border border-[var(--border)] rounded-xl py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-zinc-400"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-2.5 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 font-medium text-xs tracking-tight transition flex items-center justify-center gap-2"
              >
                {loading ? 'Processing...' : isSignUp ? 'Continue to Academic Details' : 'Sign In'}
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-[var(--border)] text-center">
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setErrorMsg('');
                }}
                className="text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition underline underline-offset-4"
              >
                {isSignUp ? 'Already registered? Sign in' : "Don't have an account? Sign up"}
              </button>
            </div>
          </div>
        )}

        {/* SCREEN 2: ACADEMIC DETAILS */}
        {viewState === 'academic' && (
          <div className="max-w-lg mx-auto w-full border border-[var(--border)] bg-[var(--card)] rounded-2xl p-7 shadow-sm">
            <div className="mb-6">
              <span className="text-[10px] font-mono uppercase text-zinc-400">Step 2 of 3</span>
              <h2 className="text-lg font-semibold tracking-tight mt-0.5">Academic Profile</h2>
              <p className="text-xs text-[var(--muted)]">Configure institution parameters and attendance thresholds</p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-xs font-medium text-[var(--muted)] block mb-1">College / University</label>
                <div className="relative">
                  <School className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="e.g. ADGITM / DTU"
                    value={authData.collegeName}
                    onChange={(e) => setAuthData({ ...authData, collegeName: e.target.value })}
                    className="w-full bg-zinc-50 dark:bg-zinc-900/50 border border-[var(--border)] rounded-xl py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-1"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-[var(--muted)] block mb-1">Branch / Major</label>
                <div className="relative">
                  <GraduationCap className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
                  <input
                    type="text"
                    placeholder="e.g. Artificial Intelligence"
                    value={authData.stream}
                    onChange={(e) => setAuthData({ ...authData, stream: e.target.value })}
                    className="w-full bg-zinc-50 dark:bg-zinc-900/50 border border-[var(--border)] rounded-xl py-2 pl-9 pr-3 text-sm focus:outline-none focus:ring-1"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-[var(--muted)] block mb-1">Semester</label>
                  <select
                    value={authData.semester}
                    onChange={(e) => setAuthData({ ...authData, semester: e.target.value })}
                    className="w-full bg-zinc-50 dark:bg-zinc-900/50 border border-[var(--border)] rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-1"
                  >
                    {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                      <option key={s} value={s}>Semester {s}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-medium text-[var(--muted)] block mb-1">Threshold (%)</label>
                  <input
                    type="number"
                    min="40"
                    max="100"
                    value={authData.targetThreshold}
                    onChange={(e) => setAuthData({ ...authData, targetThreshold: e.target.value })}
                    className="w-full bg-zinc-50 dark:bg-zinc-900/50 border border-[var(--border)] rounded-xl py-2 px-3 text-sm focus:outline-none focus:ring-1"
                  />
                </div>
              </div>

              <div className="pt-4 flex justify-between items-center">
                <button
                  type="button"
                  onClick={() => setViewState('auth')}
                  className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setViewState('canvas')}
                  className="py-2 px-5 rounded-xl bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900 text-xs font-medium flex items-center gap-1.5"
                >
                  Open Timetable Matrix <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SCREEN 3: INTERACTIVE SCHEDULE MATRIX */}
        {viewState === 'canvas' && (
          <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-[var(--border)] pb-4">
              <div>
                <span className="text-[10px] font-mono uppercase text-zinc-400">Step 3 of 3</span>
                <h1 className="text-lg font-bold tracking-tight">Timetable Builder</h1>
                <p className="text-xs text-[var(--muted)]">
                  Add subject blocks on the left and drag them directly into the matrix cells.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setViewState('academic')}
                  className="px-3 py-1.5 rounded-lg border border-[var(--border)] text-xs text-[var(--muted)] hover:text-[var(--foreground)]"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleFinalLaunch}
                  disabled={loading}
                  className="px-4 py-2 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white dark:bg-zinc-100 dark:hover:bg-zinc-200 dark:text-zinc-900 text-xs font-medium flex items-center gap-2 shadow-sm"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  {loading ? 'Saving Timetable...' : 'Save & Open Dashboard'}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Palette shelf */}
              <div className="lg:col-span-3 space-y-4">
                <div className="border border-[var(--border)] bg-[var(--card)] rounded-2xl p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <Layers className="w-4 h-4 text-zinc-500" />
                    <h3 className="text-xs font-bold tracking-tight uppercase">Subject Palette</h3>
                  </div>

                  <form onSubmit={handleCreateBlock} className="space-y-2 mb-4">
                    <input
                      type="text"
                      placeholder="Course name (e.g. AI Lab)"
                      value={newSubName}
                      onChange={(e) => setNewSubName(e.target.value)}
                      className="w-full bg-zinc-50 dark:bg-zinc-900/60 border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1"
                    />
                    <input
                      type="text"
                      placeholder="Professor / Room"
                      value={newProfName}
                      onChange={(e) => setNewProfName(e.target.value)}
                      className="w-full bg-zinc-50 dark:bg-zinc-900/60 border border-[var(--border)] rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1"
                    />
                    <button
                      type="submit"
                      className="w-full flex items-center justify-center gap-1 py-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-xs font-medium hover:bg-zinc-300 dark:hover:bg-zinc-700 transition"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Block
                    </button>
                  </form>

                  <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
                    <p className="text-[10px] text-[var(--muted)] flex items-center gap-1 mb-1">
                      <HelpCircle className="w-3 h-3" /> Drag block into table cells:
                    </p>
                    {subjectBlocks.map((block) => (
                      <div
                        key={block.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, block)}
                        className={`p-2.5 rounded-xl border flex items-center justify-between cursor-grab active:cursor-grabbing hover:scale-[1.01] transition select-none ${block.tagColor}`}
                      >
                        <div className="flex items-center gap-2 overflow-hidden">
                          <GripVertical className="w-3.5 h-3.5 opacity-40 shrink-0" />
                          <div className="truncate">
                            <p className="text-xs font-semibold leading-tight truncate">{block.name}</p>
                            <p className="text-[10px] opacity-75 truncate">{block.prof}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setSubjectBlocks(subjectBlocks.filter((b) => b.id !== block.id))}
                          className="text-zinc-400 hover:text-rose-500 opacity-60 hover:opacity-100 p-1"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Grid Canvas */}
              <div className="lg:col-span-9 border border-[var(--border)] bg-[var(--card)] rounded-2xl p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <LayoutGrid className="w-4 h-4 text-zinc-500" />
                    <h3 className="text-xs font-bold tracking-tight uppercase">Customizable Grid</h3>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setColSlots([...colSlots, `Slot ${colSlots.length + 1}`])}
                      className="px-2.5 py-1 rounded-md border border-[var(--border)] hover:bg-zinc-100 dark:hover:bg-zinc-800 transition text-[11px]"
                    >
                      + Add Time Slot
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                        setRowDays([...rowDays, days[rowDays.length] || `Day ${rowDays.length + 1}`]);
                      }}
                      className="px-2.5 py-1 rounded-md border border-[var(--border)] hover:bg-zinc-100 dark:hover:bg-zinc-800 transition text-[11px]"
                    >
                      + Add Day
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto border border-[var(--border)] rounded-xl">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="bg-zinc-100/60 dark:bg-zinc-900/60 border-b border-[var(--border)]">
                        <th className="p-3 text-[11px] font-semibold text-[var(--muted)] border-r border-[var(--border)] w-28">
                          Days \ Timing
                        </th>
                        {colSlots.map((slot, cIdx) => (
                          <th key={cIdx} className="p-2 text-xs border-r border-[var(--border)] font-medium min-w-[150px] group">
                            <div className="flex items-center justify-between gap-1">
                              <input
                                type="text"
                                value={slot}
                                onChange={(e) => {
                                  const updated = [...colSlots];
                                  updated[cIdx] = e.target.value;
                                  setColSlots(updated);
                                }}
                                className="bg-transparent text-xs font-mono w-full focus:outline-none focus:bg-zinc-200/50 dark:focus:bg-zinc-800/50 rounded px-1"
                              />
                              {colSlots.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => setColSlots(colSlots.filter((_, i) => i !== cIdx))}
                                  className="text-zinc-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition p-0.5"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rowDays.map((day, rIdx) => (
                        <tr key={rIdx} className="border-b border-[var(--border)] hover:bg-zinc-50/50 dark:hover:bg-zinc-900/20">
                          <td className="p-2 border-r border-[var(--border)] bg-zinc-50/30 dark:bg-zinc-900/30 group">
                            <div className="flex items-center justify-between gap-1">
                              <input
                                type="text"
                                value={day}
                                onChange={(e) => {
                                  const updated = [...rowDays];
                                  updated[rIdx] = e.target.value;
                                  setRowDays(updated);
                                }}
                                className="bg-transparent text-xs font-semibold w-16 focus:outline-none focus:bg-zinc-200/50 dark:focus:bg-zinc-800/50 rounded px-1"
                              />
                              {rowDays.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => setRowDays(rowDays.filter((_, i) => i !== rIdx))}
                                  className="text-zinc-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition p-0.5"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </td>

                          {colSlots.map((_, cIdx) => {
                            const current = matrixData[`${rIdx}-${cIdx}`];
                            return (
                              <td
                                key={cIdx}
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(rIdx, cIdx, e)}
                                className="p-2 border-r border-[var(--border)] h-20 transition relative group"
                              >
                                {current ? (
                                  <div className={`h-full w-full p-2 rounded-lg border flex flex-col justify-between text-xs transition select-none ${current.tagColor}`}>
                                    <div className="flex items-start justify-between">
                                      <span className="font-semibold text-xs leading-tight line-clamp-1">{current.name}</span>
                                      <button
                                        type="button"
                                        onClick={() => clearCell(rIdx, cIdx)}
                                        className="text-zinc-400 hover:text-rose-500 p-0.5"
                                      >
                                        <Trash2 className="w-3 h-3" />
                                      </button>
                                    </div>
                                    <span className="text-[10px] opacity-75 line-clamp-1">{current.prof}</span>
                                  </div>
                                ) : (
                                  <div className="h-full w-full rounded-lg border border-dashed border-zinc-300/40 dark:border-zinc-800 flex items-center justify-center text-zinc-400 text-[10px] group-hover:border-zinc-400 transition">
                                    Drop Class
                                  </div>
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="border-t border-[var(--border)] py-4 text-center text-xs text-[var(--muted)]">
        Attendance Studio &copy; {new Date().getFullYear()} · Minimal Washed Aesthetic
      </footer>
    </div>
  );
}