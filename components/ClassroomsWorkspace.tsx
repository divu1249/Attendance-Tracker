'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import RichStudyRenderer from '@/components/RichStudyRenderer';
import { compileStudyPdf } from '@/lib/compileStudyPdf';
import { safeParseStudyJson } from '@/lib/studyJsonParser';
import type { RichStudyResponse } from '@/lib/aiTypes';
import {
  Users,
  Plus,
  Copy,
  CheckCheck,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  FileText,
  Lock,
  Globe,
  ExternalLink,
  Trash2,
  Clock,
  Calendar,
  LogOut,
  Sparkles,
  BookOpen,
  Search,
  KeyRound,
  User,
  Eye,
  FileDown,
  X,
} from 'lucide-react';

interface MasterSlot {
  subject: string;
  faculty?: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  course_type?: 'theory' | 'lab';
}

interface Classroom {
  id: string;
  room_code: string;
  name: string;
  department: string;
  semester: number;
  creator_id: string;
  creator_name: string;
  master_schedule: MasterSlot[];
  created_at: string;
}

interface ClassroomVote {
  id: string;
  classroom_id: string;
  subject: string;
  vote_date: string;
  start_time: string;
  user_id: string;
  voter_name: string;
  choice: 'attend' | 'skip';
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

interface ClassroomsWorkspaceProps {
  user: any;
  profile: any;
  allSlots: any[];
  selectedDate: string;
  onReloadData: () => Promise<void>;
  activeClassroomId?: string | null;
  onSelectClassroom?: (id: string | null) => void;
  notesRefreshKey?: number;
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function getLocalTodayStr(): string {
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60000;
  return new Date(today.getTime() - offset).toISOString().split('T')[0];
}

function getLocalYesterdayStr(baseDateStr: string): string {
  const [y, m, d] = baseDateStr.split('-').map(Number);
  const prev = new Date(y, m - 1, d - 1);
  const yyyy = prev.getFullYear();
  const mm = String(prev.getMonth() + 1).padStart(2, '0');
  const dd = String(prev.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function ClassroomsWorkspace({
  user,
  profile,
  allSlots,
  selectedDate,
  onReloadData,
  activeClassroomId: controlledClassroomId,
  onSelectClassroom,
  notesRefreshKey = 0,
}: ClassroomsWorkspaceProps) {
  const publicName = useMemo(
    () =>
      profile?.full_name?.trim() ||
      profile?.username?.trim() ||
      user?.email?.split('@')[0] ||
      'Student',
    [profile?.full_name, profile?.username, user?.email]
  );

  const [classrooms, setClassrooms] = useState<Classroom[]>([]);
  const [internalClassroomId, setInternalClassroomId] = useState<string | null>(null);
  const activeClassroomId = controlledClassroomId ?? internalClassroomId;

  const setActiveClassroomId = useCallback(
    (id: string | null) => {
      setInternalClassroomId(id);
      if (onSelectClassroom) onSelectClassroom(id);
    },
    [onSelectClassroom]
  );

  const [subTab, setSubTab] = useState<'schedule' | 'notes'>(
    notesRefreshKey > 0 ? 'notes' : 'schedule'
  );
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);

  // Create / Join modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [roomName, setRoomName] = useState('');
  const [roomDept, setRoomDept] = useState(profile?.stream || '');
  const [roomSem, setRoomSem] = useState(profile?.semester || 1);
  const [creatingRoom, setCreatingRoom] = useState(false);

  const [joinCodeInput, setJoinCodeInput] = useState('');
  const [joiningRoom, setJoiningRoom] = useState(false);
  const [syncingTimetable, setSyncingTimetable] = useState(false);
  const [showFullWeek, setShowFullWeek] = useState(false);

  // Votes state
  const [votes, setVotes] = useState<ClassroomVote[]>([]);
  const [memberCount, setMemberCount] = useState<number>(0);

  // Notes state (decoupled Private Vault & Classroom Shared Pool)
  const [notesScope, setNotesScope] = useState<'shared' | 'private'>(
    notesRefreshKey > 0 ? 'private' : 'shared'
  );
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('ALL');
  const [noteSearch, setNoteSearch] = useState('');
  const [privateNotes, setPrivateNotes] = useState<SubjectNote[]>([]);
  const [sharedNotes, setSharedNotes] = useState<SubjectNote[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [viewingNote, setViewingNote] = useState<SubjectNote | null>(null);
  const [downloadingNoteId, setDownloadingNoteId] = useState<string | null>(null);

  // Add note form
  const [showAddNoteModal, setShowAddNoteModal] = useState(false);
  const [noteSubject, setNoteSubject] = useState('');
  const [noteTitle, setNoteTitle] = useState('');
  const [noteUnit, setNoteUnit] = useState('');
  const [noteContent, setNoteContent] = useState('');
  const [noteFileUrl, setNoteFileUrl] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const fetchClassrooms = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: memberships, error: memErr } = await supabase
        .from('classroom_members')
        .select('classroom_id')
        .eq('user_id', user.id);

      if (memErr) throw memErr;

      const ids = (memberships || []).map((m) => m.classroom_id);
      if (ids.length === 0) {
        setClassrooms([]);
        setActiveClassroomId(null);
        setLoading(false);
        return;
      }

      const { data: rooms, error: roomErr } = await supabase
        .from('classrooms')
        .select('*')
        .in('id', ids)
        .order('created_at', { ascending: false });

      if (roomErr) throw roomErr;

      const roomList: Classroom[] = rooms || [];
      setClassrooms(roomList);

      if (roomList.length > 0 && (!activeClassroomId || !roomList.some((r) => r.id === activeClassroomId))) {
        setActiveClassroomId(roomList[0].id);
      }
    } catch (err: any) {
      toast.error('Failed to load classrooms: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, [user, activeClassroomId, setActiveClassroomId]);

  useEffect(() => {
    fetchClassrooms();
  }, [fetchClassrooms]);

  const activeClassroom = useMemo(
    () => classrooms.find((c) => c.id === activeClassroomId) || null,
    [classrooms, activeClassroomId]
  );

  const fetchVotesAndMembers = useCallback(async () => {
    if (!activeClassroomId) {
      setVotes([]);
      setMemberCount(0);
      return;
    }

    const [{ data: voteRows }, { count }] = await Promise.all([
      supabase
        .from('classroom_votes')
        .select('*')
        .eq('classroom_id', activeClassroomId)
        .eq('vote_date', selectedDate),
      supabase
        .from('classroom_members')
        .select('*', { count: 'exact', head: true })
        .eq('classroom_id', activeClassroomId),
    ]);

    setVotes(voteRows || []);
    setMemberCount(count || 0);
  }, [activeClassroomId, selectedDate]);

  useEffect(() => {
    fetchVotesAndMembers();
  }, [fetchVotesAndMembers]);

  const fetchNotes = useCallback(async () => {
    if (!user?.id) return;
    setLoadingNotes(true);
    try {
      // ALWAYS fetch logged-in user's private vault notes regardless of classroom membership
      const privatePromise = supabase
        .from('subject_notes')
        .select('*')
        .eq('user_id', user.id)
        .eq('is_shared', false)
        .order('created_at', { ascending: false });

      const sharedPromise = activeClassroomId
        ? supabase
            .from('subject_notes')
            .select('*')
            .eq('classroom_id', activeClassroomId)
            .eq('is_shared', true)
            .order('created_at', { ascending: false })
        : Promise.resolve({ data: [] as SubjectNote[], error: null });

      const [{ data: privData, error: privErr }, { data: shData, error: shErr }] =
        await Promise.all([privatePromise, sharedPromise]);

      if (privErr) throw privErr;
      if (shErr) throw shErr;

      setPrivateNotes(privData || []);
      setSharedNotes(shData || []);
    } catch (err: any) {
      toast.error('Failed to load notes: ' + err.message);
    } finally {
      setLoadingNotes(false);
    }
  }, [user?.id, activeClassroomId]);

  const prevRefreshKeyRef = useRef(notesRefreshKey);
  useEffect(() => {
    if (notesRefreshKey > 0) {
      setNotesScope('private');
      if (notesRefreshKey !== prevRefreshKeyRef.current) {
        prevRefreshKeyRef.current = notesRefreshKey;
        setSubTab('notes');
      }
    }
  }, [notesRefreshKey]);

  // Automatically switch to Private Vault when user has no classrooms yet
  useEffect(() => {
    if (!loading && classrooms.length === 0) {
      setNotesScope('private');
    }
  }, [loading, classrooms.length]);

  // Fetch private + shared notes independently on user, classroom, subTab, or refreshKey change
  useEffect(() => {
    fetchNotes();
  }, [user?.id, activeClassroomId, subTab, notesRefreshKey, fetchNotes]);

  const notes = useMemo(
    () => (notesScope === 'private' ? privateNotes : sharedNotes),
    [notesScope, privateNotes, sharedNotes]
  );

  // Merge timetable subjects + privateNotes + sharedNotes subjects case-insensitively
  const uniqueSubjects = useMemo(() => {
    const subjectMap = new Map<string, string>();
    const addSubject = (raw?: string | null) => {
      const trimmed = (raw || '').trim();
      if (!trimmed) return;
      const lower = trimmed.toLowerCase();
      if (!subjectMap.has(lower)) {
        subjectMap.set(lower, trimmed);
      }
    };

    allSlots.forEach((s) => addSubject(s.subject));
    activeClassroom?.master_schedule?.forEach((s) => addSubject(s.subject));
    privateNotes.forEach((n) => addSubject(n.subject));
    sharedNotes.forEach((n) => addSubject(n.subject));

    return Array.from(subjectMap.values()).sort((a, b) => a.localeCompare(b));
  }, [allSlots, activeClassroom, privateNotes, sharedNotes]);

  const handleCreateClassroom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !roomName.trim()) return;
    setCreatingRoom(true);

    try {
      const activePersonalSlots = allSlots.filter((s) => !s.effective_until);
      const snapshot: MasterSlot[] = activePersonalSlots.map((s) => ({
        subject: s.subject,
        faculty: s.faculty || 'Faculty',
        day_of_week: s.day_of_week,
        start_time: s.start_time,
        end_time: s.end_time,
        course_type: s.course_type || 'theory',
      }));

      const code = Math.random().toString(36).substring(2, 8).toUpperCase();

      const { data: created, error: createErr } = await supabase
        .from('classrooms')
        .insert({
          room_code: code,
          name: roomName.trim(),
          department: roomDept.trim() || profile?.stream || 'General',
          semester: Number(roomSem) || profile?.semester || 1,
          creator_id: user.id,
          creator_name: publicName,
          master_schedule: snapshot,
        })
        .select()
        .single();

      if (createErr || !created) throw createErr || new Error('Could not create classroom');

      const { error: memErr } = await supabase.from('classroom_members').insert({
        classroom_id: created.id,
        user_id: user.id,
        display_name: publicName,
      });

      if (memErr) throw memErr;

      toast.success(`Classroom "${created.name}" created (Code: ${code})`);
      setRoomName('');
      setShowCreateModal(false);
      setActiveClassroomId(created.id);
      await fetchClassrooms();
    } catch (err: any) {
      toast.error('Failed to create classroom: ' + err.message);
    } finally {
      setCreatingRoom(false);
    }
  };

  const handleJoinClassroom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !joinCodeInput.trim()) return;
    setJoiningRoom(true);

    try {
      const cleanCode = joinCodeInput.trim().toUpperCase();
      const { data: room, error: findErr } = await supabase
        .from('classrooms')
        .select('*')
        .eq('room_code', cleanCode)
        .maybeSingle();

      if (findErr || !room) {
        toast.error('No classroom found with that code.');
        setJoiningRoom(false);
        return;
      }

      const alreadyMember = classrooms.some((c) => c.id === room.id);
      if (alreadyMember) {
        setActiveClassroomId(room.id);
        setJoinCodeInput('');
        toast.success(`Switched to "${room.name}"`);
        setJoiningRoom(false);
        return;
      }

      const { error: memErr } = await supabase.from('classroom_members').insert({
        classroom_id: room.id,
        user_id: user.id,
        display_name: publicName,
      });

      if (memErr) throw memErr;

      toast.success(`Joined "${room.name}"!`);
      setJoinCodeInput('');
      setActiveClassroomId(room.id);
      await fetchClassrooms();
    } catch (err: any) {
      toast.error('Failed to join classroom: ' + err.message);
    } finally {
      setJoiningRoom(false);
    }
  };

  const handleLeaveClassroom = async () => {
    if (!user || !activeClassroom) return;
    try {
      const { error } = await supabase
        .from('classroom_members')
        .delete()
        .eq('classroom_id', activeClassroom.id)
        .eq('user_id', user.id);

      if (error) throw error;
      toast.success(`Left "${activeClassroom.name}".`);
      setActiveClassroomId(null);
      await fetchClassrooms();
    } catch (err: any) {
      toast.error('Failed to leave classroom: ' + err.message);
    }
  };

  // CRITICAL: NEVER DELETE timetable rows! Archive active slots with effective_until = yesterdayDateStr, then insert new slots.
  const handleSyncMasterTimetable = async () => {
    if (!user || !activeClassroom) return;
    const master = activeClassroom.master_schedule || [];
    if (master.length === 0) {
      toast.error('This classroom does not have a master schedule yet.');
      return;
    }

    setSyncingTimetable(true);
    try {
      const todayDateStr = getLocalTodayStr();
      const yesterdayDateStr = getLocalYesterdayStr(todayDateStr);

      const { error: archiveErr } = await supabase
        .from('timetable')
        .update({ effective_until: yesterdayDateStr })
        .eq('user_id', user.id)
        .is('effective_until', null);

      if (archiveErr) throw archiveErr;

      const newRows = master.map((slot) => ({
        user_id: user.id,
        subject: slot.subject,
        faculty: slot.faculty || 'Faculty',
        day_of_week: slot.day_of_week,
        start_time: slot.start_time,
        end_time: slot.end_time,
        course_type: slot.course_type || 'theory',
        effective_from: todayDateStr,
        effective_until: null,
      }));

      const { error: insertErr } = await supabase.from('timetable').insert(newRows);
      if (insertErr) throw insertErr;

      await onReloadData();
      toast.success('Master timetable synced! Your past attendance records are preserved.');
    } catch (err: any) {
      toast.error('Timetable sync failed: ' + err.message);
    } finally {
      setSyncingTimetable(false);
    }
  };

  const handleUpdateMasterFromPersonal = async () => {
    if (!user || !activeClassroom || activeClassroom.creator_id !== user.id) return;
    const activePersonalSlots = allSlots.filter((s) => !s.effective_until);
    if (activePersonalSlots.length === 0) {
      toast.error('Your active timetable has no slots to publish.');
      return;
    }

    const snapshot: MasterSlot[] = activePersonalSlots.map((s) => ({
      subject: s.subject,
      faculty: s.faculty || 'Faculty',
      day_of_week: s.day_of_week,
      start_time: s.start_time,
      end_time: s.end_time,
      course_type: s.course_type || 'theory',
    }));

    const { error } = await supabase
      .from('classrooms')
      .update({ master_schedule: snapshot })
      .eq('id', activeClassroom.id);

    if (error) {
      toast.error('Failed to update master schedule: ' + error.message);
    } else {
      toast.success('Updated classroom master schedule from your active timetable.');
      await fetchClassrooms();
    }
  };

  const handleCastVote = async (slot: MasterSlot, choice: 'attend' | 'skip') => {
    if (!user || !activeClassroom) return;

    const existing = votes.find(
      (v) =>
        v.user_id === user.id &&
        v.subject === slot.subject &&
        v.start_time === slot.start_time
    );

    try {
      if (existing && existing.choice === choice) {
        const { error } = await supabase
          .from('classroom_votes')
          .delete()
          .eq('id', existing.id);
        if (error) throw error;
        setVotes((prev) => prev.filter((v) => v.id !== existing.id));
      } else if (existing) {
        const { data, error } = await supabase
          .from('classroom_votes')
          .update({ choice, voter_name: publicName })
          .eq('id', existing.id)
          .select()
          .single();
        if (error) throw error;
        setVotes((prev) => prev.map((v) => (v.id === existing.id ? data : v)));
      } else {
        const { data, error } = await supabase
          .from('classroom_votes')
          .insert({
            classroom_id: activeClassroom.id,
            subject: slot.subject,
            vote_date: selectedDate,
            start_time: slot.start_time,
            user_id: user.id,
            voter_name: publicName,
            choice,
          })
          .select()
          .single();
        if (error) throw error;
        setVotes((prev) => [...prev, data]);
      }
    } catch (err: any) {
      toast.error('Vote failed: ' + err.message);
    }
  };

  const handleSaveNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !noteSubject.trim() || !noteTitle.trim() || !noteContent.trim()) {
      toast.error('Please fill subject, title, and note content.');
      return;
    }
    if (notesScope === 'shared' && !activeClassroomId) {
      toast.error('Join or select a classroom to post shared notes.');
      return;
    }

    setSavingNote(true);
    try {
      const { error } = await supabase.from('subject_notes').insert({
        user_id: user.id,
        author_name: publicName,
        classroom_id: notesScope === 'shared' ? activeClassroomId : null,
        subject: noteSubject.trim(),
        title: noteTitle.trim(),
        unit_tag: noteUnit.trim() || null,
        content: noteContent.trim(),
        file_url: noteFileUrl.trim() || null,
        is_shared: notesScope === 'shared',
      });

      if (error) throw error;

      toast.success(
        notesScope === 'shared'
          ? 'Note shared with classroom pool!'
          : 'Note saved to your private vault.'
      );
      setNoteTitle('');
      setNoteUnit('');
      setNoteContent('');
      setNoteFileUrl('');
      setShowAddNoteModal(false);
      await fetchNotes();
    } catch (err: any) {
      toast.error('Failed to save note: ' + err.message);
    } finally {
      setSavingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    try {
      const { error } = await supabase.from('subject_notes').delete().eq('id', noteId);
      if (error) throw error;
      setPrivateNotes((prev) => prev.filter((n) => n.id !== noteId));
      setSharedNotes((prev) => prev.filter((n) => n.id !== noteId));
      if (viewingNote?.id === noteId) setViewingNote(null);
      toast.success('Note deleted.');
    } catch (err: any) {
      toast.error('Failed to delete note: ' + err.message);
    }
  };

  const handleDownloadNotePdf = (note: SubjectNote) => {
    setDownloadingNoteId(note.id);
    try {
      const parsedJson = safeParseStudyJson<RichStudyResponse>(note.content);
      const studyPayload: RichStudyResponse =
        parsedJson && typeof parsedJson === 'object' && (parsedJson.title || parsedJson.explanation_markdown)
          ? {
              ...parsedJson,
              title: parsedJson.title || note.title,
              subject_tag: parsedJson.subject_tag || note.subject,
            }
          : {
              title: note.title,
              subject_tag: note.subject,
              core_intuition: '',
              explanation_markdown: note.content || '',
              key_takeaways: [],
              exam_tips: [],
              references: [],
            };

      const { blob, filename } = compileStudyPdf(studyPayload, note.subject);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('PDF downloaded!');
    } catch (err: any) {
      toast.error('Could not compile PDF: ' + (err?.message || 'Unknown error'));
    } finally {
      setDownloadingNoteId(null);
    }
  };

  const [selY, selM, selD] = selectedDate.split('-').map(Number);
  const selectedDayOfWeek = new Date(selY, selM - 1, selD, 12, 0, 0).getDay();

  const todayMasterSlots = useMemo(() => {
    if (!activeClassroom?.master_schedule) return [];
    return activeClassroom.master_schedule
      .filter((s) => s.day_of_week === selectedDayOfWeek)
      .sort((a, b) => a.start_time.localeCompare(b.start_time));
  }, [activeClassroom, selectedDayOfWeek]);

  const filteredNotes = useMemo(() => {
    return notes.filter((n) => {
      if (
        selectedSubjectFilter !== 'ALL' &&
        n.subject.trim().toLowerCase() !== selectedSubjectFilter.trim().toLowerCase()
      ) {
        return false;
      }
      if (noteSearch.trim()) {
        const q = noteSearch.toLowerCase();
        return (
          n.title.toLowerCase().includes(q) ||
          n.content.toLowerCase().includes(q) ||
          n.subject.toLowerCase().includes(q) ||
          (n.unit_tag && n.unit_tag.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [notes, selectedSubjectFilter, noteSearch]);

  if (loading) {
    return (
      <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-8 rounded-[28px] border border-zinc-200 dark:border-zinc-800 text-center text-xs text-zinc-400">
        Loading classrooms & notes workspace...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Classroom Switcher & Join/Create Bar */}
      <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-6 rounded-[24px] md:rounded-[28px] border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-500" />
              <h2 className="text-base font-bold tracking-tight">Classrooms & Shared Notes</h2>
            </div>
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
              Sync section schedules safely, vote on live class consensus, and pool subject notes.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <form onSubmit={handleJoinClassroom} className="flex items-center gap-1.5">
              <div className="relative">
                <KeyRound className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Room Code"
                  maxLength={6}
                  value={joinCodeInput}
                  onChange={(e) => setJoinCodeInput(e.target.value.toUpperCase())}
                  className="w-32 uppercase font-mono tracking-wider bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-full pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/30"
                />
              </div>
              <button
                type="submit"
                disabled={joiningRoom || !joinCodeInput.trim()}
                className="px-4 py-1.5 rounded-full bg-zinc-200 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 disabled:opacity-50 text-xs font-semibold transition"
              >
                {joiningRoom ? 'Joining...' : 'Join'}
              </button>
            </form>

            <button
              type="button"
              onClick={() => {
                setRoomDept(profile?.stream || '');
                setRoomSem(profile?.semester || 1);
                setShowCreateModal(true);
              }}
              className="px-4 py-1.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create Classroom</span>
            </button>
          </div>
        </div>

        {/* Joined Classrooms Pills */}
        {classrooms.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap pt-1 border-t border-zinc-200 dark:border-zinc-800">
            {classrooms.map((room) => {
              const isSelected = room.id === activeClassroomId;
              return (
                <button
                  key={room.id}
                  type="button"
                  onClick={() => setActiveClassroomId(room.id)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition border flex items-center gap-2 ${
                    isSelected
                      ? 'bg-blue-600 text-white border-transparent shadow-sm'
                      : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:border-blue-500/40'
                  }`}
                >
                  <span>{room.name}</span>
                  <span
                    className={`font-mono text-[10px] px-1.5 py-0.5 rounded-full ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'
                    }`}
                  >
                    {room.room_code}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Sub-Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="inline-flex p-1 rounded-full bg-white/80 dark:bg-zinc-900/80 border border-zinc-200 dark:border-zinc-800 backdrop-blur-xl">
          <button
            type="button"
            onClick={() => setSubTab('schedule')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition flex items-center gap-1.5 ${
              subTab === 'schedule'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Schedule & Bunk Poll</span>
          </button>
          <button
            type="button"
            onClick={() => setSubTab('notes')}
            className={`px-4 py-1.5 rounded-full text-xs font-semibold transition flex items-center gap-1.5 ${
              subTab === 'notes'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Subject Notes Pool</span>
            {privateNotes.length > 0 && (
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] font-bold tabular-nums ${
                  subTab === 'notes'
                    ? 'bg-white/20 text-white'
                    : 'bg-purple-500/15 text-purple-600 dark:text-purple-400'
                }`}
              >
                {privateNotes.length}
              </span>
            )}
          </button>
        </div>

        {activeClassroom && (
          <div className="flex items-center gap-2 text-xs">
            <span className="px-3 py-1.5 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-500 font-medium">
              {activeClassroom.department} · Sem {activeClassroom.semester} · {memberCount} member{memberCount === 1 ? '' : 's'}
            </span>
            <button
              type="button"
              onClick={() => {
                navigator.clipboard.writeText(activeClassroom.room_code);
                setCopiedCode(true);
                setTimeout(() => setCopiedCode(false), 2000);
                toast.success('Classroom code copied!');
              }}
              className="px-3 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-600 dark:text-blue-400 font-mono font-bold flex items-center gap-1.5 hover:bg-blue-500/20 transition"
            >
              {copiedCode ? <CheckCheck className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{activeClassroom.room_code}</span>
            </button>
            <button
              type="button"
              onClick={handleLeaveClassroom}
              className="p-2 rounded-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 text-zinc-400 hover:text-rose-500 transition"
              title="Leave Classroom"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* SUB-TAB 1: SCHEDULE & BUNK POLL */}
      {subTab === 'schedule' && (
        <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-6 rounded-[24px] md:rounded-[28px] border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-5">
          {!activeClassroom ? (
            <div className="py-12 text-center space-y-3">
              <Users className="w-10 h-10 mx-auto text-zinc-400" />
              <h3 className="text-sm font-bold">No Classroom Selected</h3>
              <p className="text-xs text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
                Create a classroom from your active timetable or enter a 6-character room code above to collaborate with classmates.
              </p>
            </div>
          ) : (
            <>
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4">
                <div>
                  <h3 className="text-sm font-bold tracking-tight">
                    {DAY_NAMES[selectedDayOfWeek]} ({selectedDate}) — Live Bunk Consensus
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Created by {activeClassroom.creator_name} · Vote whether the class is attending or skipping.
                  </p>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setShowFullWeek(!showFullWeek)}
                    className="px-3 py-1.5 rounded-xl bg-zinc-200/70 dark:bg-zinc-800/70 text-xs font-semibold hover:opacity-80 transition"
                  >
                    {showFullWeek ? 'Show Selected Day' : 'Preview Full Week'}
                  </button>

                  {activeClassroom.creator_id === user.id && (
                    <button
                      type="button"
                      onClick={handleUpdateMasterFromPersonal}
                      className="px-3 py-1.5 rounded-xl bg-zinc-200/70 dark:bg-zinc-800/70 text-xs font-semibold hover:opacity-80 transition"
                      title="Overwrite classroom master schedule with your current personal timetable"
                    >
                      Push My Timetable
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handleSyncMasterTimetable}
                    disabled={syncingTimetable}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${syncingTimetable ? 'animate-spin' : ''}`} />
                    <span>
                      {syncingTimetable ? 'Syncing...' : 'Sync Master Timetable to My Dashboard'}
                    </span>
                  </button>
                </div>
              </div>

              {showFullWeek ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {DAY_NAMES.map((dayName, dayIdx) => {
                    const dayItems = (activeClassroom.master_schedule || [])
                      .filter((s) => s.day_of_week === dayIdx)
                      .sort((a, b) => a.start_time.localeCompare(b.start_time));
                    if (dayItems.length === 0) return null;

                    return (
                      <div
                        key={dayName}
                        className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-2"
                      >
                        <h4 className="text-xs font-bold uppercase tracking-wider text-blue-500">
                          {dayName}
                        </h4>
                        <div className="space-y-1.5">
                          {dayItems.map((slot, idx) => (
                            <div
                              key={`${dayIdx}-${idx}`}
                              className="flex items-center justify-between text-xs p-2 rounded-xl bg-zinc-50 dark:bg-zinc-800/60"
                            >
                              <div className="truncate">
                                <span className="font-semibold">{slot.subject}</span>
                                <span className="text-[10px] text-zinc-400 ml-1.5 uppercase">
                                  ({slot.course_type || 'theory'})
                                </span>
                              </div>
                              <span className="text-[10px] font-mono text-zinc-400 shrink-0 ml-2">
                                {slot.start_time.slice(0, 5)} – {slot.end_time.slice(0, 5)}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : todayMasterSlots.length === 0 ? (
                <div className="py-10 text-center text-xs text-zinc-400">
                  No classes scheduled in this classroom on {DAY_NAMES[selectedDayOfWeek]}s.
                </div>
              ) : (
                <div className="space-y-3">
                  {todayMasterSlots.map((slot, idx) => {
                    const slotVotes = votes.filter(
                      (v) => v.subject === slot.subject && v.start_time === slot.start_time
                    );
                    const attendVotes = slotVotes.filter((v) => v.choice === 'attend');
                    const skipVotes = slotVotes.filter((v) => v.choice === 'skip');
                    const totalSlotVotes = slotVotes.length;
                    const attendPct = totalSlotVotes > 0 ? (attendVotes.length / totalSlotVotes) * 100 : 50;
                    const myVote = slotVotes.find((v) => v.user_id === user.id);

                    return (
                      <div
                        key={`${slot.subject}-${slot.start_time}-${idx}`}
                        className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 hover:shadow-sm transition space-y-3"
                      >
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-sm tracking-tight">{slot.subject}</span>
                              <span
                                className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded border ${
                                  slot.course_type === 'lab'
                                    ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20'
                                    : 'bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20'
                                }`}
                              >
                                {slot.course_type === 'lab' ? 'Lab' : 'Theory'}
                              </span>
                              {slot.faculty && slot.faculty !== 'Faculty' && (
                                <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
                                  · {slot.faculty}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 text-xs text-zinc-400 font-mono mt-1">
                              <Clock className="w-3.5 h-3.5" />
                              <span>
                                {slot.start_time.slice(0, 5)} – {slot.end_time.slice(0, 5)}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 self-end sm:self-center">
                            <button
                              type="button"
                              onClick={() => handleCastVote(slot, 'attend')}
                              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                                myVote?.choice === 'attend'
                                  ? 'bg-emerald-600 text-white shadow-sm'
                                  : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
                              }`}
                            >
                              <ThumbsUp className="w-3.5 h-3.5" />
                              <span>Take Class ({attendVotes.length})</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleCastVote(slot, 'skip')}
                              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition ${
                                myVote?.choice === 'skip'
                                  ? 'bg-rose-600 text-white shadow-sm'
                                  : 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20 hover:bg-rose-500/20'
                              }`}
                            >
                              <ThumbsDown className="w-3.5 h-3.5" />
                              <span>Leave Class ({skipVotes.length})</span>
                            </button>
                          </div>
                        </div>

                        {/* Live Consensus Bar */}
                        <div className="space-y-2">
                          <div className="flex h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                            {totalSlotVotes === 0 ? (
                              <div className="w-full bg-zinc-200 dark:bg-zinc-800" />
                            ) : (
                              <>
                                <div
                                  style={{ width: `${attendPct}%` }}
                                  className="bg-emerald-500 transition-all duration-300"
                                />
                                <div
                                  style={{ width: `${100 - attendPct}%` }}
                                  className="bg-rose-500 transition-all duration-300"
                                />
                              </>
                            )}
                          </div>

                          {totalSlotVotes > 0 && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              {attendVotes.map((v) => (
                                <span
                                  key={v.id}
                                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20"
                                >
                                  ✓ {v.voter_name}
                                </span>
                              ))}
                              {skipVotes.map((v) => (
                                <span
                                  key={v.id}
                                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/20"
                                >
                                  ✕ {v.voter_name}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* SUB-TAB 2: SUBJECT NOTES POOL */}
      {subTab === 'notes' && (
        <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-6 rounded-[24px] md:rounded-[28px] border border-zinc-200 dark:border-zinc-800 shadow-sm space-y-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setNotesScope('shared')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition flex items-center gap-1.5 border ${
                  notesScope === 'shared'
                    ? 'bg-blue-600 text-white border-transparent'
                    : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                <Globe className="w-3.5 h-3.5" />
                <span>Classroom Shared Notes</span>
              </button>
              <button
                type="button"
                onClick={() => setNotesScope('private')}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition flex items-center gap-1.5 border ${
                  notesScope === 'private'
                    ? 'bg-purple-600 text-white border-transparent'
                    : 'bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400'
                }`}
              >
                <Lock className="w-3.5 h-3.5" />
                <span>My Private Vault ({privateNotes.length})</span>
              </button>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  placeholder="Search notes or units..."
                  value={noteSearch}
                  onChange={(e) => setNoteSearch(e.target.value)}
                  className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-full pl-8 pr-3 py-1.5 text-xs focus:outline-none"
                />
              </div>
              <button
                type="button"
                onClick={() => {
                  setNoteSubject(
                    selectedSubjectFilter !== 'ALL'
                      ? selectedSubjectFilter
                      : uniqueSubjects[0] || ''
                  );
                  setShowAddNoteModal(true);
                }}
                disabled={notesScope === 'shared' && !activeClassroomId}
                className="px-4 py-1.5 rounded-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Post Note</span>
              </button>
            </div>
          </div>

          {/* Subject Pills */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => setSelectedSubjectFilter('ALL')}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold transition ${
                selectedSubjectFilter === 'ALL'
                  ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                  : 'bg-zinc-200/70 dark:bg-zinc-800/70 text-zinc-600 dark:text-zinc-400'
              }`}
            >
              All Subjects
            </button>
            {uniqueSubjects.map((sub) => {
              const isSelected =
                selectedSubjectFilter !== 'ALL' &&
                selectedSubjectFilter.trim().toLowerCase() === sub.trim().toLowerCase();
              return (
                <button
                  key={sub}
                  type="button"
                  onClick={() => setSelectedSubjectFilter(sub)}
                  className={`px-3 py-1 rounded-full text-[11px] font-semibold transition ${
                    isSelected
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                      : 'bg-zinc-200/70 dark:bg-zinc-800/70 text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  {sub}
                </button>
              );
            })}
          </div>

          {notesScope === 'shared' && !activeClassroomId ? (
            <div className="py-12 text-center text-xs text-zinc-400 space-y-2">
              <p>Join or create a classroom above to view and share notes with classmates.</p>
              <button
                type="button"
                onClick={() => setNotesScope('private')}
                className="px-4 py-1.5 rounded-full bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold transition"
              >
                Open My Private Vault ({privateNotes.length})
              </button>
            </div>
          ) : loadingNotes ? (
            <div className="py-12 text-center text-xs text-zinc-400">Loading notes...</div>
          ) : filteredNotes.length === 0 ? (
            <div className="py-12 text-center space-y-2">
              <FileText className="w-8 h-8 mx-auto text-zinc-400" />
              <p className="text-xs font-semibold text-zinc-600 dark:text-zinc-300">
                No notes found in {notesScope === 'shared' ? 'this classroom pool' : 'your private vault'}.
              </p>
              <p className="text-[11px] text-zinc-400">
                Click &ldquo;Post Note&rdquo; to add personal notes, or save AI study guides from the AI Copilot.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredNotes.map((note) => {
                const isAiGenerated = note.unit_tag === 'AI Generated';
                return (
                  <div
                    key={note.id}
                    className="bg-white dark:bg-zinc-900 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 hover:shadow-sm transition flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                            {note.subject}
                          </span>

                          {isAiGenerated ? (
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/25 flex items-center gap-1">
                              <Sparkles className="w-3 h-3" />
                              <span>AI Generated</span>
                            </span>
                          ) : (
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                              <User className="w-3 h-3" />
                              <span>Uploaded by Me</span>
                            </span>
                          )}

                          {note.unit_tag && !isAiGenerated && (
                            <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-300/60 dark:border-zinc-700">
                              {note.unit_tag}
                            </span>
                          )}
                        </div>

                        {note.user_id === user.id && (
                          <button
                            type="button"
                            onClick={() => handleDeleteNote(note.id)}
                            className="p-1 text-zinc-400 hover:text-rose-500 transition shrink-0"
                            title="Delete note"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <h4 className="text-sm font-bold tracking-tight">{note.title}</h4>
                      <p className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap leading-relaxed line-clamp-4">
                        {note.content}
                      </p>
                    </div>

                    <div className="space-y-2.5 pt-2 border-t border-zinc-100 dark:border-zinc-800">
                      <div className="flex items-center justify-between text-[11px] text-zinc-400 gap-2 flex-wrap">
                        <span>
                          By <strong className="text-zinc-600 dark:text-zinc-300">{note.author_name}</strong> ·{' '}
                          {new Date(note.created_at).toLocaleDateString()}
                        </span>

                        {note.file_url && (
                          <a
                            href={note.file_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-500 hover:underline font-semibold flex items-center gap-1"
                          >
                            <FileText className="w-3 h-3" />
                            <span>Resource</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>

                      <div className="flex items-center gap-2 flex-wrap">
                        <button
                          type="button"
                          onClick={() => setViewingNote(note)}
                          className="flex-1 min-w-[110px] px-3 py-1.5 rounded-xl bg-blue-600/10 hover:bg-blue-600/20 text-blue-600 dark:text-blue-400 border border-blue-500/20 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>View Note</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDownloadNotePdf(note)}
                          disabled={downloadingNoteId === note.id}
                          className="flex-1 min-w-[120px] px-3 py-1.5 rounded-xl bg-emerald-600/10 hover:bg-emerald-600/20 disabled:opacity-50 text-emerald-700 dark:text-emerald-400 border border-emerald-500/25 text-xs font-semibold flex items-center justify-center gap-1.5 transition"
                        >
                          <FileDown className="w-3.5 h-3.5" />
                          <span>
                            {downloadingNoteId === note.id ? 'Exporting...' : 'Download PDF'}
                          </span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL: CREATE CLASSROOM */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800 rounded-[28px] max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-bold">Create Shared Classroom</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="w-6 h-6 rounded-full bg-zinc-200/60 dark:bg-zinc-800/60 text-xs flex items-center justify-center text-zinc-500"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateClassroom} className="space-y-4">
              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-400">Classroom Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. CSE-AIML Section B"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-400">Department</label>
                  <input
                    type="text"
                    value={roomDept}
                    onChange={(e) => setRoomDept(e.target.value)}
                    placeholder="B.Tech CSE"
                    className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-400">Semester</label>
                  <input
                    type="number"
                    min="1"
                    max="12"
                    value={roomSem}
                    onChange={(e) => setRoomSem(Number(e.target.value))}
                    className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none"
                  />
                </div>
              </div>

              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-900 p-3 rounded-xl border border-zinc-200 dark:border-zinc-800">
                Your current active timetable ({allSlots.filter((s) => !s.effective_until).length} slots) will be snapshotted as this classroom&apos;s Master Schedule.
              </p>

              <button
                type="submit"
                disabled={creatingRoom}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition shadow-sm"
              >
                {creatingRoom ? 'Creating...' : 'Create & Generate Room Code'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: POST NOTE */}
      {showAddNoteModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800 rounded-[28px] max-w-lg w-full p-6 space-y-5 shadow-2xl my-8">
            <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-blue-500" />
                <h3 className="text-sm font-bold">
                  {notesScope === 'shared' ? 'Post to Classroom Notes Pool' : 'Save to Private Vault'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowAddNoteModal(false)}
                className="w-6 h-6 rounded-full bg-zinc-200/60 dark:bg-zinc-800/60 text-xs flex items-center justify-center text-zinc-500"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveNote} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-400">Subject</label>
                  <input
                    type="text"
                    required
                    list="classroom-subjects-list"
                    placeholder="e.g. Operating Systems"
                    value={noteSubject}
                    onChange={(e) => setNoteSubject(e.target.value)}
                    className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none"
                  />
                  <datalist id="classroom-subjects-list">
                    {uniqueSubjects.map((sub) => (
                      <option key={sub} value={sub} />
                    ))}
                  </datalist>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-400">Unit / Tag (Optional)</label>
                  <input
                    type="text"
                    placeholder="e.g. Unit 3 - Deadlocks"
                    value={noteUnit}
                    onChange={(e) => setNoteUnit(e.target.value)}
                    className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-400">Title</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Banker's Algorithm Solved Notes"
                  value={noteTitle}
                  onChange={(e) => setNoteTitle(e.target.value)}
                  className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-400">Notes / Key Takeaways</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Write summary, formulas, or important exam questions..."
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none resize-y"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold text-zinc-400">Drive / PDF Link (Optional)</label>
                <input
                  type="url"
                  placeholder="https://drive.google.com/..."
                  value={noteFileUrl}
                  onChange={(e) => setNoteFileUrl(e.target.value)}
                  className="w-full bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={savingNote}
                className="w-full py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold transition shadow-sm"
              >
                {savingNote ? 'Saving...' : 'Publish Note'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: GLASSMORPHIC NOTE READER WITH KATEX + ON-DEMAND PDF DOWNLOAD */}
      {viewingNote && (
        <div
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setViewingNote(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="backdrop-blur-xl bg-white/95 dark:bg-[#121214]/95 border border-zinc-200 dark:border-zinc-800 rounded-[28px] max-w-3xl w-full max-h-[88vh] flex flex-col shadow-2xl overflow-hidden"
          >
            <div className="px-6 py-4 border-b border-zinc-200 dark:border-zinc-800 flex items-start justify-between gap-3 shrink-0">
              <div className="space-y-1.5 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                    {viewingNote.subject}
                  </span>
                  {viewingNote.unit_tag === 'AI Generated' ? (
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-600 dark:text-purple-400 border border-purple-500/25 flex items-center gap-1">
                      <Sparkles className="w-3 h-3" />
                      <span>AI Generated</span>
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                      <User className="w-3 h-3" />
                      <span>Uploaded by Me</span>
                    </span>
                  )}
                  {viewingNote.unit_tag && viewingNote.unit_tag !== 'AI Generated' && (
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                      {viewingNote.unit_tag}
                    </span>
                  )}
                </div>
                <h3 className="text-base font-extrabold tracking-tight text-zinc-900 dark:text-zinc-100">
                  {viewingNote.title}
                </h3>
                <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                  By {viewingNote.author_name} ·{' '}
                  {new Date(viewingNote.created_at).toLocaleDateString()}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleDownloadNotePdf(viewingNote)}
                  disabled={downloadingNoteId === viewingNote.id}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  <span>
                    {downloadingNoteId === viewingNote.id ? 'Exporting...' : 'Download PDF'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewingNote(null)}
                  aria-label="Close Note Reader"
                  className="w-8 h-8 rounded-full bg-zinc-200/70 dark:bg-zinc-800/70 hover:opacity-80 flex items-center justify-center text-zinc-500 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-6">
              <RichStudyRenderer content={viewingNote.content} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
