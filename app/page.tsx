'use client';

import React, { useState, useEffect } from 'react';
import Image from 'next/image';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import SuggestionBoxDrawer from '@/components/SuggestionBoxDrawer';
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
  HelpCircle,
  Sparkles,
  Megaphone,
  X,
  FlaskConical,
  BookOpen,
  Users,
  Flame,
  CalendarClock,
  ClipboardList,
  MessageSquare,
  Camera,
  Globe,
  CheckSquare,
  ShieldCheck,
  Calculator,
  Clock,
  ArrowUpRight,
} from 'lucide-react';

interface SubjectBlock {
  id: string;
  name: string;
  prof: string;
  tagColor: string;
  course_type: 'theory' | 'lab';
}

interface AppUpdate {
  id: string;
  version: string;
  title: string;
  content: string;
  is_pinned: boolean;
  created_at: string;
}

const PASTEL_COLORS = [
  'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
  'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
  'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
  'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
];

export default function LandingAndOnboardingPage() {
  const [darkMode, setDarkMode] = useState(true);
  const [checkingSession, setCheckingSession] = useState(true);

  // Global Top Notification Banner state
  const [latestUpdate, setLatestUpdate] = useState<AppUpdate | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  // Suggestion Box controlled open state
  const [suggestionOpen, setSuggestionOpen] = useState(false);

  // Interactive Hero Preview Simulator state
  const [heroSimSkips, setHeroSimSkips] = useState(0);

  // Auth & 3-Step Onboarding Modal state
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [viewState, setViewState] = useState<'auth' | 'academic' | 'canvas'>('auth');
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  const [authData, setAuthData] = useState({
    email: '',
    password: '',
    username: '',
    fullName: '',
    collegeName: '',
    stream: '',
    semester: '1',
    targetThreshold: '75',
    labThreshold: '80',
  });

  // Reusable blocks palette
  const [subjectBlocks, setSubjectBlocks] = useState<SubjectBlock[]>([
    { id: 'sb-1', name: 'Data Structures', prof: 'Dr. Sharma', tagColor: PASTEL_COLORS[0], course_type: 'theory' },
    { id: 'sb-2', name: 'Operating Systems', prof: 'Prof. Roy', tagColor: PASTEL_COLORS[1], course_type: 'theory' },
    { id: 'sb-3', name: 'OS Lab', prof: 'Lab 2', tagColor: PASTEL_COLORS[2], course_type: 'lab' },
  ]);

  const [newSubName, setNewSubName] = useState('');
  const [newProfName, setNewProfName] = useState('');
  const [newCourseType, setNewCourseType] = useState<'theory' | 'lab'>('theory');
  const [selectedTapBlock, setSelectedTapBlock] = useState<SubjectBlock | null>(null);

  // Timetable grid dimensions
  const [rowDays, setRowDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [colSlots, setColSlots] = useState<string[]>([
    '08:30 - 09:30',
    '09:30 - 10:30',
    '10:45 - 11:45',
    '11:45 - 12:45',
    '13:30 - 14:30',
  ]);
  const [matrixData, setMatrixData] = useState<Record<string, SubjectBlock | null>>({});

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
  }, [darkMode]);

  // Session Auto-Redirect & Global Top Notification Fetch
  useEffect(() => {
    let mounted = true;

    const initLanding = async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData?.session?.user) {
          window.location.replace('/dashboard');
          return;
        }
      } catch {
        // Stay on landing page
      } finally {
        if (mounted) setCheckingSession(false);
      }

      try {
        const { data: updates } = await supabase
          .from('app_updates')
          .select('*')
          .order('is_pinned', { ascending: false })
          .order('created_at', { ascending: false })
          .limit(1);

        if (mounted && updates && updates.length > 0) {
          setLatestUpdate(updates[0] as AppUpdate);
        }
      } catch {
        // Non-fatal
      }
    };

    initLanding();
    return () => {
      mounted = false;
    };
  }, []);

  const openAuthModal = (signUpMode: boolean) => {
    setIsSignUp(signUpMode);
    setViewState('auth');
    setErrorMsg('');
    setAuthModalOpen(true);
  };

  // Drag & Drop handlers for Step 3 Matrix
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
    } catch {
      // Ignore parse error
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
        course_type: newCourseType,
      },
    ]);
    setNewSubName('');
    setNewProfName('');
  };

  // Step 1 Auth Submission
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg('');

    if (!isSignUp) {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: authData.email.trim(),
        password: authData.password,
      });

      if (error) {
        setErrorMsg(error.message);
        setLoading(false);
      } else if (data?.user) {
        toast.success('Welcome back! Opening workspace...');
        window.location.href = '/dashboard';
      }
    } else {
      setLoading(false);
      setViewState('academic');
    }
  };

  // Step 3 Final Launch — safe upsert on profiles, insert on timetable (never delete)
  const handleFinalLaunch = async () => {
    setLoading(true);
    setErrorMsg('');

    try {
      const { data: userReg, error: signErr } = await supabase.auth.signUp({
        email: authData.email.trim(),
        password: authData.password,
      });

      if (signErr || !userReg.user) {
        throw new Error(signErr?.message || 'Failed to complete registration');
      }

      const uid = userReg.user.id;
      const safeUsername = authData.username.trim() || authData.email.split('@')[0];

      // Safe upsert on profiles (preserves any existing fields)
      const { error: profErr } = await supabase.from('profiles').upsert(
        {
          id: uid,
          email: authData.email.trim(),
          username: safeUsername,
          full_name: authData.fullName.trim() || safeUsername,
          college_name: authData.collegeName.trim() || 'Campus Studio',
          stream: authData.stream.trim() || 'Undergraduate',
          semester: parseInt(authData.semester, 10) || 1,
          target_threshold: parseFloat(authData.targetThreshold) || 75,
          lab_threshold: parseFloat(authData.labThreshold) || 80,
        },
        { onConflict: 'id' }
      );

      if (profErr) {
        console.warn('Profile upsert warning:', profErr.message);
      }

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
            let start = '09:00:00';
            let end = '10:00:00';
            const parts = slotTime.split('-').map((s) => s.trim());
            if (parts.length === 2 && parts[0].includes(':') && parts[1].includes(':')) {
              start = parts[0].length === 5 ? `${parts[0]}:00` : parts[0];
              end = parts[1].length === 5 ? `${parts[1]}:00` : parts[1];
            }

            finalSlots.push({
              user_id: uid,
              subject: item.name,
              faculty: item.prof || 'Faculty',
              day_of_week: dayMap[day] !== undefined ? dayMap[day] : 1,
              start_time: start,
              end_time: end,
              course_type: item.course_type || 'theory',
            });
          }
        });
      });

      if (finalSlots.length > 0) {
        await supabase.from('timetable').insert(finalSlots);
      }

      toast.success('Workspace created! Launching dashboard...');
      window.location.href = '/dashboard';
    } catch (err: any) {
      setErrorMsg(err.message || 'Error initializing profile');
      setLoading(false);
    }
  };

  // Interactive Hero Preview Calculations (56 attended / 68 held = 82.4%)
  const baseAtt = 56;
  const baseHeld = 68;
  const simHeld = baseHeld + heroSimSkips;
  const simPct = (baseAtt / simHeld) * 100;
  const simBunksLeft = Math.max(0, Math.floor((100 * baseAtt - 75 * simHeld) / 75));
  const simNeed =
    simPct < 75 ? Math.max(1, Math.ceil((75 * simHeld - 100 * baseAtt) / 25)) : 0;

  if (checkingSession) {
    return (
      <div className="min-h-screen bg-zinc-100 dark:bg-[#0c0c0e] flex items-center justify-center text-xs text-zinc-400">
        Loading ShouldISkip...
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-[#0c0c0e] text-zinc-900 dark:text-zinc-100 antialiased selection:bg-blue-500/20 flex flex-col">
      {/* Global Top Notification Banner from public.app_updates */}
      {latestUpdate && !bannerDismissed && (
        <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-blue-600 text-white px-4 py-2 text-xs relative z-40">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 min-w-0 flex-1 justify-center sm:justify-start">
              <span className="px-2 py-0.5 rounded-full bg-white/20 backdrop-blur-md text-[10px] font-bold uppercase tracking-wider shrink-0 flex items-center gap-1">
                <Megaphone className="w-2.5 h-2.5" /> What&apos;s New
              </span>
              <span className="font-mono text-[10px] font-bold px-1.5 py-0.5 rounded bg-black/20 shrink-0">
                {latestUpdate.version}
              </span>
              <span className="font-semibold truncate">{latestUpdate.title}</span>
              <span className="hidden md:inline text-white/80 truncate">
                — {latestUpdate.content}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setBannerDismissed(true)}
              aria-label="Dismiss announcement"
              className="p-1 rounded-full hover:bg-white/20 transition shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Sticky Navigation Bar */}
      <header className="sticky top-0 z-30 backdrop-blur-xl bg-white/75 dark:bg-zinc-900/75 border-b border-zinc-200 dark:border-zinc-800 px-4 md:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <a href="/" className="flex items-center gap-3 group">
            <div className="relative w-10 h-10 shrink-0">
              <Image
                src="/logo.png"
                alt="ShouldISkip Logo"
                fill
                sizes="40px"
                className="rounded-2xl object-contain drop-shadow-sm group-hover:scale-105 transition"
                priority
              />
            </div>
            <div>
              <span className="font-extrabold tracking-tight text-sm md:text-base block leading-none">
                ShouldISkip
              </span>
              <span className="text-[10px] text-zinc-500 dark:text-zinc-400 font-medium">
                Academic &amp; Attendance OS
              </span>
            </div>
          </a>

          <nav className="hidden md:flex items-center gap-6 text-xs font-semibold text-zinc-600 dark:text-zinc-300">
            <a href="#features" className="hover:text-blue-500 transition">
              Features
            </a>
            <a href="#ai-copilot" className="hover:text-blue-500 transition flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-blue-500" />
              <span>AI Copilot</span>
            </a>
            <button
              type="button"
              onClick={() => setSuggestionOpen(true)}
              className="hover:text-blue-500 transition"
            >
              Community Ideas
            </button>
          </nav>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-800/70 hover:opacity-80 transition"
              title="Toggle theme"
            >
              {darkMode ? (
                <Sun className="w-4 h-4 text-amber-400" />
              ) : (
                <Moon className="w-4 h-4 text-zinc-600" />
              )}
            </button>

            <button
              type="button"
              onClick={() => openAuthModal(false)}
              className="px-4 py-2 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white/80 dark:bg-zinc-800/80 hover:bg-zinc-200/70 dark:hover:bg-zinc-700 text-xs font-semibold transition"
            >
              Log In
            </button>

            <button
              type="button"
              onClick={() => openAuthModal(true)}
              className="px-4 py-2 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-sm transition flex items-center gap-1.5"
            >
              <span>Get Started Free</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1">
        {/* HERO SECTION (ABOVE THE FOLD) */}
        <section className="max-w-7xl mx-auto px-4 md:px-8 pt-10 pb-14 md:pt-16 md:pb-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-center">
            {/* Left Copy & CTAs */}
            <div className="lg:col-span-6 space-y-6">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 text-[11px] font-bold">
                <Sparkles className="w-3.5 h-3.5" />
                <span>Built for University Students · Offline-First + AI Copilot</span>
              </div>

              <h1 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight leading-[1.1]">
                Know your exact{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-500 to-emerald-500">
                  bunk margin
                </span>{' '}
                before you skip.
              </h1>

              <p className="text-sm md:text-base text-zinc-600 dark:text-zinc-400 leading-relaxed max-w-xl">
                ShouldISkip combines a dual-threshold Theory &amp; Lab attendance engine, live classmate Mass Bunk polls, shared subject notes pools, exam datesheets, and a dual-engine AI Study Copilot—all in one glassmorphic workspace.
              </p>

              <div className="flex items-center gap-3 flex-wrap pt-1">
                <button
                  type="button"
                  onClick={() => openAuthModal(true)}
                  className="px-6 py-3 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xs md:text-sm font-bold shadow-lg shadow-blue-600/20 transition flex items-center gap-2"
                >
                  <span>Create Free Workspace</span>
                  <ArrowRight className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => openAuthModal(false)}
                  className="px-6 py-3 rounded-full backdrop-blur-xl bg-white/80 dark:bg-zinc-900/70 border border-zinc-200 dark:border-zinc-800 hover:border-blue-500/40 text-xs md:text-sm font-bold transition"
                >
                  Sign In
                </button>
              </div>

              <div className="grid grid-cols-3 gap-3 pt-3 max-w-md">
                <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-3 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                  <div className="text-base font-extrabold text-emerald-500">Theory/Lab</div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Dual cutoffs + OD</div>
                </div>
                <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-3 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                  <div className="text-base font-extrabold text-blue-500">6-Char</div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Classroom sync</div>
                </div>
                <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-3 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                  <div className="text-base font-extrabold text-violet-500">Dual AI</div>
                  <div className="text-[11px] text-zinc-500 dark:text-zinc-400">Notes + Web tutor</div>
                </div>
              </div>
            </div>

            {/* Right Interactive Glassmorphic UI Preview Mockup */}
            <div className="lg:col-span-6">
              <div className="backdrop-blur-xl bg-white/80 dark:bg-zinc-900/70 p-5 sm:p-6 rounded-[28px] border border-zinc-200 dark:border-zinc-800 shadow-2xl space-y-4">
                {/* Preview Top Bar */}
                <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-blue-600/15 text-blue-500 flex items-center justify-center font-bold text-xs">
                      CS
                    </div>
                    <div>
                      <div className="text-xs font-bold">Live Workspace Preview</div>
                      <div className="text-[10px] text-zinc-400">Interactive What-If Margin</div>
                    </div>
                  </div>
                  <span
                    className={`text-[10px] font-bold uppercase px-2.5 py-1 rounded-full border ${
                      simPct >= 75
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/20'
                        : 'bg-rose-500/15 text-rose-500 border-rose-500/20'
                    }`}
                  >
                    {simPct >= 75 ? 'In Good Standing' : 'Recovery Alert'}
                  </span>
                </div>

                {/* Live Margin + Theory/Lab Split */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="bg-zinc-50 dark:bg-zinc-950/60 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-2">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                      <span>Projected Standing</span>
                      <span>Bar: 75%</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                      <span
                        className={`text-3xl font-extrabold tabular-nums ${
                          simPct >= 75 ? 'text-emerald-500' : 'text-rose-500'
                        }`}
                      >
                        {simPct.toFixed(1)}%
                      </span>
                      <span className="text-xs font-semibold text-zinc-500">
                        · {simPct >= 75 ? `${simBunksLeft} Safe Bunks` : `+${simNeed} Needed`}
                      </span>
                    </div>
                    <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          simPct >= 75 ? 'bg-emerald-500' : 'bg-rose-500'
                        }`}
                        style={{ width: `${Math.min(100, simPct)}%` }}
                      />
                    </div>
                  </div>

                  <div className="bg-zinc-50 dark:bg-zinc-950/60 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-2.5">
                    <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                      <span>Theory vs Lab Engine</span>
                      <FlaskConical className="w-3.5 h-3.5 text-blue-500" />
                    </div>
                    <div className="space-y-1.5 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1 font-medium">
                          <BookOpen className="w-3 h-3 text-sky-500" /> Theory (75%)
                        </span>
                        <span className="font-bold text-emerald-500">81.8% (45/55)</span>
                      </div>
                      <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                        <div className="h-full bg-sky-500 rounded-full w-[82%]" />
                      </div>
                      <div className="flex items-center justify-between pt-0.5">
                        <span className="flex items-center gap-1 font-medium">
                          <FlaskConical className="w-3 h-3 text-purple-500" /> Labs (80%)
                        </span>
                        <span className="font-bold text-emerald-500">84.6% (11/13)</span>
                      </div>
                      <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                        <div className="h-full bg-purple-500 rounded-full w-[85%]" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Interactive What-If Slider */}
                <div className="bg-zinc-50 dark:bg-zinc-950/60 p-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold flex items-center gap-1.5">
                      <Calculator className="w-3.5 h-3.5 text-blue-500" />
                      Try What-If Bunk Simulator:
                    </span>
                    <span className="font-mono font-bold text-blue-500">
                      Skip {heroSimSkips} next class{heroSimSkips === 1 ? '' : 'es'}
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    value={heroSimSkips}
                    onChange={(e) => setHeroSimSkips(Number(e.target.value))}
                    aria-label="Hero What-If Skip Simulator"
                    className="w-full accent-blue-600 cursor-pointer"
                  />
                </div>

                {/* AI Morning Briefing Preview Card */}
                <div className="bg-gradient-to-br from-blue-600/10 via-violet-600/10 to-emerald-500/10 p-4 rounded-2xl border border-blue-500/25 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400">
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>AI Morning Briefing</span>
                    </div>
                    <span className="text-[10px] font-mono text-zinc-400">Cached Daily Plan</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                    <div className="bg-white/80 dark:bg-zinc-900/80 p-2.5 rounded-xl border border-zinc-200/70 dark:border-zinc-800">
                      <span className="font-bold text-emerald-500 block">Safe Cushion</span>
                      <span className="text-zinc-600 dark:text-zinc-300">
                        {simBunksLeft > 0
                          ? `You can skip ${simBunksLeft} lecture${simBunksLeft === 1 ? '' : 's'} safely.`
                          : `Attend next ${simNeed} classes straight.`}
                      </span>
                    </div>
                    <div className="bg-white/80 dark:bg-zinc-900/80 p-2.5 rounded-xl border border-zinc-200/70 dark:border-zinc-800">
                      <span className="font-bold text-amber-500 block">Room Pulse</span>
                      <span className="text-zinc-600 dark:text-zinc-300">
                        12 classmates voted to skip 13:20 DSA.
                      </span>
                    </div>
                    <div className="bg-white/80 dark:bg-zinc-900/80 p-2.5 rounded-xl border border-zinc-200/70 dark:border-zinc-800">
                      <span className="font-bold text-rose-500 block">48h Deadline</span>
                      <span className="text-zinc-600 dark:text-zinc-300">
                        DBMS Lab File due tomorrow 17:00.
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* BENTO FEATURE SHOWCASE GRID */}
        <section id="features" className="max-w-7xl mx-auto px-4 md:px-8 py-12 space-y-8">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div className="space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-blue-500">
                Everything Your Semester Needs
              </span>
              <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">
                Six core engines. Zero spreadsheet chaos.
              </h2>
            </div>
            <p className="text-xs md:text-sm text-zinc-500 dark:text-zinc-400 max-w-md">
              Built with local-first offline resilience, name-only classmate privacy, and real-time mathematical projections.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {/* Pillar 1: Dual-Rule Attendance Engine */}
            <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-6 rounded-[24px] border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between gap-5 hover:border-blue-500/40 transition">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 flex items-center justify-center">
                  <ShieldCheck className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold tracking-tight">Dual-Rule Attendance Engine</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Separate Theory &amp; Lab cutoffs, On-Duty (OD) waivers, holiday exclusions, and an instant What-If bunk simulator.
                </p>
              </div>
              <div className="bg-zinc-50 dark:bg-zinc-950/60 p-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-2 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Operating Systems</span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 font-bold">
                    OD Waived
                  </span>
                </div>
                <div className="flex items-center justify-between text-zinc-400">
                  <span>Merged 2x Lab Block</span>
                  <span className="text-emerald-500 font-bold">86.4% · Safe</span>
                </div>
              </div>
            </div>

            {/* Pillar 2: Collaborative Classrooms */}
            <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-6 rounded-[24px] border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between gap-5 hover:border-blue-500/40 transition">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-500 flex items-center justify-center">
                  <Users className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold tracking-tight">Collaborative Classrooms</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Join via unique 6-char room codes, sync master timetables in one tap, and vote in live Mass Bunk polls.
                </p>
              </div>
              <div className="bg-zinc-50 dark:bg-zinc-950/60 p-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-2 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="font-mono font-bold text-blue-500 tracking-widest">CSE304</span>
                  <span className="text-zinc-400">42 Peers</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 font-semibold text-amber-500">
                    <Flame className="w-3.5 h-3.5" /> Mass Bunk Consensus
                  </span>
                  <span className="font-bold">78% Skipping</span>
                </div>
              </div>
            </div>

            {/* Pillar 3: Subject Notes Pool */}
            <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-6 rounded-[24px] border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between gap-5 hover:border-blue-500/40 transition">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-2xl bg-purple-500/10 border border-purple-500/20 text-purple-500 flex items-center justify-center">
                  <BookOpen className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold tracking-tight">Subject Notes Pool</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Auto-organized subject folders shared across classmates or locked safely inside your personal private vault.
                </p>
              </div>
              <div className="bg-zinc-50 dark:bg-zinc-950/60 p-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-2 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">Unit 3: Deadlocks &amp; Semaphores</span>
                  <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 font-bold">
                    Shared
                  </span>
                </div>
                <div className="flex items-center justify-between text-zinc-400">
                  <span>Personal Formula Sheet</span>
                  <span className="text-purple-500 font-bold">Private Vault</span>
                </div>
              </div>
            </div>

            {/* Pillar 4: Exam Datesheets & Syllabus */}
            <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-6 rounded-[24px] border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between gap-5 hover:border-blue-500/40 transition">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-rose-500 flex items-center justify-center">
                  <CalendarClock className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold tracking-tight">Exam Datesheets &amp; Syllabus</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Live exam countdowns, optional-class exam day badges, and interactive syllabus progress checklists.
                </p>
              </div>
              <div className="bg-zinc-50 dark:bg-zinc-950/60 p-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-2 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="font-bold">DSA Mid-Sem · Room B-204</span>
                  <span className="px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-500 font-bold">
                    In 3 days
                  </span>
                </div>
                <div className="flex items-center gap-2 text-zinc-500">
                  <CheckSquare className="w-3.5 h-3.5 text-emerald-500" />
                  <span>4/5 Syllabus Units Checked</span>
                </div>
              </div>
            </div>

            {/* Pillar 5: Assignments & P2P Help */}
            <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-6 rounded-[24px] border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between gap-5 hover:border-blue-500/40 transition">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center">
                  <ClipboardList className="w-5 h-5" />
                </div>
                <h3 className="text-base font-bold tracking-tight">Assignments &amp; P2P Help</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                  Live ticking deadline countdowns, 48-hour urgent alerts, and peer-to-peer solution &amp; hint threads.
                </p>
              </div>
              <div className="bg-zinc-50 dark:bg-zinc-950/60 p-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-2 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="font-bold">SQL Joins Lab File</span>
                  <span className="font-mono text-rose-500 font-bold">1d 06h left</span>
                </div>
                <div className="flex items-center gap-1.5 text-zinc-400">
                  <MessageSquare className="w-3.5 h-3.5 text-blue-500" />
                  <span>6 classmate hints &amp; references</span>
                </div>
              </div>
            </div>

            {/* Pillar 6: AI Study & Daily Copilot */}
            <div
              id="ai-copilot"
              className="backdrop-blur-xl bg-gradient-to-br from-blue-600/10 via-white/80 to-violet-600/10 dark:from-blue-600/15 dark:via-zinc-900/80 dark:to-violet-600/15 p-6 rounded-[24px] border border-blue-500/30 shadow-sm flex flex-col justify-between gap-5"
            >
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 text-white flex items-center justify-center shadow-sm">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-base font-bold tracking-tight">Private AI Student Copilot</h3>
                  <span className="px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] font-bold">
                    100% Personal
                  </span>
                </div>
                <p className="text-xs text-zinc-600 dark:text-zinc-300 leading-relaxed">
                  Privately snap datesheets into your personal ledger, generate hallucination-free study guides from your own notes, and research topics with cited web references—never shared in classrooms.
                </p>
              </div>
              <div className="bg-white/80 dark:bg-zinc-950/70 p-3.5 rounded-2xl border border-blue-500/20 space-y-2 text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 font-semibold text-blue-500">
                    <Camera className="w-3.5 h-3.5" /> Snap-to-Ledger
                  </span>
                  <span className="text-emerald-500 font-bold">Private Review</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 font-semibold text-violet-500">
                    <Globe className="w-3.5 h-3.5" /> Web Study Tutor
                  </span>
                  <span className="text-zinc-400">Cited Sources</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* BOTTOM CTA SECTION */}
        <section className="max-w-7xl mx-auto px-4 md:px-8 pb-16">
          <div className="backdrop-blur-xl bg-white/75 dark:bg-zinc-900/70 p-8 md:p-10 rounded-[28px] border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2 max-w-xl">
              <h2 className="text-xl md:text-2xl font-extrabold tracking-tight">
                Ready to take control of your semester?
              </h2>
              <p className="text-xs md:text-sm text-zinc-500 dark:text-zinc-400">
                Set up your timetable in under 60 seconds, sync with your classmates, and unlock AI-powered revision &amp; daily briefings.
              </p>
            </div>
            <div className="flex items-center gap-3 flex-wrap shrink-0">
              <button
                type="button"
                onClick={() => setSuggestionOpen(true)}
                className="px-5 py-2.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 text-xs font-semibold hover:border-blue-500/50 transition flex items-center gap-1.5"
              >
                <span>Explore Community Ideas</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => openAuthModal(true)}
                className="px-6 py-2.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold shadow-md transition flex items-center gap-1.5"
              >
                <span>Create Free Workspace</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-zinc-200 dark:border-zinc-800 py-6 px-4 text-center text-xs text-zinc-400 space-y-2">
        <div className="flex items-center justify-center gap-4 text-[11px] font-medium text-zinc-500">
          <a href="/privacy" className="hover:underline">
            Privacy Policy
          </a>
          <span>·</span>
          <a href="/terms" className="hover:underline">
            Terms of Service
          </a>
          <span>·</span>
          <button
            type="button"
            onClick={() => setSuggestionOpen(true)}
            className="hover:underline"
          >
            Ideas &amp; Feedback
          </button>
        </div>
        <p>ShouldISkip &copy; {new Date().getFullYear()} — Smart Attendance &amp; Academic OS</p>
      </footer>

      {/* Persistent Edge Side Banner & Reddit-Style Suggestion Box */}
      <SuggestionBoxDrawer
        externalOpen={suggestionOpen}
        onExternalOpenChange={setSuggestionOpen}
        onRequireAuth={() => openAuthModal(false)}
      />

      {/* AUTH & 3-STEP ONBOARDING MODAL */}
      {authModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setAuthModalOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className={`bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800 rounded-[28px] w-full p-6 md:p-7 shadow-2xl my-8 transition-all ${
              viewState === 'canvas' ? 'max-w-5xl' : 'max-w-lg'
            }`}
          >
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3 mb-5">
              <div className="flex items-center gap-2.5">
                <div className="relative w-7 h-7">
                  <Image src="/logo.png" alt="ShouldISkip" fill sizes="28px" className="rounded-lg object-contain" />
                </div>
                <span className="text-xs font-bold tracking-tight">
                  {viewState === 'auth'
                    ? isSignUp
                      ? 'Step 1 of 3 · Create Account'
                      : 'Sign In to ShouldISkip'
                    : viewState === 'academic'
                    ? 'Step 2 of 3 · Academic Profile'
                    : 'Step 3 of 3 · Timetable Matrix'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAuthModalOpen(false)}
                className="w-7 h-7 rounded-full bg-zinc-200/70 dark:bg-zinc-800/70 text-xs flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {errorMsg && (
              <div className="mb-4 p-3 rounded-xl border border-rose-500/20 bg-rose-500/10 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-rose-500 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {/* STEP 1: AUTH */}
            {viewState === 'auth' && (
              <div>
                <div className="mb-5">
                  <h2 className="text-lg font-bold tracking-tight">
                    {isSignUp ? 'Create your workspace' : 'Welcome back'}
                  </h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {isSignUp
                      ? 'Build your schedule and set your Theory & Lab attendance bars'
                      : 'Enter your credentials to open your dashboard'}
                  </p>
                </div>

                <form onSubmit={handleAuthSubmit} className="space-y-3.5">
                  {isSignUp && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs font-semibold text-zinc-400 block mb-1">
                          Full Name
                        </label>
                        <div className="relative">
                          <User className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
                          <input
                            type="text"
                            required
                            placeholder="Alex Sharma"
                            value={authData.fullName}
                            onChange={(e) =>
                              setAuthData({ ...authData, fullName: e.target.value })
                            }
                            className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl py-2 pl-9 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-semibold text-zinc-400 block mb-1">
                          Username / Roll No
                        </label>
                        <input
                          type="text"
                          required
                          placeholder="alex_24"
                          value={authData.username}
                          onChange={(e) =>
                            setAuthData({ ...authData, username: e.target.value })
                          }
                          className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl py-2 px-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                        />
                      </div>
                    </div>
                  )}

                  <div>
                    <label className="text-xs font-semibold text-zinc-400 block mb-1">Email</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
                      <input
                        type="email"
                        required
                        placeholder="student@university.edu"
                        value={authData.email}
                        onChange={(e) => setAuthData({ ...authData, email: e.target.value })}
                        className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl py-2 pl-9 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-zinc-400 block mb-1">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
                      <input
                        type="password"
                        required
                        minLength={6}
                        placeholder="••••••••"
                        value={authData.password}
                        onChange={(e) => setAuthData({ ...authData, password: e.target.value })}
                        className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl py-2 pl-9 pr-3 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full mt-2 py-2.5 px-4 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold text-xs transition flex items-center justify-center gap-2 shadow-sm"
                  >
                    <span>
                      {loading
                        ? 'Processing...'
                        : isSignUp
                        ? 'Continue to Academic Profile'
                        : 'Sign In'}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </form>

                <div className="mt-5 pt-4 border-t border-zinc-200 dark:border-zinc-800 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setIsSignUp(!isSignUp);
                      setErrorMsg('');
                    }}
                    className="text-xs text-zinc-500 hover:text-blue-500 transition underline underline-offset-4"
                  >
                    {isSignUp
                      ? 'Already registered? Sign in'
                      : "Don't have an account? Create free workspace"}
                  </button>
                </div>
              </div>
            )}

            {/* STEP 2: ACADEMIC PROFILE */}
            {viewState === 'academic' && (
              <div className="space-y-4">
                <div>
                  <h2 className="text-lg font-bold tracking-tight">Academic Profile</h2>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Configure institution details and separate Theory / Lab attendance thresholds.
                  </p>
                </div>

                <div>
                  <label className="text-xs font-semibold text-zinc-400 block mb-1">
                    College / University
                  </label>
                  <div className="relative">
                    <School className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
                    <input
                      type="text"
                      placeholder="e.g. DTU / NSUT / IIT"
                      value={authData.collegeName}
                      onChange={(e) =>
                        setAuthData({ ...authData, collegeName: e.target.value })
                      }
                      className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl py-2 pl-9 pr-3 text-xs focus:outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-zinc-400 block mb-1">
                      Branch / Major
                    </label>
                    <div className="relative">
                      <GraduationCap className="absolute left-3 top-2.5 w-4 h-4 text-zinc-400" />
                      <input
                        type="text"
                        placeholder="e.g. CSE / AI & DS"
                        value={authData.stream}
                        onChange={(e) => setAuthData({ ...authData, stream: e.target.value })}
                        className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl py-2 pl-9 pr-3 text-xs focus:outline-none"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-zinc-400 block mb-1">
                      Semester
                    </label>
                    <select
                      value={authData.semester}
                      onChange={(e) => setAuthData({ ...authData, semester: e.target.value })}
                      className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl py-2 px-3 text-xs focus:outline-none"
                    >
                      {[1, 2, 3, 4, 5, 6, 7, 8].map((s) => (
                        <option key={s} value={s}>
                          Semester {s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs font-semibold text-zinc-400 block mb-1">
                      Theory Target (%)
                    </label>
                    <input
                      type="number"
                      min="40"
                      max="100"
                      value={authData.targetThreshold}
                      onChange={(e) =>
                        setAuthData({ ...authData, targetThreshold: e.target.value })
                      }
                      className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl py-2 px-3 text-xs focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-semibold text-zinc-400 block mb-1">
                      Lab Target (%)
                    </label>
                    <input
                      type="number"
                      min="40"
                      max="100"
                      value={authData.labThreshold}
                      onChange={(e) =>
                        setAuthData({ ...authData, labThreshold: e.target.value })
                      }
                      className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl py-2 px-3 text-xs focus:outline-none"
                    />
                  </div>
                </div>

                <div className="pt-3 flex justify-between items-center">
                  <button
                    type="button"
                    onClick={() => setViewState('auth')}
                    className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white"
                  >
                    ← Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewState('canvas')}
                    className="py-2 px-5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
                  >
                    <span>Open Timetable Matrix</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* STEP 3: INTERACTIVE TIMETABLE MATRIX */}
            {viewState === 'canvas' && (
              <div className="space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold tracking-tight">Timetable Builder</h2>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">
                      Drag blocks into cells, or click a block then tap any cell to place it.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setViewState('academic')}
                      className="px-3 py-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-semibold text-zinc-500"
                    >
                      Back
                    </button>
                    <button
                      type="button"
                      onClick={handleFinalLaunch}
                      disabled={loading}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span>{loading ? 'Creating Workspace...' : 'Launch Dashboard'}</span>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 max-h-[60vh] overflow-y-auto pr-1">
                  {/* Palette */}
                  <div className="lg:col-span-4 space-y-3 bg-zinc-50 dark:bg-zinc-900/60 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-blue-500" />
                      <h3 className="text-xs font-bold uppercase tracking-wider">Subject Palette</h3>
                    </div>

                    <form onSubmit={handleCreateBlock} className="space-y-2">
                      <input
                        type="text"
                        placeholder="Course name (e.g. AI Lab)"
                        value={newSubName}
                        onChange={(e) => setNewSubName(e.target.value)}
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs focus:outline-none"
                      />
                      <input
                        type="text"
                        placeholder="Professor / Room"
                        value={newProfName}
                        onChange={(e) => setNewProfName(e.target.value)}
                        className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs focus:outline-none"
                      />
                      <div className="flex items-center gap-3 text-xs">
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            checked={newCourseType === 'theory'}
                            onChange={() => setNewCourseType('theory')}
                          />
                          <span>Theory</span>
                        </label>
                        <label className="flex items-center gap-1 cursor-pointer">
                          <input
                            type="radio"
                            checked={newCourseType === 'lab'}
                            onChange={() => setNewCourseType('lab')}
                          />
                          <span>Lab</span>
                        </label>
                      </div>
                      <button
                        type="submit"
                        className="w-full py-1.5 rounded-xl bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-xs font-semibold flex items-center justify-center gap-1 transition"
                      >
                        <Plus className="w-3.5 h-3.5" /> Add Block
                      </button>
                    </form>

                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                      <p className="text-[10px] text-zinc-400 flex items-center gap-1">
                        <HelpCircle className="w-3 h-3" /> Drag or tap block to select:
                      </p>
                      {subjectBlocks.map((block) => (
                        <div
                          key={block.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, block)}
                          onClick={() =>
                            setSelectedTapBlock((prev) => (prev?.id === block.id ? null : block))
                          }
                          className={`p-2 rounded-xl border flex items-center justify-between cursor-grab active:cursor-grabbing select-none ${
                            block.tagColor
                          } ${
                            selectedTapBlock?.id === block.id
                              ? 'ring-2 ring-blue-500'
                              : ''
                          }`}
                        >
                          <div className="flex items-center gap-2 overflow-hidden">
                            <GripVertical className="w-3.5 h-3.5 opacity-40 shrink-0" />
                            <div className="truncate">
                              <p className="text-xs font-semibold truncate">
                                {block.name} ({block.course_type === 'lab' ? 'Lab' : 'Theory'})
                              </p>
                              <p className="text-[10px] opacity-75 truncate">{block.prof}</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSubjectBlocks(subjectBlocks.filter((b) => b.id !== block.id));
                            }}
                            className="text-zinc-400 hover:text-rose-500 p-1"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Grid */}
                  <div className="lg:col-span-8 bg-zinc-50 dark:bg-zinc-900/60 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-3">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-2">
                        <LayoutGrid className="w-4 h-4 text-blue-500" />
                        <span className="text-xs font-bold uppercase tracking-wider">
                          Weekly Grid
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setColSlots([...colSlots, `Slot ${colSlots.length + 1}`])}
                          className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[11px] font-medium"
                        >
                          + Slot
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
                            setRowDays([
                              ...rowDays,
                              days[rowDays.length] || `Day ${rowDays.length + 1}`,
                            ]);
                          }}
                          className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 text-[11px] font-medium"
                        >
                          + Day
                        </button>
                      </div>
                    </div>

                    <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-xl">
                      <table className="w-full border-collapse text-left">
                        <thead>
                          <tr className="bg-zinc-100 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800">
                            <th className="p-2 text-[11px] font-semibold text-zinc-400 border-r border-zinc-200 dark:border-zinc-800 w-20">
                              Day
                            </th>
                            {colSlots.map((slot, cIdx) => (
                              <th
                                key={cIdx}
                                className="p-2 text-xs border-r border-zinc-200 dark:border-zinc-800 font-mono min-w-[125px]"
                              >
                                <input
                                  type="text"
                                  value={slot}
                                  onChange={(e) => {
                                    const updated = [...colSlots];
                                    updated[cIdx] = e.target.value;
                                    setColSlots(updated);
                                  }}
                                  className="bg-transparent text-xs font-mono w-full focus:outline-none"
                                />
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rowDays.map((day, rIdx) => (
                            <tr
                              key={rIdx}
                              className="border-b border-zinc-200 dark:border-zinc-800"
                            >
                              <td className="p-2 border-r border-zinc-200 dark:border-zinc-800 font-bold text-xs">
                                {day}
                              </td>
                              {colSlots.map((_, cIdx) => {
                                const current = matrixData[`${rIdx}-${cIdx}`];
                                return (
                                  <td
                                    key={cIdx}
                                    onDragOver={handleDragOver}
                                    onDrop={(e) => handleDrop(rIdx, cIdx, e)}
                                    onClick={() => {
                                      if (selectedTapBlock) {
                                        setMatrixData((prev) => ({
                                          ...prev,
                                          [`${rIdx}-${cIdx}`]: selectedTapBlock,
                                        }));
                                      }
                                    }}
                                    className="p-1.5 border-r border-zinc-200 dark:border-zinc-800 h-16 cursor-pointer"
                                  >
                                    {current ? (
                                      <div
                                        className={`h-full w-full p-1.5 rounded-lg border flex flex-col justify-between text-[11px] ${current.tagColor}`}
                                      >
                                        <div className="flex items-start justify-between gap-1">
                                          <span className="font-semibold truncate">
                                            {current.name}
                                          </span>
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              clearCell(rIdx, cIdx);
                                            }}
                                            className="text-zinc-400 hover:text-rose-500"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        </div>
                                        <span className="text-[10px] opacity-75 truncate">
                                          {current.prof}
                                        </span>
                                      </div>
                                    ) : (
                                      <div className="h-full w-full rounded-lg border border-dashed border-zinc-300/60 dark:border-zinc-800 flex items-center justify-center text-[10px] text-zinc-400">
                                        {selectedTapBlock ? 'Tap to Place' : 'Drop'}
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
          </div>
        </div>
      )}
    </div>
  );
}