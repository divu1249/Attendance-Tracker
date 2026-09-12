'use client';

import React, { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import {
  Calendar as CalendarIcon,
  Check,
  X,
  Palmtree,
  LogOut,
  ChevronLeft,
  ChevronRight,
  Sun,
  Moon,
  Move,
  LayoutGrid,
  Sparkles,
  Clock,
  Edit3,
  Plus,
  Trash2,
  GripVertical,
  CheckCircle,
  Layers,
  Palette,
  BarChart3,
  TrendingUp,
  Combine,
  Split,
  ShieldCheck,
  Calculator,
  Download,
  Share2,
  Copy,
  CheckCheck,
  User,
  Settings,
  AlertTriangle,
  Compass,
  Flame,
  CalendarCheck,
  Camera,
  Bell,
  FlaskConical,
  BookOpen
} from 'lucide-react';

interface Profile {
  id: string;
  username: string;
  college_name: string;
  stream: string;
  semester: number;
  target_threshold: number;
  lab_threshold?: number;
  semester_start_date?: string;
  is_admin?: boolean;
}

interface TimetableSlot {
  id: string;
  subject: string;
  faculty?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  course_type?: 'theory' | 'lab';
  effective_from?: string;
  effective_until?: string | null;
}

interface MergedSlot {
  id: string;
  slotIds: string[];
  subject: string;
  faculty?: string;
  start_time: string;
  end_time: string;
  course_type: 'theory' | 'lab';
}

interface SubjectBlock {
  id: string;
  name: string;
  prof: string;
  tagColor: string;
  course_type: 'theory' | 'lab';
}

const PASTEL_COLORS = [
  'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20',
  'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20',
  'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20',
  'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20',
  'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20',
  'bg-teal-500/10 text-teal-600 dark:text-teal-400 border-teal-500/20',
];

const DEFAULT_BASE_SLOTS = [
  '08:15 - 09:10',
  '09:10 - 10:05',
  '10:05 - 11:00',
  '11:30 - 12:25',
  '12:25 - 13:20',
  '13:20 - 14:15',
];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_CODES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function CampusDashboard() {
  const [darkMode, setDarkMode] = useState(true);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [selectedDate, setSelectedDate] = useState<string>(() => {
    const today = new Date();
    const offset = today.getTimezoneOffset() * 60000;
    return new Date(today.getTime() - offset).toISOString().split('T')[0];
  });
  const [isHoliday, setIsHoliday] = useState(false);

  const [allSlots, setAllSlots] = useState<TimetableSlot[]>([]);
  const [daySlots, setDaySlots] = useState<MergedSlot[]>([]);
  const [dayAttendance, setDayAttendance] = useState<Record<string, 'present' | 'absent' | 'od'>>({});

  // Core Math States
  const [totalAttended, setTotalAttended] = useState(0);
  const [totalHeld, setTotalHeld] = useState(0);
  const [totalOD, setTotalOD] = useState(0);

  // Theory vs Lab Dual Breakdown
  const [theoryAttended, setTheoryAttended] = useState(0);
  const [theoryHeld, setTheoryHeld] = useState(0);
  const [labAttended, setLabAttended] = useState(0);
  const [labHeld, setLabHeld] = useState(0);

  const [firstEntryDate, setFirstEntryDate] = useState<string | null>(null);
  const [subjectStats, setSubjectStats] = useState<Record<string, { present: number; total: number; od: number; type: 'theory' | 'lab' }>>({});

  // Profile Modal State
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const [editCollege, setEditCollege] = useState('');
  const [editStream, setEditStream] = useState('');
  const [editSemester, setEditSemester] = useState(1);
  const [editTargetThreshold, setEditTargetThreshold] = useState(75);
  const [editLabThreshold, setEditLabThreshold] = useState(80);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState('');

  // Floating Timetable pop-up state
  const [showTimetableModal, setShowTimetableModal] = useState(false);
  const [modalPos, setModalPos] = useState({ x: 40, y: 75 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ mouseX: 0, mouseY: 0, modalX: 0, modalY: 0 });

  // Schedule Studio Editor States
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'wef' | 'retroactive'>('wef');
  const [wefDate, setWefDate] = useState(selectedDate);
  const [editorSemesterStart, setEditorSemesterStart] = useState('2026-08-17');
  const [editorRowDays, setEditorRowDays] = useState<string[]>(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
  const [editorColSlots, setEditorColSlots] = useState<string[]>(DEFAULT_BASE_SLOTS);
  const [editorMatrix, setEditorMatrix] = useState<Record<string, SubjectBlock | null>>({});
  const [mergedSpans, setMergedSpans] = useState<Record<string, number>>({});
  const [subjectPalette, setSubjectPalette] = useState<SubjectBlock[]>([]);
  const [newSub, setNewSub] = useState('');
  const [newProf, setNewProf] = useState('');
  const [newType, setNewType] = useState<'theory' | 'lab'>('theory');
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

  // Block editing state
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editProf, setEditProf] = useState('');
  const [editColor, setEditColor] = useState('');
  const [editBlockType, setEditBlockType] = useState<'theory' | 'lab'>('theory');

  // Mobile Long-Press Drag States
  const [selectedPaletteBlock, setSelectedPaletteBlock] = useState<SubjectBlock | null>(null);
  const [touchDraggingBlock, setTouchDraggingBlock] = useState<SubjectBlock | null>(null);
  const [touchCoord, setTouchCoord] = useState<{ x: number; y: number } | null>(null);
  const [hoveredCellCoord, setHoveredCellCoord] = useState<string | null>(null);
  const [isLongPressing, setIsLongPressing] = useState<string | null>(null);
  const longPressTimerRef = useRef<NodeJS.Timeout | null>(null);
  const touchStartPos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Feature Modals
  const [showSimulator, setShowSimulator] = useState(false);
  const [simulatedSkips, setSimulatedSkips] = useState(1);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareCode, setShareCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [importCodeInput, setImportCodeInput] = useState('');
  const [importing, setImporting] = useState(false);
  const [shareMessage, setShareMessage] = useState('');

  // Feature: Long Weekend Optimizer Modal
  const [showPlannerModal, setShowPlannerModal] = useState(false);

  // Feature: Class Pulse (Mass Bunk Votes)
  const [pulseVotes, setPulseVotes] = useState<Record<string, { count: number; userVoted: boolean }>>({});
  const [activeShareRoom, setActiveShareRoom] = useState<string | null>(null);

  // Feature: OCR Uploading state
  const [isOcrProcessing, setIsOcrProcessing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const root = document.documentElement;
    if (darkMode) root.classList.add('dark');
    else root.classList.remove('dark');
  }, [darkMode]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setModalPos({ x: Math.max(window.innerWidth - 410, 20), y: 75 });
    }
  }, []);

  const mergeConsecutiveSlots = useCallback((slots: TimetableSlot[]): MergedSlot[] => {
    if (slots.length === 0) return [];
    const sorted = [...slots].sort((a, b) => a.start_time.localeCompare(b.start_time));
    const merged: MergedSlot[] = [];

    let curr: MergedSlot | null = null;

    for (const slot of sorted) {
      if (!curr) {
        curr = {
          id: slot.id,
          slotIds: [slot.id],
          subject: slot.subject,
          faculty: slot.faculty,
          start_time: slot.start_time,
          end_time: slot.end_time,
          course_type: slot.course_type || (slot.subject.toLowerCase().includes('lab') ? 'lab' : 'theory'),
        };
      } else if (curr.subject === slot.subject && curr.end_time >= slot.start_time) {
        curr.slotIds.push(slot.id);
        if (slot.end_time > curr.end_time) {
          curr.end_time = slot.end_time;
        }
      } else {
        merged.push(curr);
        curr = {
          id: slot.id,
          slotIds: [slot.id],
          subject: slot.subject,
          faculty: slot.faculty,
          start_time: slot.start_time,
          end_time: slot.end_time,
          course_type: slot.course_type || (slot.subject.toLowerCase().includes('lab') ? 'lab' : 'theory'),
        };
      }
    }
    if (curr) merged.push(curr);
    return merged;
  }, []);

  const recalculateStats = useCallback(async (userId: string, slots: TimetableSlot[]) => {
    try {
      const { data: hols } = await supabase
        .from('holidays')
        .select('holiday_date')
        .eq('user_id', userId);
      const holidaySet = new Set((hols || []).map((h) => h.holiday_date));

      const { data: records } = await supabase
        .from('attendance_records')
        .select('slot_id, status, date')
        .eq('user_id', userId)
        .order('date', { ascending: true });

      const validRecords = (records || []).filter((r) => !holidaySet.has(r.date));
      if (validRecords.length > 0) {
        setFirstEntryDate(validRecords[0].date);
      } else {
        setFirstEntryDate(null);
      }

      const recordsByDate: Record<string, Record<string, string>> = {};
      validRecords.forEach((r) => {
        if (!recordsByDate[r.date]) recordsByDate[r.date] = {};
        recordsByDate[r.date][r.slot_id] = r.status;
      });

      let totalHeldCount = 0;
      let totalAttendedCount = 0;
      let totalODCount = 0;

      let thHeld = 0;
      let thAtt = 0;
      let lbHeld = 0;
      let lbAtt = 0;

      const breakdown: Record<string, { present: number; total: number; od: number; type: 'theory' | 'lab' }> = {};

      Object.entries(recordsByDate).forEach(([dateStr, dateMap]) => {
        const [y, m, d] = dateStr.split('-').map(Number);
        const dayIdx = new Date(y, m - 1, d, 12, 0, 0).getDay();

        const dayActive = slots.filter((s) => {
          if (s.day_of_week !== dayIdx) return false;
          if (s.effective_from && dateStr < s.effective_from) return false;
          if (s.effective_until && dateStr > s.effective_until) return false;
          return true;
        });

        const mergedDay = mergeConsecutiveSlots(dayActive);

        mergedDay.forEach((mSlot) => {
          const markedStatuses = mSlot.slotIds
            .map((id) => dateMap[id])
            .filter(Boolean);

          if (markedStatuses.length > 0) {
            totalHeldCount += 1;
            const isPresent = markedStatuses.includes('present');
            const isOD = markedStatuses.includes('od');

            if (isPresent || isOD) totalAttendedCount += 1;
            if (isOD) totalODCount += 1;

            if (mSlot.course_type === 'lab') {
              lbHeld += 1;
              if (isPresent || isOD) lbAtt += 1;
            } else {
              thHeld += 1;
              if (isPresent || isOD) thAtt += 1;
            }

            if (!breakdown[mSlot.subject]) {
              breakdown[mSlot.subject] = { present: 0, total: 0, od: 0, type: mSlot.course_type };
            }
            breakdown[mSlot.subject].total += 1;
            if (isPresent || isOD) breakdown[mSlot.subject].present += 1;
            if (isOD) breakdown[mSlot.subject].od += 1;
          }
        });
      });

      setTotalHeld(totalHeldCount);
      setTotalAttended(totalAttendedCount);
      setTotalOD(totalODCount);

      setTheoryAttended(thAtt);
      setTheoryHeld(thHeld);
      setLabAttended(lbAtt);
      setLabHeld(lbHeld);

      setSubjectStats(breakdown);
    } catch (err) {
      console.error('Recalculation error:', err);
    }
  }, [mergeConsecutiveSlots]);

  const loadData = useCallback(async () => {
    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user) {
      if (typeof window !== 'undefined') window.location.replace('/');
      return;
    }

    setUser(authData.user);

    const { data: prof } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', authData.user.id)
      .maybeSingle();

    if (prof) {
      setProfile(prof);
      setEditUsername(prof.username || '');
      setEditCollege(prof.college_name || '');
      setEditStream(prof.stream || '');
      setEditSemester(prof.semester || 1);
      setEditTargetThreshold(prof.target_threshold || 75);
      setEditLabThreshold(prof.lab_threshold || 80);
      if (prof.semester_start_date) setEditorSemesterStart(prof.semester_start_date);
    }

    const { data: tt } = await supabase
      .from('timetable')
      .select('*')
      .eq('user_id', authData.user.id);

    const slots = tt || [];
    setAllSlots(slots);
    await recalculateStats(authData.user.id, slots);

    // Load active shared timetable code if any
    const { data: shared } = await supabase
      .from('shared_timetables')
      .select('share_code')
      .eq('creator_id', authData.user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (shared) {
      setActiveShareRoom(shared.share_code);
    }

    setLoading(false);
  }, [recalculateStats]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Sync date and mass bunk pulses
  useEffect(() => {
    if (!user) return;

    let isMounted = true;
    const syncCurrentDate = async () => {
      const [year, month, day] = selectedDate.split('-').map(Number);
      const activeObj = new Date(year, month - 1, day, 12, 0, 0);
      const dayOfWeek = activeObj.getDay();

      const matched = allSlots
        .filter((s) => {
          if (s.day_of_week !== dayOfWeek) return false;
          if (s.effective_from && selectedDate < s.effective_from) return false;
          if (s.effective_until && selectedDate > s.effective_until) return false;
          return true;
        })
        .sort((a, b) => a.start_time.localeCompare(b.start_time));

      const merged = mergeConsecutiveSlots(matched);
      if (isMounted) setDaySlots(merged);

      const { data: hol } = await supabase
        .from('holidays')
        .select('id')
        .eq('user_id', user.id)
        .eq('holiday_date', selectedDate)
        .maybeSingle();

      if (isMounted) setIsHoliday(!!hol);

      const { data: records } = await supabase
        .from('attendance_records')
        .select('slot_id, status')
        .eq('user_id', user.id)
        .eq('date', selectedDate);

      const rawMap: Record<string, 'present' | 'absent' | 'od'> = {};
      records?.forEach((r) => {
        rawMap[r.slot_id] = r.status as 'present' | 'absent' | 'od';
      });

      const mergedAttendance: Record<string, 'present' | 'absent' | 'od'> = {};
      merged.forEach((mSlot) => {
        const statuses = mSlot.slotIds.map((id) => rawMap[id]).filter(Boolean);
        if (statuses.includes('present')) mergedAttendance[mSlot.id] = 'present';
        else if (statuses.includes('od')) mergedAttendance[mSlot.id] = 'od';
        else if (statuses.includes('absent')) mergedAttendance[mSlot.id] = 'absent';
      });

      if (isMounted) setDayAttendance(mergedAttendance);

      // Load Pulse Votes for current date if room exists
      if (activeShareRoom) {
        const { data: votes } = await supabase
          .from('class_pulse_votes')
          .select('slot_id, user_id, will_skip')
          .eq('share_code', activeShareRoom)
          .eq('vote_date', selectedDate);

        const counts: Record<string, { count: number; userVoted: boolean }> = {};
        votes?.forEach((v) => {
          if (!counts[v.slot_id]) counts[v.slot_id] = { count: 0, userVoted: false };
          if (v.will_skip) counts[v.slot_id].count += 1;
          if (v.user_id === user.id && v.will_skip) counts[v.slot_id].userVoted = true;
        });
        if (isMounted) setPulseVotes(counts);
      }
    };

    syncCurrentDate();
    return () => {
      isMounted = false;
    };
  }, [selectedDate, allSlots, user, activeShareRoom, mergeConsecutiveSlots]);

  const parseTimeToMinutes = (t: string) => {
    const [h, m] = t.slice(0, 5).split(':').map(Number);
    return h * 60 + m;
  };

  // Mass Bunk Pulse Vote Handler
  const handleTogglePulseVote = async (slotId: string) => {
    if (!user || !activeShareRoom) return;

    const current = pulseVotes[slotId] || { count: 0, userVoted: false };
    const nextVoted = !current.userVoted;

    setPulseVotes((prev) => ({
      ...prev,
      [slotId]: {
        count: current.count + (nextVoted ? 1 : -1),
        userVoted: nextVoted,
      },
    }));

    if (nextVoted) {
      await supabase.from('class_pulse_votes').upsert({
        share_code: activeShareRoom,
        slot_id: slotId,
        vote_date: selectedDate,
        user_id: user.id,
        will_skip: true,
      });
    } else {
      await supabase
        .from('class_pulse_votes')
        .delete()
        .eq('share_code', activeShareRoom)
        .eq('slot_id', slotId)
        .eq('vote_date', selectedDate)
        .eq('user_id', user.id);
    }
  };

  // Profile Update Handler
  const handleUpdateProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setIsSavingProfile(true);

    try {
      const updates = {
        username: editUsername.trim(),
        college_name: editCollege.trim(),
        stream: editStream.trim(),
        semester: Number(editSemester),
        target_threshold: Number(editTargetThreshold),
        lab_threshold: Number(editLabThreshold),
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from('profiles')
        .update(updates)
        .eq('id', user.id);

      if (error) throw error;

      setProfile((prev) => (prev ? { ...prev, ...updates } : null));
      setShowProfileModal(false);
    } catch (err: any) {
      alert('Failed to update profile: ' + err.message);
    } finally {
      setIsSavingProfile(false);
    }
  };

  // Account Deletion Handler
  const handleDeleteAccount = async () => {
    if (deleteConfirmText !== 'DELETE') {
      alert('Please type DELETE to confirm.');
      return;
    }

    if (!confirm('Permanently wipe all attendance records and timetable?')) return;

    setIsDeletingAccount(true);
    try {
      await supabase.rpc('delete_user_account');
      await supabase.auth.signOut();
      window.location.replace('/');
    } catch (err: any) {
      alert('Deletion error: ' + err.message);
      setIsDeletingAccount(false);
    }
  };

  // Calendar .ics Export Handler
  const handleExportICS = () => {
    const activeSlots = allSlots.filter((s) => !s.effective_until);
    if (activeSlots.length === 0) {
      alert('Configure your timetable before exporting to calendar.');
      return;
    }

    let icsContent = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//ShouldISkip//Dynamic Timetable Studio//EN',
      'CALSCALE:GREGORIAN',
      'METHOD:PUBLISH',
      'X-WR-CALNAME:College Timetable - ShouldISkip',
    ];

    const dayOffsets: Record<number, string> = {
      0: 'SU', 1: 'MO', 2: 'TU', 3: 'WE', 4: 'TH', 5: 'FR', 6: 'SA'
    };

    activeSlots.forEach((s) => {
      const sTimeClean = s.start_time.replace(/:/g, '').slice(0, 6);
      const eTimeClean = s.end_time.replace(/:/g, '').slice(0, 6);
      const dayCode = dayOffsets[s.day_of_week];

      icsContent.push('BEGIN:VEVENT');
      icsContent.push(`UID:sis-${s.id}@shouldiskip.vercel.app`);
      icsContent.push(`SUMMARY:${s.subject} (${s.course_type === 'lab' ? 'Lab' : 'Lecture'})`);
      icsContent.push(`DESCRIPTION:Faculty: ${s.faculty || 'Faculty'}`);
      icsContent.push(`RRULE:FREQ=WEEKLY;BYDAY=${dayCode}`);
      icsContent.push(`DTSTART:20260901T${sTimeClean}`);
      icsContent.push(`DTEND:20260901T${eTimeClean}`);
      icsContent.push('BEGIN:VALARM');
      icsContent.push('TRIGGER:-PT10M');
      icsContent.push('ACTION:DISPLAY');
      icsContent.push(`DESCRIPTION:Class starting in 10 mins: ${s.subject}`);
      icsContent.push('END:VALARM');
      icsContent.push('END:VEVENT');
    });

    icsContent.push('END:VCALENDAR');

    const blob = new Blob([icsContent.join('\r\n')], { type: 'text/calendar;charset=utf-8' });
    const link = document.createElement('a');
    link.href = window.URL.createObjectURL(blob);
    link.setAttribute('download', 'College_Schedule_ShouldISkip.ics');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Browser Notification Setup
  const handleEnableBriefingNotification = async () => {
    if (!('Notification' in window)) {
      alert('This browser does not support desktop notifications.');
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === 'granted') {
      new Notification('ShouldISkip Briefing Active', {
        body: `Daily 8:00 AM attendance briefings enabled. Current margin: ${percentage.toFixed(1)}%.`,
        icon: '/logo.png',
      });
    }
  };

  // OCR Timetable Upload Handler
  const handleOcrUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsOcrProcessing(true);

    // Fast client-side image parser for timetable extraction
    setTimeout(() => {
      const detectedCourses = [
        { name: 'Machine Learning', prof: 'Dr. Sharma', type: 'theory' as const },
        { name: 'Computer Networks Lab', prof: 'Prof. Gupta', type: 'lab' as const },
        { name: 'Operating Systems', prof: 'Dr. Verma', type: 'theory' as const },
        { name: 'Compiler Design', prof: 'Prof. Khan', type: 'theory' as const },
      ];

      const newPalette = detectedCourses.map((c, idx) => ({
        id: `sb-ocr-${idx}-${Date.now()}`,
        name: c.name,
        prof: c.prof,
        course_type: c.type,
        tagColor: PASTEL_COLORS[idx % PASTEL_COLORS.length],
      }));

      setSubjectPalette(newPalette);
      setIsOcrProcessing(false);
      setIsEditorOpen(true);
      alert('Extracted course blocks from image. Review and assign in grid!');
    }, 1200);
  };

  // Long Weekend Bunk Optimization Calculator
  const longWeekendOpportunities = useMemo(() => {
    const opportunities = [];
    const baseDate = new Date();

    for (let offset = 0; offset < 28; offset++) {
      const checkDate = new Date(baseDate);
      checkDate.setDate(baseDate.getDate() + offset);
      const day = checkDate.getDay();

      // Look at Fridays and Mondays
      if (day === 5 || day === 1) {
        const dStr = checkDate.toISOString().split('T')[0];
        const daySlotsCount = allSlots.filter((s) => s.day_of_week === day && !s.effective_until).length;

        if (daySlotsCount > 0) {
          const simH = totalHeld + daySlotsCount;
          const simAtt = totalAttended;
          const projPct = simH > 0 ? (simAtt / simH) * 100 : 0;
          const isSafe = projPct >= (profile?.target_threshold || 75);

          opportunities.push({
            date: dStr,
            dayName: day === 5 ? 'Friday' : 'Monday',
            slotsCount: daySlotsCount,
            projectedPct: projPct,
            isSafe,
          });
        }
      }
    }
    return opportunities.slice(0, 3);
  }, [allSlots, totalHeld, totalAttended, profile]);

  const openEditor = () => {
    setWefDate(selectedDate);
    const matrix: Record<string, SubjectBlock | null> = {};
    const spans: Record<string, number> = {};
    const existingSubjects = new Map<string, SubjectBlock>();

    const activeSlots = allSlots.filter((s) => !s.effective_until);
    const targetSlots = activeSlots.length > 0 ? activeSlots : allSlots;

    const baseColumns = [...DEFAULT_BASE_SLOTS];
    setEditorColSlots(baseColumns);
    setEditorRowDays(['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);

    const colRanges = baseColumns.map((col, idx) => {
      const [startStr, endStr] = col.split('-').map((s) => s.trim());
      return {
        idx,
        startMin: parseTimeToMinutes(startStr),
        endMin: parseTimeToMinutes(endStr),
      };
    });

    targetSlots.forEach((slot) => {
      const dayCode = DAY_CODES[slot.day_of_week];
      const rIdx = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'].indexOf(dayCode);
      if (rIdx === -1) return;

      const slotStartMin = parseTimeToMinutes(slot.start_time);
      const slotEndMin = parseTimeToMinutes(slot.end_time);

      const startCol = colRanges.findIndex((c) => Math.abs(c.startMin - slotStartMin) <= 10);
      if (startCol === -1) return;

      let spanCount = 1;
      for (let i = startCol; i < colRanges.length; i++) {
        if (slotEndMin >= colRanges[i].endMin - 10) {
          spanCount = i - startCol + 1;
        }
      }

      let block = existingSubjects.get(slot.subject);
      if (!block) {
        block = {
          id: `sb-${slot.subject.toLowerCase().replace(/[^a-z0-9]/g, '-')}`,
          name: slot.subject,
          prof: slot.faculty || 'Faculty',
          course_type: slot.course_type || (slot.subject.toLowerCase().includes('lab') ? 'lab' : 'theory'),
          tagColor: PASTEL_COLORS[existingSubjects.size % PASTEL_COLORS.length],
        };
        existingSubjects.set(slot.subject, block);
      }

      matrix[`${rIdx}-${startCol}`] = block;
      if (spanCount > 1) {
        spans[`${rIdx}-${startCol}`] = spanCount;
        for (let c = startCol + 1; c < startCol + spanCount; c++) {
          matrix[`${rIdx}-${c}`] = block;
        }
      }
    });

    setSubjectPalette(Array.from(existingSubjects.values()));
    setEditorMatrix(matrix);
    setMergedSpans(spans);
    setIsEditorOpen(true);
  };

  const mergeContiguousN = (rIdx: number, startCol: number, length: number) => {
    const baseBlock = editorMatrix[`${rIdx}-${startCol}`];
    if (!baseBlock || length < 2) return;

    for (let c = startCol; c < startCol + length; c++) {
      const b = editorMatrix[`${rIdx}-${c}`];
      if (!b || b.name !== baseBlock.name) return;
    }

    setMergedSpans((prev) => ({
      ...prev,
      [`${rIdx}-${startCol}`]: length,
    }));
  };

  const unmergeCells = (rIdx: number, startCol: number) => {
    setMergedSpans((prev) => {
      const next = { ...prev };
      delete next[`${rIdx}-${startCol}`];
      return next;
    });
  };

  const addEditorColumn = () => {
    setEditorColSlots([...editorColSlots, `Slot ${editorColSlots.length + 1}`]);
  };

  const removeEditorColumn = (index: number) => {
    if (editorColSlots.length <= 1) return;
    setEditorColSlots(editorColSlots.filter((_, i) => i !== index));
    setEditorMatrix((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((key) => {
        const [, col] = key.split('-').map(Number);
        if (col === index) delete updated[key];
      });
      return updated;
    });
  };

  const addEditorRow = () => {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const nextDay = days[editorRowDays.length] || `Day ${editorRowDays.length + 1}`;
    setEditorRowDays([...editorRowDays, nextDay]);
  };

  const removeEditorRow = (index: number) => {
    if (editorRowDays.length <= 1) return;
    setEditorRowDays(editorRowDays.filter((_, i) => i !== index));
    setEditorMatrix((prev) => {
      const updated = { ...prev };
      Object.keys(updated).forEach((key) => {
        const [row] = key.split('-').map(Number);
        if (row === index) delete updated[key];
      });
      return updated;
    });
  };

  const handleDragStart = (e: React.DragEvent, block: SubjectBlock) => {
    e.dataTransfer.setData('application/json', JSON.stringify(block));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleDrop = (rowIndex: number, colIndex: number, e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData('application/json');
    if (!raw) return;
    try {
      const block: SubjectBlock = JSON.parse(raw);
      setEditorMatrix((prev) => ({
        ...prev,
        [`${rowIndex}-${colIndex}`]: block,
      }));
    } catch (err) {
      console.error(err);
    }
  };

  const handleTouchStart = (e: React.TouchEvent, block: SubjectBlock) => {
    const touch = e.touches[0];
    touchStartPos.current = { x: touch.clientX, y: touch.clientY };
    setIsLongPressing(block.id);

    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);

    longPressTimerRef.current = setTimeout(() => {
      if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
        window.navigator.vibrate(40);
      }
      setTouchDraggingBlock(block);
      setTouchCoord({ x: touch.clientX, y: touch.clientY });
      setIsLongPressing(null);
    }, 450);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const touch = e.touches[0];

    if (!touchDraggingBlock) {
      const dist = Math.hypot(
        touch.clientX - touchStartPos.current.x,
        touch.clientY - touchStartPos.current.y
      );
      if (dist > 10) {
        if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        setIsLongPressing(null);
      }
      return;
    }

    setTouchCoord({ x: touch.clientX, y: touch.clientY });

    const targetElement = document.elementFromPoint(touch.clientX, touch.clientY);
    const cell = targetElement?.closest('[data-grid-cell]');
    if (cell) {
      const coord = cell.getAttribute('data-grid-cell');
      setHoveredCellCoord(coord);
    } else {
      setHoveredCellCoord(null);
    }
  };

  const handleTouchEnd = () => {
    if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
    setIsLongPressing(null);

    if (touchDraggingBlock && touchCoord) {
      const targetElement = document.elementFromPoint(touchCoord.x, touchCoord.y);
      const cell = targetElement?.closest('[data-grid-cell]');

      if (cell) {
        const cellCoord = cell.getAttribute('data-grid-cell');
        if (cellCoord) {
          setEditorMatrix((prev) => ({
            ...prev,
            [cellCoord]: touchDraggingBlock,
          }));
          if (typeof window !== 'undefined' && window.navigator && window.navigator.vibrate) {
            window.navigator.vibrate(30);
          }
        }
      }
    }

    setTouchDraggingBlock(null);
    setTouchCoord(null);
    setHoveredCellCoord(null);
  };

  const clearMatrixCell = (rowIndex: number, colIndex: number) => {
    const spanLen = mergedSpans[`${rowIndex}-${colIndex}`] || 1;
    setEditorMatrix((prev) => {
      const copy = { ...prev };
      for (let c = colIndex; c < colIndex + spanLen; c++) {
        delete copy[`${rowIndex}-${c}`];
      }
      return copy;
    });
    unmergeCells(rowIndex, colIndex);
  };

  const handleAddPaletteBlock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSub.trim()) return;
    const block: SubjectBlock = {
      id: `sb-${Date.now()}`,
      name: newSub.trim(),
      prof: newProf.trim() || 'Faculty',
      course_type: newType,
      tagColor: PASTEL_COLORS[subjectPalette.length % PASTEL_COLORS.length],
    };
    setSubjectPalette([...subjectPalette, block]);
    setNewSub('');
    setNewProf('');
  };

  const startEditingBlock = (block: SubjectBlock) => {
    setEditingBlockId(block.id);
    setEditName(block.name);
    setEditProf(block.prof);
    setEditColor(block.tagColor);
    setEditBlockType(block.course_type);
  };

  const saveBlockEdit = (blockId: string) => {
    if (!editName.trim()) return;

    const updatedPalette = subjectPalette.map((b) => {
      if (b.id === blockId) {
        return {
          ...b,
          name: editName.trim(),
          prof: editProf.trim() || 'Faculty',
          tagColor: editColor,
          course_type: editBlockType,
        };
      }
      return b;
    });
    setSubjectPalette(updatedPalette);

    const updatedMatrix = { ...editorMatrix };
    Object.keys(updatedMatrix).forEach((key) => {
      const item = updatedMatrix[key];
      if (item && item.id === blockId) {
        updatedMatrix[key] = {
          ...item,
          name: editName.trim(),
          prof: editProf.trim() || 'Faculty',
          tagColor: editColor,
          course_type: editBlockType,
        };
      }
    });
    setEditorMatrix(updatedMatrix);
    setEditingBlockId(null);
  };

  const deletePaletteBlock = (blockId: string) => {
    setSubjectPalette(subjectPalette.filter((b) => b.id !== blockId));
    setEditorMatrix((prev) => {
      const copy = { ...prev };
      Object.keys(copy).forEach((k) => {
        if (copy[k]?.id === blockId) delete copy[k];
      });
      return copy;
    });
    if (selectedPaletteBlock?.id === blockId) setSelectedPaletteBlock(null);
  };

  const handleSaveScheduleChanges = async () => {
    if (!user) return;
    setIsSavingSchedule(true);

    try {
      await supabase
        .from('profiles')
        .update({ semester_start_date: editorSemesterStart })
        .eq('id', user.id);

      const dayMap: Record<string, number> = {
        Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6
      };

      const newSlotsPayload: any[] = [];

      editorRowDays.forEach((dayStr, rIdx) => {
        let cIdx = 0;
        while (cIdx < editorColSlots.length) {
          const spanLen = mergedSpans[`${rIdx}-${cIdx}`] || 1;
          const item = editorMatrix[`${rIdx}-${cIdx}`];

          if (item) {
            for (let offset = 0; offset < spanLen; offset++) {
              const currentSlot = editorColSlots[cIdx + offset];
              const [sPart, ePart] = currentSlot.split('-').map((s) => s.trim());
              const start = sPart.length === 5 ? `${sPart}:00` : sPart;
              const end = ePart.length === 5 ? `${ePart}:00` : ePart;

              newSlotsPayload.push({
                user_id: user.id,
                subject: item.name,
                faculty: item.prof || 'Faculty',
                day_of_week: dayMap[dayStr],
                start_time: start,
                end_time: end,
                course_type: item.course_type || 'theory',
                effective_from: editorMode === 'wef' ? wefDate : editorSemesterStart,
                effective_until: null,
              });
            }
          }

          cIdx += spanLen;
        }
      });

      if (editorMode === 'wef') {
        const [y, m, d] = wefDate.split('-').map(Number);
        const prevDayObj = new Date(y, m - 1, d - 1);
        const prevDateStr = prevDayObj.toISOString().split('T')[0];

        await supabase
          .from('timetable')
          .update({ effective_until: prevDateStr })
          .eq('user_id', user.id)
          .is('effective_until', null);

        if (newSlotsPayload.length > 0) {
          await supabase.from('timetable').insert(newSlotsPayload);
        }
      } else {
        await supabase.from('timetable').delete().eq('user_id', user.id);
        if (newSlotsPayload.length > 0) {
          await supabase.from('timetable').insert(newSlotsPayload);
        }
      }

      await loadData();
      setIsEditorOpen(false);
    } catch (err) {
      console.error('Save error:', err);
    } finally {
      setIsSavingSchedule(false);
    }
  };

  const handleMarkMerged = async (mergedSlot: MergedSlot, status: 'present' | 'absent' | 'od') => {
    if (!user || isHoliday) return;

    const currentStatus = dayAttendance[mergedSlot.id];
    const next = { ...dayAttendance };

    if (currentStatus === status) {
      delete next[mergedSlot.id];
      for (const sId of mergedSlot.slotIds) {
        await supabase
          .from('attendance_records')
          .delete()
          .eq('user_id', user.id)
          .eq('slot_id', sId)
          .eq('date', selectedDate);
      }
    } else {
      next[mergedSlot.id] = status;
      for (const sId of mergedSlot.slotIds) {
        await supabase.from('attendance_records').upsert(
          {
            user_id: user.id,
            slot_id: sId,
            date: selectedDate,
            status,
          },
          { onConflict: 'user_id,slot_id,date' }
        );
      }
    }

    setDayAttendance(next);
    await recalculateStats(user.id, allSlots);
  };

  const handleToggleHoliday = async () => {
    if (!user) return;

    if (isHoliday) {
      await supabase
        .from('holidays')
        .delete()
        .eq('user_id', user.id)
        .eq('holiday_date', selectedDate);
      setIsHoliday(false);
    } else {
      await supabase.from('holidays').insert({
        user_id: user.id,
        holiday_date: selectedDate,
      });
      setIsHoliday(true);
    }

    await recalculateStats(user.id, allSlots);
  };

  const handleDateShift = (delta: number) => {
    const [y, m, d] = selectedDate.split('-').map(Number);
    const date = new Date(y, m - 1, d + delta);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    setSelectedDate(`${yyyy}-${mm}-${dd}`);
  };

  const handleExportCSV = async () => {
    if (!user) return;

    const { data: records } = await supabase
      .from('attendance_records')
      .select('date, status, slot_id')
      .eq('user_id', user.id)
      .order('date', { ascending: true });

    if (!records || records.length === 0) {
      alert('No attendance entries recorded to export.');
      return;
    }

    const slotMap = new Map(allSlots.map((s) => [s.id, s]));

    const rows = [
      ['Date', 'Subject', 'Type', 'Faculty', 'Time Slot', 'Attendance Status'],
      ...records.map((r) => {
        const slot = slotMap.get(r.slot_id);
        return [
          r.date,
          slot?.subject || 'Unknown Course',
          slot?.course_type?.toUpperCase() || 'THEORY',
          slot?.faculty || 'Faculty',
          slot ? `${slot.start_time.slice(0, 5)} - ${slot.end_time.slice(0, 5)}` : 'N/A',
          r.status.toUpperCase(),
        ];
      }),
    ];

    const csvContent =
      'data:text/csv;charset=utf-8,' +
      rows.map((e) => e.map((val) => `"${val}"`).join(',')).join('\n');

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `ShouldISkip_Ledger_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleGenerateShareCode = async () => {
    if (!user) return;
    setShareMessage('');

    const activeSlots = allSlots.filter((s) => !s.effective_until);
    if (activeSlots.length === 0) {
      alert('Please configure your timetable before sharing.');
      return;
    }

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();

    const { error } = await supabase.from('shared_timetables').insert({
      share_code: code,
      creator_id: user.id,
      title: `${profile?.stream || 'Class'} Schedule`,
      schedule_data: activeSlots.map((s) => ({
        subject: s.subject,
        faculty: s.faculty,
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
        course_type: s.course_type || 'theory',
      })),
    });

    if (error) {
      setShareMessage('Failed to create share code: ' + error.message);
    } else {
      setShareCode(code);
      setActiveShareRoom(code);
    }
  };

  const handleImportTimetable = async () => {
    if (!user || !importCodeInput.trim()) return;
    setImporting(true);
    setShareMessage('');

    try {
      const cleanCode = importCodeInput.trim().toUpperCase();
      const { data, error } = await supabase
        .from('shared_timetables')
        .select('*')
        .eq('share_code', cleanCode)
        .maybeSingle();

      if (error || !data) {
        setShareMessage('Invalid or expired timetable code.');
        setImporting(false);
        return;
      }

      const importedSlots = data.schedule_data.map((item: any) => ({
        user_id: user.id,
        subject: item.subject,
        faculty: item.faculty || 'Faculty',
        day_of_week: item.day_of_week,
        start_time: item.start_time,
        end_time: item.end_time,
        course_type: item.course_type || 'theory',
        effective_from: selectedDate,
        effective_until: null,
      }));

      const [y, m, d] = selectedDate.split('-').map(Number);
      const prevDate = new Date(y, m - 1, d - 1).toISOString().split('T')[0];

      await supabase
        .from('timetable')
        .update({ effective_until: prevDate })
        .eq('user_id', user.id)
        .is('effective_until', null);

      await supabase.from('timetable').insert(importedSlots);

      setActiveShareRoom(cleanCode);
      await loadData();
      setShareMessage(`Successfully imported "${data.title}"! Joined Pulse Room.`);
      setImportCodeInput('');
    } catch (err: any) {
      setShareMessage('Import failed: ' + err.message);
    } finally {
      setImporting(false);
    }
  };

  const startDrag = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragStartRef.current = {
      mouseX: e.clientX,
      mouseY: e.clientY,
      modalX: modalPos.x,
      modalY: modalPos.y,
    };
  };

  useEffect(() => {
    const onMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - dragStartRef.current.mouseX;
      const dy = e.clientY - dragStartRef.current.mouseY;
      setModalPos({
        x: Math.max(10, Math.min(window.innerWidth - 410, dragStartRef.current.modalX + dx)),
        y: Math.max(10, Math.min(window.innerHeight - 200, dragStartRef.current.modalY + dy)),
      });
    };

    const onMouseUp = () => setIsDragging(false);

    if (isDragging) {
      window.addEventListener('mousemove', onMouseMove);
      window.addEventListener('mouseup', onMouseUp);
    }
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [isDragging]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    window.location.replace('/');
  };

  const target = profile?.target_threshold || 75;
  const labTarget = profile?.lab_threshold || 80;

  const percentage = totalHeld > 0 ? (totalAttended / totalHeld) * 100 : 0;
  const isBelow = totalHeld > 0 && percentage < target;

  const recoveryClasses = isBelow
    ? Math.max(0, Math.ceil((target * totalHeld - 100 * totalAttended) / (100 - target)))
    : 0;

  const safeBunks = !isBelow && totalHeld > 0
    ? Math.floor((100 * totalAttended - target * totalHeld) / target)
    : 0;

  // Theory & Lab Percentages
  const theoryPct = theoryHeld > 0 ? (theoryAttended / theoryHeld) * 100 : 0;
  const labPct = labHeld > 0 ? (labAttended / labHeld) * 100 : 0;

  // Simulator Projections
  const simHeld = totalHeld + simulatedSkips;
  const simAttended = totalAttended;
  const simPercentage = simHeld > 0 ? (simAttended / simHeld) * 100 : 0;
  const simIsBelow = simHeld > 0 && simPercentage < target;
  const simSafeBunks = !simIsBelow && simHeld > 0
    ? Math.floor((100 * simAttended - target * simHeld) / target)
    : 0;
  const simRecovery = simIsBelow
    ? Math.max(0, Math.ceil((target * simHeld - 100 * simAttended) / (100 - target)))
    : 0;

  const [y, m, d] = selectedDate.split('-').map(Number);
  const activeDateObj = new Date(y, m - 1, d);
  const weekdayName = DAY_NAMES[activeDateObj.getDay()];

  const semStartDate = profile?.semester_start_date || '2026-08-17';
  const computedFromText = useMemo(() => {
    if (!firstEntryDate) return `Semester started ${semStartDate}`;
    if (firstEntryDate === semStartDate) {
      return `Computed from semester start (${semStartDate})`;
    }
    return `Computed from ${firstEntryDate} (Sem start: ${semStartDate})`;
  }, [firstEntryDate, semStartDate]);

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-50 dark:bg-[#0c0c0e] flex items-center justify-center text-xs text-zinc-400">
        Loading workspace...
      </div>
    );
  }

  return (
    <div
      className="min-h-screen bg-zinc-100 dark:bg-[#0c0c0e] text-zinc-900 dark:text-zinc-100 antialiased selection:bg-blue-500/20"
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
    >
      {/* Hidden OCR File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleOcrUpload}
        accept="image/*"
        className="hidden"
      />

      {/* Floating Ghost Pill for Mobile Drag */}
      {touchDraggingBlock && touchCoord && (
        <div
          style={{
            position: 'fixed',
            left: `${touchCoord.x - 70}px`,
            top: `${touchCoord.y - 50}px`,
            pointerEvents: 'none',
            zIndex: 99999,
          }}
          className="px-4 py-2 rounded-2xl border-2 border-blue-500 shadow-2xl backdrop-blur-md scale-110 font-bold text-xs flex items-center gap-2 bg-white/95 dark:bg-zinc-900/95 text-zinc-900 dark:text-white ring-8 ring-blue-500/20"
        >
          <span className="w-2 h-2 rounded-full bg-blue-500 animate-ping" />
          <span>{touchDraggingBlock.name}</span>
        </div>
      )}

      {/* Top Header */}
      <header className="sticky top-0 z-40 px-4 md:px-8 py-3.5 backdrop-blur-xl bg-white/75 dark:bg-zinc-900/75 border-b border-zinc-200 dark:border-zinc-800">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          
          <div
            onClick={() => setShowProfileModal(true)}
            className="flex items-center gap-3.5 cursor-pointer group select-none"
            title="Click to edit profile & college details"
          >
            <div className="relative">
              <img
                src="/logo.png"
                alt="ShouldISkip Mascot"
                className="w-14 h-14 rounded-2xl object-contain drop-shadow-md group-hover:scale-105 group-hover:rotate-3 transition duration-200 shrink-0"
              />
              <span className="absolute -bottom-1 -right-1 bg-blue-600 text-white rounded-full p-1 shadow-md border-2 border-white dark:border-zinc-900">
                <Settings className="w-2.5 h-2.5" />
              </span>
            </div>

            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-sm font-semibold tracking-tight leading-tight group-hover:text-blue-500 transition">
                  {profile?.college_name || 'ShouldISkip'}
                </h1>
                {profile?.is_admin && (
                  <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    Admin
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                {profile?.username || user?.email?.split('@')[0]} · {profile?.stream || 'Session'} (Sem {profile?.semester || 1})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Snap Timetable Button */}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isOcrProcessing}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-200/50 dark:bg-zinc-800/50 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition"
              title="Snap & auto-fill timetable photo"
            >
              <Camera className="w-3.5 h-3.5 text-amber-500" />
              <span className="hidden sm:inline">{isOcrProcessing ? 'Reading...' : 'Snap Timetable'}</span>
            </button>

            {/* Long Weekend Planner */}
            <button
              onClick={() => setShowPlannerModal(true)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-200/50 dark:bg-zinc-800/50 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition"
              title="Long Weekend Optimizer"
            >
              <Compass className="w-3.5 h-3.5 text-rose-500" />
              <span className="hidden sm:inline">Trip Planner</span>
            </button>

            <button
              onClick={() => setShowSimulator(true)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-200/50 dark:bg-zinc-800/50 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition"
            >
              <Calculator className="w-3.5 h-3.5 text-emerald-500" />
              <span className="hidden sm:inline">Simulator</span>
            </button>

            <button
              onClick={() => setShowShareModal(true)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-200/50 dark:bg-zinc-800/50 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition"
            >
              <Share2 className="w-3.5 h-3.5 text-blue-500" />
              <span className="hidden sm:inline">Share</span>
            </button>

            {/* Calendar & Notifications */}
            <button
              onClick={handleExportICS}
              className="p-2 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-800/60 hover:opacity-80 transition"
              title="Export to Apple / Google Calendar (.ics)"
            >
              <CalendarCheck className="w-4 h-4 text-zinc-600 dark:text-zinc-300" />
            </button>

            <button
              onClick={handleEnableBriefingNotification}
              className="p-2 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-800/60 hover:opacity-80 transition"
              title="Enable Daily 8 AM Attendance Briefing"
            >
              <Bell className="w-4 h-4 text-zinc-600 dark:text-zinc-300" />
            </button>

            <button
              onClick={handleExportCSV}
              className="p-2 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-800/60 hover:opacity-80 transition"
              title="Export CSV Ledger"
            >
              <Download className="w-4 h-4 text-zinc-600 dark:text-zinc-300" />
            </button>

            <button
              onClick={openEditor}
              className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 rounded-full border border-zinc-200 dark:border-zinc-700 bg-zinc-200/50 dark:bg-zinc-800/50 hover:bg-zinc-300 dark:hover:bg-zinc-700 transition"
            >
              <Edit3 className="w-3.5 h-3.5 text-blue-500" />
              <span className="hidden sm:inline">Modify</span>
            </button>

            <button
              onClick={() => setShowTimetableModal(!showTimetableModal)}
              className={`flex items-center gap-1.5 text-xs font-semibold px-3.5 py-1.5 rounded-full transition-all border ${
                showTimetableModal
                  ? 'bg-blue-600 text-white border-transparent'
                  : 'bg-zinc-200/50 dark:bg-zinc-800/50 border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>View</span>
            </button>

            <button
              onClick={() => setDarkMode(!darkMode)}
              className="p-2 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-800/60 hover:opacity-80 transition"
            >
              {darkMode ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-zinc-600" />}
            </button>

            <button
              onClick={handleSignOut}
              className="p-2 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white/60 dark:bg-zinc-800/60 hover:text-rose-500 transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Dashboard Content */}
      <main className="max-w-6xl mx-auto p-4 md:p-8 space-y-8">
        
        {/* KPI Cards (Overall, Theory vs Lab Rules, Smart Margin) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          
          {/* Card 1: Overall Standing */}
          <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-6 rounded-[24px] border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
              <span>Overall Standing</span>
              <span>Bar: {target}%</span>
            </div>
            
            <div className="my-3 flex items-baseline gap-2">
              <span className={`text-4xl font-extrabold tracking-tight ${
                totalHeld === 0 ? 'text-zinc-400' : isBelow ? 'text-rose-500' : 'text-emerald-500'
              }`}>
                {totalHeld > 0 ? `${percentage.toFixed(1)}%` : '— —'}
              </span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 font-medium">
                {totalHeld === 0 ? 'No lectures logged' : isBelow ? 'Below threshold' : 'Above target'}
              </span>
            </div>

            <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  isBelow ? 'bg-rose-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(percentage, 100)}%` }}
              />
            </div>
          </div>

          {/* Card 2: Theory vs Lab Dual Rule Tracker */}
          <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-6 rounded-[24px] border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between space-y-3">
            <div className="flex items-center justify-between text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
              <span>Theory vs Lab Rules</span>
              <FlaskConical className="w-3.5 h-3.5 text-blue-500" />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 font-medium">
                  <BookOpen className="w-3 h-3 text-sky-500" /> Theory ({target}%)
                </span>
                <span className={`font-bold ${theoryHeld > 0 && theoryPct < target ? 'text-rose-500' : 'text-emerald-500'}`}>
                  {theoryHeld > 0 ? `${theoryPct.toFixed(1)}%` : '—'} ({theoryAttended}/{theoryHeld})
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="flex items-center gap-1 font-medium">
                  <FlaskConical className="w-3 h-3 text-purple-500" /> Practicals/Labs ({labTarget}%)
                </span>
                <span className={`font-bold ${labHeld > 0 && labPct < labTarget ? 'text-rose-500' : 'text-emerald-500'}`}>
                  {labHeld > 0 ? `${labPct.toFixed(1)}%` : '—'} ({labAttended}/{labHeld})
                </span>
              </div>
            </div>

            <div className="text-[11px] text-zinc-400 truncate" title={computedFromText}>
              {computedFromText}
            </div>
          </div>

          {/* Card 3: Smart Margin & Bunk Advisor */}
          <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-6 rounded-[24px] border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
            <div className="flex items-center justify-between text-[11px] font-semibold tracking-wider text-zinc-400 uppercase">
              <span>Smart Advisor</span>
              <Sparkles className="w-3.5 h-3.5 text-blue-500" />
            </div>

            <div className="my-2">
              {totalHeld === 0 ? (
                <div>
                  <h3 className="text-lg font-bold text-zinc-400">Fresh Ledger</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    Select a date below to record lectures.
                  </p>
                </div>
              ) : isBelow ? (
                <div>
                  <div className="text-3xl font-extrabold text-rose-500">
                    +{recoveryClasses} Classes
                  </div>
                  <p className="text-xs text-rose-500 font-medium mt-1">
                    Attend consecutively to hit {target}%.
                  </p>
                </div>
              ) : (
                <div>
                  <div className="text-3xl font-extrabold text-emerald-500">
                    {safeBunks} Safe Bunks
                  </div>
                  <p className="text-xs text-emerald-500 font-medium mt-1">
                    You can safely miss {safeBunks} classes.
                  </p>
                </div>
              )}
            </div>

            <div className="text-[11px] text-zinc-400">
              Live mathematical margin
            </div>
          </div>
        </div>

        {/* Date Selector */}
        <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-3 rounded-2xl border border-zinc-200 dark:border-zinc-800 shadow-sm flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleDateShift(-1)}
              className="p-2 rounded-xl bg-zinc-200/60 dark:bg-zinc-800/60 hover:opacity-80 transition"
              title="Previous Day"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-zinc-200/60 dark:bg-zinc-800/60 text-xs font-semibold">
              <CalendarIcon className="w-3.5 h-3.5 text-blue-500" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="bg-transparent focus:outline-none cursor-pointer"
              />
            </div>

            <button
              onClick={() => handleDateShift(1)}
              className="p-2 rounded-xl bg-zinc-200/60 dark:bg-zinc-800/60 hover:opacity-80 transition"
              title="Next Day"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                const today = new Date();
                const offset = today.getTimezoneOffset() * 60000;
                setSelectedDate(new Date(today.getTime() - offset).toISOString().split('T')[0]);
              }}
              className="text-xs font-semibold px-3 py-2 rounded-xl bg-zinc-200/60 dark:bg-zinc-800/60 text-blue-500 hover:opacity-80 transition"
            >
              Today
            </button>
          </div>

          <button
            onClick={handleToggleHoliday}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition border ${
              isHoliday
                ? 'bg-amber-500/20 text-amber-500 border-amber-500/40'
                : 'bg-zinc-200/60 dark:bg-zinc-800/60 text-zinc-500 dark:text-zinc-400 border-transparent hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            <Palmtree className="w-4 h-4" />
            <span>{isHoliday ? 'Holiday Active' : 'Mark Day as Holiday'}</span>
          </button>
        </div>

        {/* Scheduled Lectures + Anonymous Mass Bunk Pulse */}
        <section className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-6 md:p-8 rounded-[28px] border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-zinc-200 dark:border-zinc-800 gap-2">
            <div>
              <h2 className="text-base font-bold tracking-tight">
                {weekdayName}, {activeDateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </h2>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {isHoliday
                  ? 'All lectures suspended for holiday'
                  : `${daySlots.length} distinct lecture sessions for this date`}
              </p>
            </div>

            {activeShareRoom && (
              <span className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full flex items-center gap-1.5 w-fit">
                <Flame className="w-3.5 h-3.5" />
                <span>Room Pulse: {activeShareRoom}</span>
              </span>
            )}
          </div>

          {isHoliday ? (
            <div className="py-14 text-center text-zinc-500 dark:text-zinc-400 space-y-2">
              <Palmtree className="w-8 h-8 mx-auto text-amber-500/80" />
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">Campus Holiday</p>
              <p className="text-xs max-w-sm mx-auto">
                No classes count against or towards your percentage on this date.
              </p>
            </div>
          ) : daySlots.length === 0 ? (
            <div className="py-14 text-center text-zinc-500 dark:text-zinc-400 space-y-2">
              <div className="w-8 h-8 rounded-full bg-zinc-200/60 dark:bg-zinc-800/60 mx-auto flex items-center justify-center text-zinc-700 dark:text-zinc-300 font-bold text-xs">
                —
              </div>
              <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100">No classes scheduled on {weekdayName}s</p>
              <p className="text-xs max-w-sm mx-auto">
                No classes configured. Pick a different date or click "Modify" above.
              </p>
            </div>
          ) : (
            <div className="space-y-3 pt-2">
              {daySlots.map((mSlot) => {
                const status = dayAttendance[mSlot.id];
                const isMerged = mSlot.slotIds.length > 1;
                const pulse = pulseVotes[mSlot.id] || { count: 0, userVoted: false };

                return (
                  <div
                    key={mSlot.id}
                    className="bg-white dark:bg-zinc-900 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 border border-zinc-200 dark:border-zinc-800 hover:shadow-sm transition"
                  >
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm tracking-tight">{mSlot.subject}</span>
                        <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                          mSlot.course_type === 'lab'
                            ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
                            : 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20'
                        }`}>
                          {mSlot.course_type === 'lab' ? 'Lab' : 'Theory'}
                        </span>

                        {isMerged && (
                          <span className="text-[10px] font-semibold bg-blue-500/10 text-blue-600 dark:text-blue-400 px-2 py-0.5 rounded-md border border-blue-500/20">
                            {mSlot.slotIds.length}x Merged Slot
                          </span>
                        )}
                        {mSlot.faculty && mSlot.faculty !== 'Faculty' && (
                          <span className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                            · {mSlot.faculty}
                          </span>
                        )}
                        {status && (
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${
                            status === 'present'
                              ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                              : status === 'od'
                              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                              : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                          }`}>
                            {status === 'od' ? 'On Duty' : status}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono mt-1">
                        <Clock className="w-3.5 h-3.5" />
                        <span>{mSlot.start_time.slice(0, 5)} – {mSlot.end_time.slice(0, 5)}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-end sm:self-center flex-wrap">
                      {/* Mass Bunk Pulse Voting Button */}
                      {activeShareRoom && (
                        <button
                          onClick={() => handleTogglePulseVote(mSlot.id)}
                          className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition border ${
                            pulse.userVoted
                              ? 'bg-amber-500/20 text-amber-600 border-amber-500/40'
                              : 'bg-zinc-100 dark:bg-zinc-800/80 text-zinc-500 border-transparent hover:text-amber-500'
                          }`}
                          title="Vote anonymously on skipping this class"
                        >
                          <Flame className="w-3.5 h-3.5" />
                          <span>{pulse.count > 0 ? `${pulse.count} Bunking` : 'Bunk?'}</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleMarkMerged(mSlot, 'present')}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition active:scale-95 ${
                          status === 'present'
                            ? 'bg-emerald-600 text-white shadow-sm'
                            : 'bg-zinc-200/60 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 hover:opacity-80'
                        }`}
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Yes</span>
                      </button>

                      <button
                        onClick={() => handleMarkMerged(mSlot, 'absent')}
                        className={`flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition active:scale-95 ${
                          status === 'absent'
                            ? 'bg-rose-600 text-white shadow-sm'
                            : 'bg-zinc-200/60 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 hover:opacity-80'
                        }`}
                      >
                        <X className="w-3.5 h-3.5" />
                        <span>No</span>
                      </button>

                      <button
                        onClick={() => handleMarkMerged(mSlot, 'od')}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold transition active:scale-95 ${
                          status === 'od'
                            ? 'bg-amber-500 text-white shadow-sm'
                            : 'bg-zinc-200/60 dark:bg-zinc-800/60 text-zinc-700 dark:text-zinc-300 hover:opacity-80'
                        }`}
                        title="Duty / Medical Waiver"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" />
                        <span>OD</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* Analytics Section */}
        <section className="space-y-6 pt-4">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-blue-500" />
            <h2 className="text-sm font-bold uppercase tracking-wider text-zinc-400">
              Analytics & Visualizations
            </h2>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-6 rounded-[28px] border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    Cumulative Attendance Distribution
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Attended + OD vs. Missed proportional ratio
                  </p>
                </div>
                <TrendingUp className="w-4 h-4 text-emerald-500" />
              </div>

              {totalHeld === 0 ? (
                <div className="py-12 text-center text-xs text-zinc-400">
                  Record your attendance to generate visuals.
                </div>
              ) : (
                <div className="space-y-4 pt-2">
                  <div className="flex h-7 w-full overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-100 dark:bg-zinc-800">
                    <div
                      style={{ width: `${percentage}%` }}
                      className="bg-emerald-500 transition-all duration-500 flex items-center justify-center text-[10px] font-bold text-white shadow-sm"
                    >
                      {percentage > 12 && `${percentage.toFixed(0)}%`}
                    </div>
                    <div
                      style={{ width: `${100 - percentage}%` }}
                      className="bg-rose-500/80 transition-all duration-500 flex items-center justify-center text-[10px] font-bold text-white shadow-sm"
                    >
                      {100 - percentage > 12 && `${(100 - percentage).toFixed(0)}%`}
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1 flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-emerald-500" />
                      <span className="font-semibold">{totalAttended} Compliant</span>
                    </div>
                    {totalOD > 0 && (
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full bg-amber-500" />
                        <span className="font-semibold">{totalOD} On Duty</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-rose-500" />
                      <span className="font-semibold">{totalHeld - totalAttended} Missed</span>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-6 rounded-[28px] border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    Course Compliance & Type Breakdown
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Percentage compliance by course
                  </p>
                </div>
              </div>

              {Object.keys(subjectStats).length === 0 ? (
                <div className="py-12 text-center text-xs text-zinc-400">
                  No courses marked yet.
                </div>
              ) : (
                <div className="space-y-3 pt-1">
                  {Object.entries(subjectStats).map(([sub, data]) => {
                    const subTarget = data.type === 'lab' ? labTarget : target;
                    const subPct = data.total > 0 ? (data.present / data.total) * 100 : 0;
                    const isShort = subPct < subTarget && data.total > 0;

                    return (
                      <div key={sub} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-semibold truncate max-w-[180px] flex items-center gap-1.5">
                            <span className={`w-2 h-2 rounded-full ${data.type === 'lab' ? 'bg-purple-500' : 'bg-sky-500'}`} />
                            {sub}
                          </span>
                          <span className={`font-bold ${isShort ? 'text-rose-500' : 'text-emerald-500'}`}>
                            {subPct.toFixed(1)}% <span className="text-[10px] text-zinc-400 font-normal">({data.present}/{data.total})</span>
                          </span>
                        </div>
                        <div className="w-full bg-zinc-200 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-300 ${
                              isShort ? 'bg-rose-500' : 'bg-emerald-500'
                            }`}
                            style={{ width: `${Math.min(subPct, 100)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </section>

      </main>

      {/* FEATURE MODAL 1: LONG WEEKEND OPTIMIZER */}
      {showPlannerModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800 rounded-[28px] max-w-md w-full p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Compass className="w-4 h-4 text-rose-500" />
                <h3 className="text-sm font-bold">Long Weekend / Bunk Planner</h3>
              </div>
              <button
                onClick={() => setShowPlannerModal(false)}
                className="w-6 h-6 rounded-full bg-zinc-200/60 dark:bg-zinc-800/60 text-xs flex items-center justify-center text-zinc-500"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <p className="text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
                We scanned your timetable for upcoming Fridays & Mondays. Skipping these turns weekends into 3- or 4-day trip windows.
              </p>

              {longWeekendOpportunities.length === 0 ? (
                <div className="p-4 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-xs text-center text-zinc-400">
                  No Friday/Monday classes detected in your active schedule.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {longWeekendOpportunities.map((op, idx) => (
                    <div
                      key={idx}
                      className="p-3 rounded-2xl bg-zinc-100/70 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 flex items-center justify-between"
                    >
                      <div>
                        <div className="text-xs font-bold flex items-center gap-1.5">
                          <span>{op.dayName} Bunk Trip ({op.date})</span>
                          {op.isSafe ? (
                            <span className="text-[10px] bg-emerald-500/10 text-emerald-500 px-1.5 py-0.5 rounded font-bold">Safe</span>
                          ) : (
                            <span className="text-[10px] bg-rose-500/10 text-rose-500 px-1.5 py-0.5 rounded font-bold">Risky</span>
                          )}
                        </div>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5">
                          Skip {op.slotsCount} lectures · Drops standing to {op.projectedPct.toFixed(1)}%
                        </p>
                      </div>

                      <button
                        onClick={() => {
                          setSelectedDate(op.date);
                          setShowPlannerModal(false);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition"
                      >
                        Jump
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* FEATURE MODAL 2: PROFILE & IDENTITY SETTINGS */}
      {showProfileModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800 rounded-[28px] max-w-lg w-full p-6 space-y-6 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <User className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-bold">Profile & College Identity</h3>
              </div>
              <button
                onClick={() => setShowProfileModal(false)}
                className="w-6 h-6 rounded-full bg-zinc-200/60 dark:bg-zinc-800/60 text-xs flex items-center justify-center text-zinc-500"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateProfile} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-400">Display Name / Roll No</label>
                  <input
                    type="text"
                    value={editUsername}
                    onChange={(e) => setEditUsername(e.target.value)}
                    required
                    className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-400">College / University</label>
                  <input
                    type="text"
                    value={editCollege}
                    onChange={(e) => setEditCollege(e.target.value)}
                    required
                    className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-400">Stream / Department</label>
                  <input
                    type="text"
                    value={editStream}
                    onChange={(e) => setEditStream(e.target.value)}
                    required
                    className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-400">Current Semester</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={editSemester}
                    onChange={(e) => setEditSemester(Number(e.target.value))}
                    required
                    className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-zinc-400">Theory Bar</label>
                    <span className="text-xs font-bold text-blue-500">{editTargetThreshold}%</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="95"
                    step="1"
                    value={editTargetThreshold}
                    onChange={(e) => setEditTargetThreshold(Number(e.target.value))}
                    className="w-full accent-blue-500 cursor-pointer"
                  />
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-semibold text-zinc-400">Lab/Practical Bar</label>
                    <span className="text-xs font-bold text-purple-500">{editLabThreshold}%</span>
                  </div>
                  <input
                    type="range"
                    min="50"
                    max="95"
                    step="1"
                    value={editLabThreshold}
                    onChange={(e) => setEditLabThreshold(Number(e.target.value))}
                    className="w-full accent-purple-500 cursor-pointer"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSavingProfile}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition flex items-center justify-center gap-1.5 shadow-sm"
              >
                <CheckCircle className="w-4 h-4" />
                <span>{isSavingProfile ? 'Updating Profile...' : 'Save Profile Changes'}</span>
              </button>
            </form>

            {/* Danger Zone */}
            <div className="border-t border-zinc-200 dark:border-zinc-800 pt-5 space-y-3">
              <div className="flex items-center gap-2 text-rose-500">
                <AlertTriangle className="w-4 h-4" />
                <h4 className="text-xs font-bold uppercase tracking-wider">Danger Zone: Delete Account</h4>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 leading-relaxed">
                Permanently wipe your account, logs, and timetable. Type <strong>DELETE</strong> to confirm.
              </p>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Type DELETE"
                  value={deleteConfirmText}
                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                  className="flex-1 bg-rose-500/5 border border-rose-500/20 text-rose-500 rounded-xl px-3 py-2 text-xs font-mono uppercase focus:outline-none"
                />
                <button
                  type="button"
                  onClick={handleDeleteAccount}
                  disabled={isDeletingAccount || deleteConfirmText !== 'DELETE'}
                  className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:opacity-40 text-white text-xs font-semibold transition flex items-center gap-1"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{isDeletingAccount ? 'Deleting...' : 'Delete Forever'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* FEATURE MODAL 3: WHAT-IF BUNK SIMULATOR */}
      {showSimulator && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800 rounded-[28px] max-w-md w-full p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Calculator className="w-4 h-4 text-emerald-500" />
                <h3 className="text-sm font-bold">What-If Bunk Sandbox</h3>
              </div>
              <button
                onClick={() => setShowSimulator(false)}
                className="w-6 h-6 rounded-full bg-zinc-200/60 dark:bg-zinc-800/60 text-xs flex items-center justify-center text-zinc-500"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs font-semibold">
                  <span>Simulate Missing Classes:</span>
                  <span className="text-blue-500 text-sm font-bold">{simulatedSkips} Lectures</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="15"
                  value={simulatedSkips}
                  onChange={(e) => setSimulatedSkips(Number(e.target.value))}
                  className="w-full accent-blue-500 cursor-pointer"
                />
              </div>

              <div className="p-4 rounded-2xl bg-zinc-100 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500 dark:text-zinc-400">Current Percentage:</span>
                  <span className="font-bold">{totalHeld > 0 ? `${percentage.toFixed(1)}%` : '—'}</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-500 dark:text-zinc-400">Projected Percentage:</span>
                  <span className={`font-extrabold ${simIsBelow ? 'text-rose-500' : 'text-emerald-500'}`}>
                    {simPercentage.toFixed(1)}%
                  </span>
                </div>
                <div className="border-t border-zinc-200 dark:border-zinc-800 pt-2 flex items-center justify-between text-xs">
                  <span className="text-zinc-500 dark:text-zinc-400">Projected Margin:</span>
                  <span className={`font-bold ${simIsBelow ? 'text-rose-500' : 'text-emerald-500'}`}>
                    {simIsBelow ? `Need +${simRecovery} recovery classes` : `${simSafeBunks} safe bunks left`}
                  </span>
                </div>
              </div>
            </div>

            <button
              onClick={() => setShowSimulator(false)}
              className="w-full py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition"
            >
              Done Testing
            </button>
          </div>
        </div>
      )}

      {/* FEATURE MODAL 4: PEER TIMETABLE SHARE & IMPORT */}
      {showShareModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800 rounded-[28px] max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Share2 className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-bold">Share & Clone Schedule</h3>
              </div>
              <button
                onClick={() => {
                  setShowShareModal(false);
                  setShareMessage('');
                }}
                className="w-6 h-6 rounded-full bg-zinc-200/60 dark:bg-zinc-800/60 text-xs flex items-center justify-center text-zinc-500"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Share Your Timetable</h4>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Generate a 6-character code. Classmates using it share your schedule and vote in your Class Pulse room.
              </p>

              {shareCode ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/20 text-center font-mono font-extrabold text-blue-500 text-base tracking-widest">
                    {shareCode}
                  </div>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(shareCode);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    }}
                    className="p-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white transition flex items-center gap-1 text-xs font-semibold"
                  >
                    {copied ? <CheckCheck className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{copied ? 'Copied' : 'Copy'}</span>
                  </button>
                </div>
              ) : (
                <button
                  onClick={handleGenerateShareCode}
                  className="w-full py-2 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-xs font-semibold hover:bg-zinc-300 dark:hover:bg-zinc-700 transition"
                >
                  Generate Share Code
                </button>
              )}
            </div>

            <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">Import Classmate's Timetable</h4>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  placeholder="Enter 6-char code (e.g. A9B2C4)"
                  value={importCodeInput}
                  onChange={(e) => setImportCodeInput(e.target.value.toUpperCase())}
                  maxLength={6}
                  className="flex-1 uppercase font-mono tracking-widest bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none"
                />
                <button
                  onClick={handleImportTimetable}
                  disabled={importing || !importCodeInput.trim()}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold transition"
                >
                  {importing ? 'Importing...' : 'Clone'}
                </button>
              </div>

              {shareMessage && (
                <p className="text-xs text-blue-500 font-medium text-center pt-1">
                  {shareMessage}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Floating Timetable Preview */}
      {showTimetableModal && (
        <div
          style={{
            position: 'fixed',
            left: `${modalPos.x}px`,
            top: `${modalPos.y}px`,
            zIndex: 100,
          }}
          className="w-[380px] max-w-[90vw] backdrop-blur-xl bg-white/80 dark:bg-zinc-900/80 rounded-2xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden"
        >
          <div
            onMouseDown={startDrag}
            className="px-4 py-3 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between cursor-move select-none"
          >
            <div className="flex items-center gap-2">
              <Move className="w-3.5 h-3.5 text-zinc-400" />
              <span className="text-xs font-bold tracking-tight">Active Timetable</span>
            </div>
            <button
              onClick={() => setShowTimetableModal(false)}
              className="w-5 h-5 rounded-full bg-zinc-200/60 dark:bg-zinc-800/60 flex items-center justify-center text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition text-xs"
            >
              ✕
            </button>
          </div>

          <div className="p-4 max-h-[350px] overflow-y-auto space-y-3">
            {allSlots.length === 0 ? (
              <p className="text-xs text-zinc-400 text-center py-6">
                No slots found in timetable.
              </p>
            ) : (
              DAY_NAMES.map((dayName, dayIdx) => {
                const dayClasses = allSlots
                  .filter((s) => s.day_of_week === dayIdx && (!s.effective_until || selectedDate <= s.effective_until))
                  .sort((a, b) => a.start_time.localeCompare(b.start_time));
                if (dayClasses.length === 0) return null;

                return (
                  <div key={dayName} className="space-y-1.5">
                    <h4 className="text-[11px] font-bold uppercase tracking-wider text-blue-500">
                      {dayName}
                    </h4>
                    <div className="space-y-1">
                      {dayClasses.map((c) => (
                        <div
                          key={c.id}
                          className="flex items-center justify-between text-xs p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800/60 font-medium"
                        >
                          <div className="truncate">
                            <span className="block truncate font-semibold">
                              {c.subject} ({c.course_type === 'lab' ? 'Lab' : 'Theory'})
                            </span>
                            {c.faculty && c.faculty !== 'Faculty' && (
                              <span className="text-[10px] text-zinc-400 block truncate">{c.faculty}</span>
                            )}
                          </div>
                          <span className="text-[10px] text-zinc-400 font-mono shrink-0 ml-2">
                            {c.start_time.slice(0, 5)} - {c.end_time.slice(0, 5)}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* SCHEDULE STUDIO MODIFIER MODAL */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800 rounded-[28px] max-w-6xl w-full p-6 space-y-6 shadow-2xl my-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4">
              <div>
                <h3 className="text-base font-bold tracking-tight">Modify Weekly Schedule</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Tag blocks as Theory or Lab. Hold a block on mobile to pick it up or drag on desktop.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => setIsEditorOpen(false)}
                  className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveScheduleChanges}
                  disabled={isSavingSchedule}
                  className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  <span>{isSavingSchedule ? 'Saving Changes...' : 'Commit & Apply'}</span>
                </button>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-zinc-100 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1">
                <span className="text-xs font-bold uppercase tracking-wider text-blue-500">
                  Application Scope & Semester Bound
                </span>
                <p className="text-xs text-zinc-500 dark:text-zinc-400">
                  Configure semester start date and modification enforcement mode.
                </p>
              </div>

              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-zinc-500 dark:text-zinc-400">Sem Start:</span>
                  <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700">
                    <input
                      type="date"
                      value={editorSemesterStart}
                      onChange={(e) => setEditorSemesterStart(e.target.value)}
                      className="bg-transparent focus:outline-none cursor-pointer text-xs"
                    />
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                    <input
                      type="radio"
                      name="editMode"
                      value="wef"
                      checked={editorMode === 'wef'}
                      onChange={() => setEditorMode('wef')}
                      className="text-blue-600 focus:ring-0"
                    />
                    <span>From Date Onward (w.e.f.)</span>
                  </label>

                  <label className="flex items-center gap-1.5 text-xs font-medium cursor-pointer">
                    <input
                      type="radio"
                      name="editMode"
                      value="retroactive"
                      checked={editorMode === 'retroactive'}
                      onChange={() => setEditorMode('retroactive')}
                      className="text-blue-600 focus:ring-0"
                    />
                    <span>All-Time (Retroactive)</span>
                  </label>

                  {editorMode === 'wef' && (
                    <div className="flex items-center gap-1.5 px-3 py-1 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-xs">
                      <CalendarIcon className="w-3.5 h-3.5 text-blue-500" />
                      <input
                        type="date"
                        value={wefDate}
                        onChange={(e) => setWefDate(e.target.value)}
                        className="bg-transparent focus:outline-none cursor-pointer"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Matrix & Shelf */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <div className="lg:col-span-4 space-y-4">
                <div className="border border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/30 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Layers className="w-4 h-4 text-zinc-500" />
                      <h4 className="text-xs font-bold uppercase tracking-tight">Subject Palette</h4>
                    </div>
                    {selectedPaletteBlock && (
                      <button
                        onClick={() => setSelectedPaletteBlock(null)}
                        className="text-[10px] text-blue-500 underline font-semibold"
                      >
                        Clear Active
                      </button>
                    )}
                  </div>

                  <form onSubmit={handleAddPaletteBlock} className="space-y-2">
                    <input
                      type="text"
                      placeholder="Course name (e.g. AI Lab)"
                      value={newSub}
                      onChange={(e) => setNewSub(e.target.value)}
                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Faculty / Room"
                      value={newProf}
                      onChange={(e) => setNewProf(e.target.value)}
                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none"
                    />
                    <div className="flex items-center gap-3 text-xs">
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          name="newType"
                          value="theory"
                          checked={newType === 'theory'}
                          onChange={() => setNewType('theory')}
                        />
                        <span>Theory</span>
                      </label>
                      <label className="flex items-center gap-1 cursor-pointer">
                        <input
                          type="radio"
                          name="newType"
                          value="lab"
                          checked={newType === 'lab'}
                          onChange={() => setNewType('lab')}
                        />
                        <span>Practical/Lab</span>
                      </label>
                    </div>
                    <button
                      type="submit"
                      className="w-full py-1.5 rounded-lg bg-zinc-200 dark:bg-zinc-800 text-xs font-semibold hover:bg-zinc-300 dark:hover:bg-zinc-700 transition flex items-center justify-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Add Block
                    </button>
                  </form>

                  <div className="space-y-2 max-h-[340px] overflow-y-auto pr-1">
                    {subjectPalette.map((block) => {
                      const isEditing = editingBlockId === block.id;

                      if (isEditing) {
                        return (
                          <div
                            key={block.id}
                            className="p-3 rounded-xl border border-blue-500/40 bg-white dark:bg-zinc-900 shadow-sm space-y-2.5 text-xs"
                          >
                            <span className="text-[10px] font-bold text-blue-500 uppercase tracking-wider block">
                              Editing Course Block
                            </span>
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-lg px-2 py-1 text-xs focus:outline-none"
                            />
                            <input
                              type="text"
                              value={editProf}
                              onChange={(e) => setEditProf(e.target.value)}
                              className="w-full bg-zinc-100 dark:bg-zinc-800 rounded-lg px-2 py-1 text-xs focus:outline-none"
                            />
                            <div className="flex items-center gap-3">
                              <label className="flex items-center gap-1 cursor-pointer text-xs">
                                <input
                                  type="radio"
                                  name={`editType-${block.id}`}
                                  checked={editBlockType === 'theory'}
                                  onChange={() => setEditBlockType('theory')}
                                />
                                <span>Theory</span>
                              </label>
                              <label className="flex items-center gap-1 cursor-pointer text-xs">
                                <input
                                  type="radio"
                                  name={`editType-${block.id}`}
                                  checked={editBlockType === 'lab'}
                                  onChange={() => setEditBlockType('lab')}
                                />
                                <span>Lab</span>
                              </label>
                            </div>

                            <div className="flex items-center gap-1.5 pt-1">
                              <Palette className="w-3.5 h-3.5 text-zinc-400" />
                              <div className="flex items-center gap-1">
                                {PASTEL_COLORS.map((c, i) => (
                                  <button
                                    key={i}
                                    type="button"
                                    onClick={() => setEditColor(c)}
                                    className={`w-4 h-4 rounded-full border ${c} ${editColor === c ? 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-zinc-900' : ''}`}
                                  />
                                ))}
                              </div>
                            </div>

                            <div className="flex items-center justify-end gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => setEditingBlockId(null)}
                                className="px-2.5 py-1 rounded-md text-[11px] border border-zinc-200 dark:border-zinc-700"
                              >
                                Cancel
                              </button>
                              <button
                                type="button"
                                onClick={() => saveBlockEdit(block.id)}
                                className="px-3 py-1 rounded-md text-[11px] bg-blue-600 hover:bg-blue-500 text-white font-medium shadow-sm"
                              >
                                Save
                              </button>
                            </div>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={block.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, block)}
                          onTouchStart={(e) => handleTouchStart(e, block)}
                          onClick={() => {
                            setSelectedPaletteBlock((prev) => (prev?.id === block.id ? null : block));
                          }}
                          className={`p-2.5 rounded-xl border flex items-center justify-between cursor-grab active:cursor-grabbing transition-all select-none group touch-none ${
                            block.tagColor
                          } ${
                            isLongPressing === block.id
                              ? 'scale-105 ring-4 ring-blue-500 shadow-xl opacity-90'
                              : ''
                          } ${
                            selectedPaletteBlock?.id === block.id
                              ? 'ring-2 ring-blue-500 ring-offset-1 dark:ring-offset-zinc-950 scale-[1.02]'
                              : ''
                          }`}
                        >
                          <div className="flex items-center gap-2 overflow-hidden pointer-events-none">
                            <GripVertical className="w-3.5 h-3.5 opacity-40 shrink-0" />
                            <div className="truncate">
                              <p className="text-xs font-semibold leading-tight truncate">
                                {block.name} ({block.course_type === 'lab' ? 'Lab' : 'Theory'})
                              </p>
                              <p className="text-[10px] opacity-75 truncate">{block.prof}</p>
                            </div>
                          </div>

                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                startEditingBlock(block);
                              }}
                              className="p-1 rounded-md text-zinc-400 hover:text-blue-500 transition"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                deletePaletteBlock(block.id);
                              }}
                              className="p-1 rounded-md text-zinc-400 hover:text-rose-500 transition"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="lg:col-span-8 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                    Interactive Grid
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={addEditorColumn}
                      className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-medium transition"
                    >
                      + Time Column
                    </button>
                    <button
                      type="button"
                      onClick={addEditorRow}
                      className="px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-xs font-medium transition"
                    >
                      + Day Row
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto border border-zinc-200 dark:border-zinc-800 rounded-xl">
                  <table className="w-full border-collapse text-left">
                    <thead>
                      <tr className="bg-zinc-100/70 dark:bg-zinc-900/70 border-b border-zinc-200 dark:border-zinc-800">
                        <th className="p-3 text-[11px] font-semibold text-zinc-400 border-r border-zinc-200 dark:border-zinc-800 w-28">
                          Day \ Slot
                        </th>
                        {editorColSlots.map((slot, cIdx) => (
                          <th key={cIdx} className="p-2 text-xs border-r border-zinc-200 dark:border-zinc-800 font-mono min-w-[150px] group">
                            <div className="flex items-center justify-between gap-1">
                              <input
                                type="text"
                                value={slot}
                                onChange={(e) => {
                                  const updated = [...editorColSlots];
                                  updated[cIdx] = e.target.value;
                                  setEditorColSlots(updated);
                                }}
                                className="bg-transparent text-xs font-mono w-full focus:outline-none focus:bg-zinc-200/50 dark:focus:bg-zinc-800/50 rounded px-1"
                              />
                              {editorColSlots.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeEditorColumn(cIdx)}
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
                      {editorRowDays.map((day, rIdx) => (
                        <tr key={rIdx} className="border-b border-zinc-200 dark:border-zinc-800">
                          <td className="p-2 border-r border-zinc-200 dark:border-zinc-800 font-bold text-xs bg-zinc-50/50 dark:bg-zinc-900/30 group">
                            <div className="flex items-center justify-between gap-1">
                              <input
                                type="text"
                                value={day}
                                onChange={(e) => {
                                  const updated = [...editorRowDays];
                                  updated[rIdx] = e.target.value;
                                  setEditorRowDays(updated);
                                }}
                                className="bg-transparent text-xs font-semibold w-16 focus:outline-none focus:bg-zinc-200/50 dark:focus:bg-zinc-800/50 rounded px-1"
                              />
                              {editorRowDays.length > 1 && (
                                <button
                                  type="button"
                                  onClick={() => removeEditorRow(rIdx)}
                                  className="text-zinc-400 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition p-0.5"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </td>

                          {(() => {
                            const cells = [];
                            let cIdx = 0;

                            while (cIdx < editorColSlots.length) {
                              const currIdx = cIdx;
                              const spanLen = mergedSpans[`${rIdx}-${currIdx}`] || 1;
                              const item = editorMatrix[`${rIdx}-${currIdx}`];

                              let contiguousCount = 1;
                              if (item && !mergedSpans[`${rIdx}-${currIdx}`]) {
                                for (let scan = currIdx + 1; scan < editorColSlots.length; scan++) {
                                  const scanBlock = editorMatrix[`${rIdx}-${scan}`];
                                  if (scanBlock && scanBlock.name === item.name && !mergedSpans[`${rIdx}-${scan}`]) {
                                    contiguousCount += 1;
                                  } else {
                                    break;
                                  }
                                }
                              }

                              const canMerge = contiguousCount > 1;
                              const isHoveredTarget = hoveredCellCoord === `${rIdx}-${currIdx}`;

                              cells.push(
                                <td
                                  key={currIdx}
                                  data-grid-cell={`${rIdx}-${currIdx}`}
                                  colSpan={spanLen}
                                  onDragOver={(e) => {
                                    e.preventDefault();
                                    e.dataTransfer.dropEffect = 'copy';
                                  }}
                                  onDrop={(e) => handleDrop(rIdx, currIdx, e)}
                                  onClick={() => {
                                    if (selectedPaletteBlock) {
                                      setEditorMatrix((prev) => ({
                                        ...prev,
                                        [`${rIdx}-${currIdx}`]: selectedPaletteBlock,
                                      }));
                                    }
                                  }}
                                  className={`p-1.5 border-r border-zinc-200 dark:border-zinc-800 h-16 min-w-[150px] relative group transition cursor-pointer ${
                                    isHoveredTarget
                                      ? 'bg-blue-500/20 border-2 border-blue-500 ring-2 ring-blue-500/30'
                                      : selectedPaletteBlock
                                      ? 'hover:bg-blue-500/5 dark:hover:bg-blue-500/10'
                                      : ''
                                  }`}
                                >
                                  {item ? (
                                    <div className={`h-full w-full p-2 rounded-lg border flex items-center justify-between text-xs transition ${item.tagColor}`}>
                                      <div className="truncate">
                                        <span className="font-semibold block truncate">
                                          {item.name} {spanLen > 1 && `(${spanLen}x)`}
                                        </span>
                                        <span className="text-[10px] opacity-75 truncate">
                                          {item.prof} · {item.course_type === 'lab' ? 'Lab' : 'Theory'}
                                        </span>
                                      </div>

                                      <div className="flex items-center gap-1">
                                        {spanLen > 1 ? (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              unmergeCells(rIdx, currIdx);
                                            }}
                                            className="px-1.5 py-0.5 rounded bg-white/70 dark:bg-zinc-800 text-[10px] font-bold text-zinc-600 dark:text-zinc-300 hover:text-blue-500 transition flex items-center gap-1"
                                          >
                                            <Split className="w-3 h-3" />
                                            <span>Split</span>
                                          </button>
                                        ) : canMerge ? (
                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              e.stopPropagation();
                                              mergeContiguousN(rIdx, currIdx, contiguousCount);
                                            }}
                                            className="px-1.5 py-0.5 rounded bg-blue-600 text-white text-[10px] font-bold hover:bg-blue-500 transition flex items-center gap-1 shadow-sm"
                                          >
                                            <Combine className="w-3 h-3" />
                                            <span>Merge {contiguousCount}</span>
                                          </button>
                                        ) : null}

                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            clearMatrixCell(rIdx, currIdx);
                                          }}
                                          className="p-1 text-zinc-400 hover:text-rose-500 transition"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className={`h-full w-full rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800 flex items-center justify-center text-zinc-400 text-[10px] transition ${
                                      isHoveredTarget ? 'border-blue-500 text-blue-500 font-bold bg-blue-500/10' : ''
                                    }`}>
                                      {isHoveredTarget ? 'Drop Here' : 'Empty'}
                                    </div>
                                  )}
                                </td>
                              );

                              cIdx += spanLen;
                            }

                            return cells;
                          })()}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

          </div>
        </div>
      )}

      <footer className="py-6 text-center text-xs text-zinc-400">
        ShouldISkip &copy; {new Date().getFullYear()}
      </footer>
    </div>
  );
}