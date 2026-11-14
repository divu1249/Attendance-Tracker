'use client';

import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { SyncEngine } from '@/lib/syncEngine';
import { buildRichStudyMarkdown } from '@/lib/compileStudyPdf';
import { safeParseStudyJson, looksLikeRawJsonObject } from '@/lib/studyJsonParser';
import { toast } from 'sonner';
import RichStudyRenderer, { type RichStudyResponse } from '@/components/RichStudyRenderer';
import {
  Sparkles,
  X,
  Camera,
  BookOpen,
  Globe,
  CheckCircle2,
  Trash2,
  Send,
  Layers,
  AlertTriangle,
  RotateCw,
  ChevronLeft,
  ChevronRight,
  FileDown,
  Wand2,
  Lock,
  Upload,
  Clock,
  Download,
  Share2,
  Copy,
  Check,
  Link2,
} from 'lucide-react';

interface StagedItem {
  id: string;
  subject: string;
  title?: string;
  date?: string;
  due_date?: string;
  start_time?: string;
  end_time?: string;
  room_no?: string;
  description?: string;
  syllabus_topics?: string[];
  classes_optional?: boolean;
  status?: 'present' | 'absent' | 'od';
}

interface TutorTurn {
  id: string;
  subject: string;
  topic: string;
  question: string;
  engine?: string;
  response: RichStudyResponse;
  createdAt: string;
}

interface PersonalNoteSnippet {
  id: string;
  title: string;
  unit_tag?: string | null;
  content: string;
}

interface AiCopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  profile: any;
  allSlots: any[];
  selectedDate: string;
  initialTab?: 'snap' | 'notes' | 'tutor';
  initialTopic?: string;
  initialSubject?: string;
  onDataMutated?: () => Promise<void> | void;
  onNoteSaved?: () => Promise<void> | void;
}

export default function AiCopilotDrawer({
  isOpen,
  onClose,
  user,
  profile,
  allSlots,
  selectedDate,
  initialTab = 'snap',
  initialTopic = '',
  initialSubject = '',
  onDataMutated,
  onNoteSaved,
}: AiCopilotDrawerProps) {
  const [tab, setTab] = useState<'snap' | 'notes' | 'tutor'>(initialTab);

  // Clean inline Token-Limit Alert State (shown exclusively on 429 TOKEN_LIMIT_EXCEEDED)
  const [quotaAlert, setQuotaAlert] = useState<{
    message: string;
    retryAfter: number;
    lastUnansweredQuery?: string;
  } | null>(null);

  const hasQuotaAlert = quotaAlert !== null;

  useEffect(() => {
    if (!hasQuotaAlert) return;
    const timer = setInterval(() => {
      setQuotaAlert((prev) => {
        if (!prev) return null;
        const nextSeconds = prev.retryAfter - 1;
        return nextSeconds <= 0 ? null : { ...prev, retryAfter: nextSeconds };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [hasQuotaAlert]);

  const publicName = useMemo(
    () => profile?.full_name?.trim() || profile?.username?.trim() || 'Student',
    [profile?.full_name, profile?.username]
  );

  const uniqueSubjects = useMemo(() => {
    const set = new Set<string>();
    allSlots.forEach((s) => {
      if (s.subject) set.add(s.subject);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [allSlots]);

  const getAuthHeaders = useCallback(async (): Promise<Record<string, string>> => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.access_token) {
        headers.Authorization = `Bearer ${data.session.access_token}`;
      }
    } catch {
      // Ignore
    }
    return headers;
  }, []);

  // =========================================================================
  // TAB 1: PERSONAL RECORD ORGANIZER (SNAP-TO-LEDGER)
  // =========================================================================
  const [snapPrompt, setSnapPrompt] = useState('');
  const [snapImageDataUrl, setSnapImageDataUrl] = useState<string | null>(null);
  const [snapImageMime, setSnapImageMime] = useState<string>('image/png');
  const [parsingRecords, setParsingRecords] = useState(false);
  const [stagedType, setStagedType] = useState<'exam' | 'assignment' | 'attendance'>('assignment');
  const [stagedSummary, setStagedSummary] = useState('');
  const [stagedItems, setStagedItems] = useState<StagedItem[]>([]);
  const [committingStaged, setCommittingStaged] = useState(false);
  const snapFileRef = useRef<HTMLInputElement | null>(null);

  // =========================================================================
  // TAB 2: PRIVATE EXAM STUDY STUDIO (NOTES-FIRST SYNTHESIS)
  // =========================================================================
  const [studySubject, setStudySubject] = useState(initialSubject || uniqueSubjects[0] || '');
  const [studyMode, setStudyMode] = useState<'summary' | 'gap_analysis' | 'flashcards'>('summary');
  const [customSyllabusInput, setCustomSyllabusInput] = useState('');
  const [loadedNotesCount, setLoadedNotesCount] = useState<number | null>(null);
  const [attachedNotes, setAttachedNotes] = useState<PersonalNoteSnippet[]>([]);
  const [loadedSyllabusTopics, setLoadedSyllabusTopics] = useState<string[]>([]);
  const [synthesizing, setSynthesizing] = useState(false);
  const [studyResult, setStudyResult] = useState<any>(null);
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [flashcardFlipped, setFlashcardFlipped] = useState(false);
  const [studySaveSubject, setStudySaveSubject] = useState('');

  // =========================================================================
  // TAB 3: PRIVATE WEB-GROUNDED STUDY TUTOR (MULTI-TURN SESSION)
  // =========================================================================
  const [tutorSubject, setTutorSubject] = useState(initialSubject || uniqueSubjects[0] || '');
  const [tutorTopic, setTutorTopic] = useState(initialTopic || '');
  const [tutorQuestion, setTutorQuestion] = useState('');
  const [tutorLoading, setTutorLoading] = useState(false);
  const [tutorHistory, setTutorHistory] = useState<TutorTurn[]>([]);
  const [turnSaveSubjects, setTurnSaveSubjects] = useState<Record<string, string>>({});
  const [savingVaultKey, setSavingVaultKey] = useState<string | null>(null);
  const [savedToVaultKeys, setSavedToVaultKeys] = useState<Record<string, boolean>>({});
  const [customSubjectModes, setCustomSubjectModes] = useState<Record<string, boolean>>({});

  // =========================================================================
  // SHAREABLE UNIVERSAL AI STUDY LINK MODAL
  // =========================================================================
  const [sharingSession, setSharingSession] = useState(false);
  const [shareModalData, setShareModalData] = useState<{
    shareUrl: string;
    shareCode: string;
    transcriptMd: string;
    savedToDb: boolean;
  } | null>(null);
  const [copiedShareLink, setCopiedShareLink] = useState(false);
  const [copiedShareText, setCopiedShareText] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
      if (initialSubject) {
        setStudySubject(initialSubject);
        setStudySaveSubject(initialSubject);
        setTutorSubject(initialSubject);
      } else if (!studySubject && uniqueSubjects[0]) {
        setStudySubject(uniqueSubjects[0]);
        setStudySaveSubject(uniqueSubjects[0]);
        setTutorSubject(uniqueSubjects[0]);
      }
      if (initialTopic) {
        setTutorTopic(initialTopic);
      }
    }
  }, [isOpen, initialTab, initialTopic, initialSubject, uniqueSubjects, studySubject]);

  const activeSubject = useMemo(() => {
    if (tab === 'tutor' && tutorSubject.trim()) return tutorSubject.trim();
    if (studySubject.trim()) return studySubject.trim();
    return uniqueSubjects[0] || 'General';
  }, [tab, tutorSubject, studySubject, uniqueSubjects]);

  const parseApiJsonResponse = useCallback(async (res: Response) => {
    const rawText = await res.text();
    try {
      return JSON.parse(rawText);
    } catch {
      // Server returned HTML (e.g., 404/500/504) instead of JSON
      throw new Error(
        res.status === 404
          ? 'AI endpoint (/api/ai) not found. Please rebuild or redeploy.'
          : res.status === 504
          ? 'AI request timed out. Please try a shorter question.'
          : `Server returned non-JSON response (HTTP ${res.status}). Check GEMINI_API_KEY / GROQ_API_KEY.`
      );
    }
  }, []);

  const handleQuotaErrorResponse = useCallback(
    (status: number, data: any, lastQuery?: string): boolean => {
      if (data?.error_code === 'TOKEN_LIMIT_EXCEEDED' || status === 429) {
        setQuotaAlert({
          message:
            data?.message ||
            'Built-in free AI token limit reached for now. Please wait a minute to retry, or copy your question and notes to continue in ChatGPT or Google Gemini while the quota resets.',
          retryAfter: Number(data?.retryAfterSeconds) || 45,
          lastUnansweredQuery: lastQuery,
        });
        return true;
      }
      return false;
    },
    []
  );

  // =========================================================================
  // STUDY SESSION EXPORT (.MD), SHARE & CLIPBOARD COPY ON QUOTA RESET
  // =========================================================================
  const buildSessionMarkdown = useCallback(() => {
    const sections: string[] = [
      `# ShouldISkip Study Session — ${activeSubject}`,
      `Date: ${selectedDate || new Date().toISOString().split('T')[0]}`,
      '',
    ];

    if (studyResult) {
      sections.push(`## Private Study Studio: ${studyResult.title || activeSubject}`);
      if (studyResult.richStudy) {
        sections.push(buildRichStudyMarkdown(studyResult.richStudy));
      } else if (studyResult.overview) {
        sections.push(studyResult.overview);
      }

      if (
        Array.isArray(studyResult.sections) &&
        studyResult.sections.length > 0 &&
        !studyResult.richStudy
      ) {
        studyResult.sections.forEach((sec: any) => {
          sections.push('', `### ${sec.heading}`);
          (sec.points || []).forEach((pt: any) => {
            sections.push(`- ${pt.text} *(Source: ${pt.citation})*`);
          });
        });
      }

      if (Array.isArray(studyResult.missingTopics) && studyResult.missingTopics.length > 0) {
        sections.push(
          '',
          '### Syllabus Gaps (Missing from Notes)',
          ...studyResult.missingTopics.map((t: string) => `- ${t}`)
        );
      }

      if (Array.isArray(studyResult.flashcards) && studyResult.flashcards.length > 0) {
        sections.push('', '### Active-Recall Flashcards');
        studyResult.flashcards.forEach((fc: any, idx: number) => {
          sections.push(`${idx + 1}. **Q:** ${fc.front}`, `   **A:** ${fc.back}`);
        });
      }
      sections.push('');
    }

    if (tutorHistory.length > 0) {
      sections.push('## Web Study Tutor Q&A History');
      tutorHistory.forEach((turn, idx) => {
        sections.push(
          '',
          `### Question ${idx + 1}: ${turn.topic}${turn.question ? ` — ${turn.question}` : ''}`,
          buildRichStudyMarkdown(turn.response)
        );
      });
    }

    if (!studyResult && tutorHistory.length === 0) {
      sections.push(
        'No generated study sheets or Q&A turns recorded yet in this session.',
        tutorTopic || tutorQuestion
          ? `Current Draft Query: ${tutorTopic} ${tutorQuestion}`.trim()
          : ''
      );
    }

    return sections.filter((s) => s !== undefined).join('\n').trim();
  }, [activeSubject, selectedDate, studyResult, tutorHistory, tutorTopic, tutorQuestion]);

  const buildQuestionAndNotesClipboardText = useCallback(() => {
    const manualTopics = customSyllabusInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const syllabus = Array.from(new Set([...loadedSyllabusTopics, ...manualTopics]));
    const lastPending =
      quotaAlert?.lastUnansweredQuery ||
      [tutorTopic.trim(), tutorQuestion.trim()].filter(Boolean).join(' — ') ||
      (tab === 'snap' ? snapPrompt.trim() : '');

    const blocks: string[] = [
      `Study Context from ShouldISkip — Subject: ${activeSubject}`,
    ];

    if (syllabus.length > 0) {
      blocks.push(`Syllabus Topics: ${syllabus.join(', ')}`);
    }

    if (attachedNotes.length > 0) {
      blocks.push('', 'Attached Personal Notes:');
      attachedNotes.slice(0, 5).forEach((note) => {
        blocks.push(
          `- ${note.title}${note.unit_tag ? ` (${note.unit_tag})` : ''}: ${note.content.slice(0, 900)}`
        );
      });
    }

    if (studyResult?.overview) {
      blocks.push('', 'Current Study Summary:', studyResult.overview);
    }

    if (tutorHistory.length > 0) {
      blocks.push('', 'Recent Study Q&A:');
      tutorHistory.slice(-4).forEach((turn, idx) => {
        blocks.push(
          `${idx + 1}. Q: ${turn.topic}${turn.question ? ` (${turn.question})` : ''}`,
          `   A: ${turn.response.core_intuition || turn.response.explanation_markdown.slice(0, 450)}`
        );
      });
    }

    if (lastPending) {
      blocks.push('', `Current Question to Solve:\n${lastPending}`);
    }

    return blocks.join('\n').trim();
  }, [
    activeSubject,
    attachedNotes,
    customSyllabusInput,
    loadedSyllabusTopics,
    quotaAlert?.lastUnansweredQuery,
    snapPrompt,
    studyResult?.overview,
    tab,
    tutorHistory,
    tutorQuestion,
    tutorTopic,
  ]);

  const handleCopyQuestionAndNotes = async () => {
    const payload = buildQuestionAndNotesClipboardText();
    try {
      await navigator.clipboard.writeText(payload);
      toast.success('Question & notes copied to clipboard!');
    } catch {
      toast.error('Clipboard permission denied. Use Export (.md) instead.');
    }
  };

  const handleExportMarkdown = () => {
    const md = buildSessionMarkdown();
    const safeSub = activeSubject.replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '') || 'Study';
    const dateStr = selectedDate || new Date().toISOString().split('T')[0];
    const filename = `ShouldISkip_Study_${safeSub}_${dateStr}.md`;

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${filename}`);
  };

  // Convert Tab 2 Study Studio result to RichStudyResponse for PDF export & sharing
  const buildRichStudyFromStudioResult = useCallback(
    (res: any): RichStudyResponse => {
      if (res?.richStudy) return res.richStudy as RichStudyResponse;

      const explanationParts: string[] = [];
      if (Array.isArray(res?.sections)) {
        res.sections.forEach((sec: any) => {
          explanationParts.push(`### ${sec.heading}`);
          (sec.points || []).forEach((pt: any) => {
            explanationParts.push(`- ${pt.text} *(${pt.citation})*`);
          });
        });
      }
      if (Array.isArray(res?.coveredTopics) && res.coveredTopics.length > 0) {
        explanationParts.push('### Covered Topics');
        res.coveredTopics.forEach((ct: any) => {
          explanationParts.push(`- ${ct.topic} *(${ct.citation})*`);
        });
      }
      if (Array.isArray(res?.flashcards) && res.flashcards.length > 0) {
        explanationParts.push('### Active-Recall Flashcards');
        res.flashcards.forEach((fc: any, idx: number) => {
          explanationParts.push(`${idx + 1}. **Q:** ${fc.front}\n   **A:** ${fc.back}`);
        });
      }

      return {
        title: res?.title || `${studySubject || 'Study'} — Revision Guide`,
        subject_tag: studySubject || 'General',
        core_intuition: res?.overview || 'Compiled from your private notes.',
        explanation_markdown: explanationParts.join('\n\n'),
        key_takeaways: Array.isArray(res?.citations) ? res.citations : [],
        exam_tips: Array.isArray(res?.missingTopics)
          ? res.missingTopics.map((t: string) => `Review gap: ${t}`)
          : [],
        references: [],
      };
    },
    [studySubject]
  );

  const buildUniversalTranscriptMarkdown = useCallback(() => {
    const lastTutorTopic =
      tutorHistory[tutorHistory.length - 1]?.topic ||
      tutorTopic.trim() ||
      studyResult?.title ||
      'Study Session';

    const blocks: string[] = [
      '# ShouldISkip Study Session Transcript',
      `**Subject:** ${activeSubject} | **Topic:** ${lastTutorTopic}`,
      '> **Instruction for AI Assistants (ChatGPT, Gemini, Claude, Perplexity):** Below is a student\'s study session transcript containing their questions and previous AI explanations. Read this context and seamlessly continue helping the student with follow-up questions, practice problems, or deeper explanations.',
    ];

    let promptIndex = 1;

    if (studyResult) {
      const studioRich = buildRichStudyFromStudioResult(studyResult);
      blocks.push(
        '',
        '---',
        `## User Prompt ${promptIndex}`,
        `Compile a private notes-grounded ${studyMode} study guide for ${activeSubject}.`,
        '',
        `## Co-Pilot Answer ${promptIndex}`,
        buildRichStudyMarkdown(studioRich)
      );
      promptIndex += 1;
    }

    tutorHistory.forEach((turn) => {
      const promptText =
        turn.question && turn.topic && turn.question !== turn.topic
          ? `${turn.topic} — ${turn.question}`
          : turn.question || turn.topic || activeSubject;

      blocks.push(
        '',
        '---',
        `## User Prompt ${promptIndex}`,
        promptText,
        '',
        `## Co-Pilot Answer ${promptIndex}`,
        buildRichStudyMarkdown(turn.response)
      );
      promptIndex += 1;
    });

    if (promptIndex === 1) {
      const draftPrompt =
        [tutorTopic.trim(), tutorQuestion.trim()].filter(Boolean).join(' — ') ||
        snapPrompt.trim();
      if (draftPrompt) {
        blocks.push('', '---', '## User Prompt 1', draftPrompt);
      }
    }

    return {
      topic: lastTutorTopic,
      transcriptMd: blocks.join('\n').trim(),
    };
  }, [
    activeSubject,
    buildRichStudyFromStudioResult,
    snapPrompt,
    studyMode,
    studyResult,
    tutorHistory,
    tutorQuestion,
    tutorTopic,
  ]);

  const generateShareCode = () => {
    const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
    if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
      const bytes = new Uint8Array(8);
      window.crypto.getRandomValues(bytes);
      return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
    }
    let out = '';
    for (let i = 0; i < 8; i += 1) {
      out += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    return out;
  };

  const handleShareSession = async () => {
    if (
      !studyResult &&
      tutorHistory.length === 0 &&
      !tutorTopic.trim() &&
      !tutorQuestion.trim() &&
      !snapPrompt.trim()
    ) {
      toast.error('Ask a study question or generate a guide first to share your session.');
      return;
    }

    setSharingSession(true);
    setCopiedShareLink(false);
    setCopiedShareText(false);

    try {
      const { topic: sessionTopic, transcriptMd } = buildUniversalTranscriptMarkdown();
      const shareCode = generateShareCode();
      const origin = typeof window !== 'undefined' ? window.location.origin : '';
      const shareUrl = `${origin}/study/${shareCode}`;

      const { error } = await supabase.from('shared_study_sessions').upsert(
        {
          share_code: shareCode,
          user_id: user?.id || null,
          subject: activeSubject,
          topic: sessionTopic,
          transcript_md: transcriptMd,
        },
        { onConflict: 'share_code' }
      );

      if (error) {
        console.warn('shared_study_sessions insert warning:', error.message);
        toast.error(
          'Could not save public link yet — use "Copy Full Text" below to paste directly into any AI.'
        );
      }

      setShareModalData({
        shareUrl,
        shareCode,
        transcriptMd,
        savedToDb: !error,
      });
    } catch (err: any) {
      toast.error(err?.message || 'Could not generate shareable study link.');
    } finally {
      setSharingSession(false);
    }
  };

  const handleCopyShareUrl = async () => {
    if (!shareModalData?.shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareModalData.shareUrl);
      setCopiedShareLink(true);
      toast.success('Universal study link copied!');
      setTimeout(() => setCopiedShareLink(false), 2000);
    } catch {
      toast.error('Clipboard permission denied.');
    }
  };

  const handleCopyShareTranscript = async () => {
    if (!shareModalData?.transcriptMd) return;
    try {
      await navigator.clipboard.writeText(shareModalData.transcriptMd);
      setCopiedShareText(true);
      toast.success('Full study transcript copied!');
      setTimeout(() => setCopiedShareText(false), 2000);
    } catch {
      toast.error('Clipboard permission denied.');
    }
  };

  // =========================================================================
  // SAVE STRUCTURED AI STUDY NOTE DIRECTLY TO MY PRIVATE VAULT (subject_notes)
  // No forced PDF download or Supabase Storage upload on save.
  // =========================================================================
  const saveStudyNoteToPrivateVault = async (
    studyResponse: RichStudyResponse,
    subjectInput: string,
    savingKey: string
  ) => {
    if (!user?.id) {
      toast.error('Sign in required to save personal notes.');
      return;
    }

    const targetSubject = subjectInput.trim() || studyResponse.subject_tag?.trim() || 'General';
    setSavingVaultKey(savingKey);

    try {
      const compiledStudyMarkdown = buildRichStudyMarkdown(studyResponse);

      const { error } = await supabase.from('subject_notes').insert({
        user_id: user.id,
        author_name: publicName,
        classroom_id: null,
        subject: targetSubject,
        title: studyResponse.title || `${targetSubject} — Study Guide`,
        content: compiledStudyMarkdown,
        file_url: '',
        unit_tag: 'AI Generated',
        is_shared: false,
      });

      if (error) {
        toast.error('Failed to save note: ' + error.message);
        return;
      }

      setSavedToVaultKeys((prev) => ({ ...prev, [savingKey]: true }));
      toast.success(
        'Moved to My Private Vault! Open Classrooms & Notes → My Private Vault to view or download.'
      );

      if (onNoteSaved) await onNoteSaved();
      if (onDataMutated) await onDataMutated();
    } catch (err: any) {
      toast.error('Could not save note to vault: ' + (err?.message || 'Unknown error'));
    } finally {
      setSavingVaultKey(null);
    }
  };

  // Handle Snap image upload
  const handleSnapImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSnapImageMime(file.type || 'image/png');
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setSnapImageDataUrl(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Mode 1: parse_records
  const handleParseRecords = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!snapPrompt.trim() && !snapImageDataUrl) {
      toast.error('Enter an instruction or upload a datesheet/homework photo.');
      return;
    }

    setQuotaAlert(null);
    setParsingRecords(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          mode: 'parse_records',
          userId: user?.id,
          prompt: snapPrompt,
          imageBase64: snapImageDataUrl,
          imageMimeType: snapImageMime,
          subjects: uniqueSubjects,
          todayDate: selectedDate,
        }),
      });

      const data = await parseApiJsonResponse(res);
      if (handleQuotaErrorResponse(res.status, data, snapPrompt.trim())) return;
      if (!res.ok) throw new Error(data?.message || data?.error || 'Failed to parse records');

      const items: StagedItem[] = (data.items || []).map((it: any, idx: number) => ({
        id: `staged-${Date.now()}-${idx}`,
        subject: it.subject || uniqueSubjects[0] || 'General',
        title: it.title || '',
        date: it.date || selectedDate,
        due_date: it.due_date || `${selectedDate}T23:59`,
        start_time: it.start_time || '',
        end_time: it.end_time || '',
        room_no: it.room_no || '',
        description: it.description || '',
        syllabus_topics: Array.isArray(it.syllabus_topics) ? it.syllabus_topics : [],
        classes_optional: it.classes_optional !== false,
        status: ['present', 'absent', 'od'].includes(it.status) ? it.status : 'present',
      }));

      setStagedType(data.type || 'assignment');
      setStagedSummary(data.summary || '');
      setStagedItems(items);

      if (items.length === 0) {
        toast.info('No records detected. Try adding clearer dates or subjects.');
      } else {
        toast.success(`Staged ${items.length} personal ${data.type} item(s) for review.`);
      }
    } catch (err: any) {
      toast.error(err.message || 'AI parsing failed');
    } finally {
      setParsingRecords(false);
    }
  };

  const handleConfirmAndSave = async () => {
    if (!user || stagedItems.length === 0) return;
    setCommittingStaged(true);

    try {
      if (stagedType === 'exam') {
        const rows = stagedItems.map((it) => ({
          user_id: user.id,
          author_name: publicName,
          classroom_id: null,
          subject: it.subject.trim() || 'Subject',
          exam_date: it.date || selectedDate,
          start_time: it.start_time || null,
          end_time: it.end_time || null,
          room_no: it.room_no || null,
          syllabus_topics: (it.syllabus_topics || []).map((t) => ({ topic: t, done: false })),
          classes_optional: it.classes_optional !== false,
          is_shared: false,
        }));

        const { error } = await supabase.from('exam_datesheet').insert(rows);
        if (error) throw error;
        toast.success(`Saved ${rows.length} personal exam entry(s) to Datesheet!`);
      } else if (stagedType === 'assignment') {
        const rows = stagedItems.map((it) => {
          const rawDue = it.due_date || `${it.date || selectedDate}T23:59`;
          const dueIso = new Date(rawDue).toISOString();
          return {
            creator_id: user.id,
            creator_name: publicName,
            classroom_id: null,
            subject: it.subject.trim() || 'Subject',
            title: it.title?.trim() || `${it.subject} Assignment`,
            description: it.description || '',
            due_date: dueIso,
            is_shared: false,
          };
        });

        const { error } = await supabase.from('assignments').insert(rows);
        if (error) throw error;
        toast.success(`Saved ${rows.length} personal assignment(s)!`);
      } else if (stagedType === 'attendance') {
        let updatedCount = 0;

        for (const it of stagedItems) {
          const targetDate = it.date || selectedDate;
          const [y, m, d] = targetDate.split('-').map(Number);
          const dayOfWeek = new Date(y, m - 1, d, 12, 0, 0).getDay();

          const matchingSlots = allSlots.filter((s) => {
            if (s.day_of_week !== dayOfWeek) return false;
            if (s.effective_from && targetDate < s.effective_from) return false;
            if (s.effective_until && targetDate > s.effective_until) return false;
            const subLower = (it.subject || '').toLowerCase();
            if (!subLower || subLower === 'all' || subLower === 'all classes') return true;
            return (
              s.subject.toLowerCase().includes(subLower) ||
              subLower.includes(s.subject.toLowerCase())
            );
          });

          for (const slot of matchingSlots) {
            const payload = {
              user_id: user.id,
              slot_id: slot.id,
              date: targetDate,
              status: it.status || 'present',
            };
            SyncEngine.enqueue({
              table: 'attendance_records',
              action: 'UPSERT',
              payload,
            });
            await supabase
              .from('attendance_records')
              .upsert(payload, { onConflict: 'user_id,slot_id,date' });
            updatedCount++;
          }
        }

        if (updatedCount > 0) {
          SyncEngine.drainQueue();
          toast.success(`Updated ${updatedCount} personal attendance slot(s)!`);
        } else {
          toast.warning('No matching timetable slots found for that date/subject.');
        }
      }

      setStagedItems([]);
      setSnapPrompt('');
      setSnapImageDataUrl(null);
      if (onDataMutated) await onDataMutated();
    } catch (err: any) {
      toast.error('Failed to save staged records: ' + err.message);
    } finally {
      setCommittingStaged(false);
    }
  };

  // Mode 2: study_material
  const handleGenerateStudyMaterial = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !studySubject.trim()) {
      toast.error('Select or enter a subject first.');
      return;
    }

    setQuotaAlert(null);
    setSynthesizing(true);
    setFlashcardIndex(0);
    setFlashcardFlipped(false);

    try {
      const notesQuery = supabase
        .from('subject_notes')
        .select('id, title, unit_tag, content')
        .eq('user_id', user.id)
        .ilike('subject', studySubject.trim())
        .order('created_at', { ascending: false });

      const examQuery = supabase
        .from('exam_datesheet')
        .select('syllabus_topics')
        .eq('user_id', user.id)
        .ilike('subject', studySubject.trim());

      const [{ data: notesRows }, { data: examRows }] = await Promise.all([notesQuery, examQuery]);
      const notesList = (notesRows || []) as PersonalNoteSnippet[];
      setLoadedNotesCount(notesList.length);
      setAttachedNotes(notesList);

      const examTopics: string[] = [];
      (examRows || []).forEach((row: any) => {
        if (Array.isArray(row.syllabus_topics)) {
          row.syllabus_topics.forEach((t: any) => {
            const label = typeof t === 'string' ? t : t?.topic;
            if (label && !examTopics.includes(label)) examTopics.push(label);
          });
        }
      });

      const manualTopics = customSyllabusInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const syllabusTopics = Array.from(new Set([...examTopics, ...manualTopics]));
      setLoadedSyllabusTopics(syllabusTopics);

      const headers = await getAuthHeaders();
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          mode: 'study_material',
          userId: user.id,
          subject: studySubject.trim(),
          studyMode,
          syllabusTopics,
          notesList,
        }),
      });

      const data = await parseApiJsonResponse(res);
      if (
        handleQuotaErrorResponse(
          res.status,
          data,
          `Generate ${studyMode} study guide for ${studySubject.trim()}`
        )
      ) {
        return;
      }
      if (!res.ok) throw new Error(data?.message || data?.error || 'Synthesis failed');

      const parsedRich =
        data?.richStudy && typeof data.richStudy === 'string'
          ? safeParseStudyJson<RichStudyResponse>(data.richStudy)
          : data?.richStudy && typeof data.richStudy === 'object'
          ? (data.richStudy as RichStudyResponse)
          : null;

      const normalizedStudioResult = parsedRich ? { ...data, richStudy: parsedRich } : data;
      setStudyResult(normalizedStudioResult);
      setStudySaveSubject(
        studySubject.trim() || parsedRich?.subject_tag?.trim() || 'General'
      );
      setSavedToVaultKeys((prev) => ({ ...prev, 'studio-vault': false }));

      if (!data.cached && data.sourceHash) {
        try {
          await supabase.from('ai_study_artifacts').insert({
            user_id: user.id,
            subject: studySubject.trim(),
            unit_tag: 'Full Syllabus',
            artifact_type: studyMode,
            source_hash: data.sourceHash,
            payload: normalizedStudioResult,
          });
        } catch {
          // Graceful if already inserted by API route
        }
      }

      toast.success(
        data.cached
          ? 'Loaded instant cached study pack from your private vault!'
          : 'Private notes-grounded textbook guide ready!'
      );
    } catch (err: any) {
      toast.error(err.message || 'Study synthesis failed');
    } finally {
      setSynthesizing(false);
    }
  };

  // Mode 3: web_study_tutor
  const handleAskTutor = async (e?: React.FormEvent, overrideTopic?: string) => {
    if (e) e.preventDefault();
    const activeTopic = (overrideTopic ?? tutorTopic).trim();
    const activeQuestion = tutorQuestion.trim();
    if (!activeTopic && !activeQuestion) {
      toast.error('Enter a topic or problem to solve.');
      return;
    }

    const queryLabel = [activeTopic, activeQuestion].filter(Boolean).join(' — ');
    setQuotaAlert(null);
    setTutorLoading(true);

    try {
      let attachedNotesText = '';
      if (user?.id && tutorSubject.trim()) {
        try {
          const { data: noteRows } = await supabase
            .from('subject_notes')
            .select('id, title, unit_tag, content')
            .eq('user_id', user.id)
            .ilike('subject', tutorSubject.trim())
            .order('created_at', { ascending: false })
            .limit(4);
          if (Array.isArray(noteRows) && noteRows.length > 0) {
            setAttachedNotes(noteRows as PersonalNoteSnippet[]);
            attachedNotesText = noteRows
              .map((n: any) => `[${n.title}]: ${String(n.content || '').slice(0, 1500)}`)
              .join('\n')
              .slice(0, 6000);
          } else {
            setAttachedNotes([]);
          }
        } catch {
          // Non-fatal
        }
      } else {
        setAttachedNotes([]);
      }

      const headers = await getAuthHeaders();
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          mode: 'web_study_tutor',
          userId: user?.id,
          subject: tutorSubject.trim(),
          topic: activeTopic,
          question: activeQuestion,
          attachedNotesText,
        }),
      });

      const data = await parseApiJsonResponse(res);
      if (handleQuotaErrorResponse(res.status, data, queryLabel)) return;
      if (!res.ok) throw new Error(data?.message || data?.error || 'Web tutor request failed');

      const rawCandidate =
        typeof data === 'string'
          ? safeParseStudyJson<RichStudyResponse>(data)
          : data?.richStudy
          ? typeof data.richStudy === 'string'
            ? safeParseStudyJson<RichStudyResponse>(data.richStudy)
            : (data.richStudy as RichStudyResponse)
          : typeof data?.explanation_markdown === 'string' &&
            looksLikeRawJsonObject(data.explanation_markdown)
          ? safeParseStudyJson<RichStudyResponse>(data.explanation_markdown)
          : typeof data?.core_intuition === 'string' &&
            looksLikeRawJsonObject(data.core_intuition)
          ? safeParseStudyJson<RichStudyResponse>(data.core_intuition)
          : null;

      const sourceObj: any = rawCandidate || (typeof data === 'object' && data ? data : {});
      const richResp: RichStudyResponse = {
        title: sourceObj.title || activeTopic || 'Study Guide',
        subject_tag: sourceObj.subject_tag || tutorSubject.trim() || 'Academic Study',
        core_intuition: looksLikeRawJsonObject(sourceObj.core_intuition || '')
          ? ''
          : sourceObj.core_intuition || '',
        explanation_markdown: looksLikeRawJsonObject(
          sourceObj.explanation_markdown || sourceObj.explanation || ''
        )
          ? ''
          : sourceObj.explanation_markdown || sourceObj.explanation || '',
        problem_solution: sourceObj.problem_solution,
        infographic: sourceObj.infographic,
        key_takeaways: Array.isArray(sourceObj.key_takeaways)
          ? sourceObj.key_takeaways
          : Array.isArray(sourceObj.keyPoints)
          ? sourceObj.keyPoints
          : [],
        exam_tips: Array.isArray(sourceObj.exam_tips)
          ? sourceObj.exam_tips
          : Array.isArray(sourceObj.examTips)
          ? sourceObj.examTips
          : [],
        references: Array.isArray(sourceObj.references) ? sourceObj.references : [],
      };

      const resolvedSub =
        tutorSubject.trim() || richResp.subject_tag?.trim() || 'General';
      const newTurnId = `turn-${Date.now()}`;
      const newTurn: TutorTurn = {
        id: newTurnId,
        subject: resolvedSub,
        topic: activeTopic || activeQuestion,
        question: activeQuestion,
        engine: data.engine,
        response: richResp,
        createdAt: new Date().toISOString(),
      };

      setTutorHistory((prev) => [...prev, newTurn]);
      setTurnSaveSubjects((prev) => ({ ...prev, [newTurnId]: resolvedSub }));
      setTutorQuestion('');
    } catch (err: any) {
      toast.error(err.message || 'Could not reach Web Study Tutor');
    } finally {
      setTutorLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-end p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-zinc-100 dark:bg-[#0c0c0e] sm:rounded-[28px] border-l sm:border border-zinc-200 dark:border-zinc-800 w-full max-w-3xl h-full sm:h-[94vh] flex flex-col shadow-2xl overflow-hidden"
      >
        {/* Drawer Header */}
        <div className="px-6 py-4 backdrop-blur-xl bg-white/80 dark:bg-zinc-900/80 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-blue-600 to-violet-600 text-white flex items-center justify-center shadow-sm shrink-0">
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-sm font-bold tracking-tight">Private AI Student Copilot</h2>
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                  <Lock className="w-2.5 h-2.5" />
                  <span>100% Private</span>
                </span>
              </div>
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                Personal digital textbook, equations &amp; records — never shared in Classrooms
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close AI Copilot"
            className="w-8 h-8 rounded-full bg-zinc-200/70 dark:bg-zinc-800/70 hover:opacity-80 flex items-center justify-center text-zinc-500 transition shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Mode Tab Switcher + Clean Export / Share Session Toolbar (no external AI popup dropdown) */}
        <div className="px-6 py-2.5 bg-white/65 dark:bg-zinc-900/60 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 flex-wrap shrink-0">
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <button
              type="button"
              onClick={() => setTab('snap')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 shrink-0 transition whitespace-nowrap ${
                tab === 'snap'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-zinc-200/60 dark:bg-zinc-800/70 text-zinc-600 dark:text-zinc-300'
              }`}
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Snap-to-Ledger</span>
            </button>

            <button
              type="button"
              onClick={() => setTab('notes')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 shrink-0 transition whitespace-nowrap ${
                tab === 'notes'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-zinc-200/60 dark:bg-zinc-800/70 text-zinc-600 dark:text-zinc-300'
              }`}
            >
              <BookOpen className="w-3.5 h-3.5" />
              <span>Study Studio</span>
            </button>

            <button
              type="button"
              onClick={() => setTab('tutor')}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 shrink-0 transition whitespace-nowrap ${
                tab === 'tutor'
                  ? 'bg-blue-600 text-white shadow-sm'
                  : 'bg-zinc-200/60 dark:bg-zinc-800/70 text-zinc-600 dark:text-zinc-300'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Web Tutor</span>
            </button>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={handleExportMarkdown}
              title="Download study session as Markdown (.md)"
              className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:border-blue-500/40 text-[11px] font-semibold flex items-center gap-1 transition whitespace-nowrap"
            >
              <Download className="w-3 h-3 text-blue-500" />
              <span>Export (.md)</span>
            </button>

            <button
              type="button"
              onClick={handleShareSession}
              disabled={sharingSession}
              title="Generate a universal AI-readable study link"
              className="px-2.5 py-1.5 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 hover:border-blue-500/40 disabled:opacity-50 text-[11px] font-semibold flex items-center gap-1 transition whitespace-nowrap"
            >
              <Share2 className="w-3 h-3 text-emerald-500" />
              <span>{sharingSession ? 'Sharing...' : 'Share Session'}</span>
            </button>
          </div>
        </div>

        {/* Drawer Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Clean Inline Amber Alert (Shown ONLY when API returns 429 TOKEN_LIMIT_EXCEEDED) */}
          {quotaAlert && (
            <div className="backdrop-blur-xl bg-amber-500/10 border border-amber-500/30 p-4 rounded-[22px] space-y-3 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0 mt-0.5">
                    <AlertTriangle className="w-4 h-4" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-xs font-bold text-amber-800 dark:text-amber-200">
                        Built-in AI Token Limit Reached
                      </h4>
                      <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-800 dark:text-amber-200 flex items-center gap-1 tabular-nums">
                        <Clock className="w-2.5 h-2.5" />
                        {quotaAlert.retryAfter > 0
                          ? `Retry in ${quotaAlert.retryAfter}s`
                          : 'Ready to retry'}
                      </span>
                    </div>
                    <p className="text-xs text-amber-900/90 dark:text-amber-100/90 leading-relaxed">
                      Built-in free AI token limit reached for now. Please wait a minute to retry, or copy your question and notes to continue in ChatGPT or Google Gemini while the quota resets.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setQuotaAlert(null)}
                  className="p-1 rounded-full text-amber-600 dark:text-amber-400 hover:bg-amber-500/15 transition shrink-0"
                  aria-label="Dismiss token limit notice"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-2 pl-11">
                <button
                  type="button"
                  onClick={handleCopyQuestionAndNotes}
                  className="px-3.5 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Question &amp; Notes</span>
                </button>
              </div>
            </div>
          )}

          {/* =============================================================== */}
          {/* TAB 1: SNAP-TO-LEDGER                                           */}
          {/* =============================================================== */}
          {tab === 'snap' && (
            <div className="space-y-5">
              <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-5 rounded-[24px] border border-zinc-200 dark:border-zinc-800 space-y-4">
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-blue-500">
                    Personal Record Organizer
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Upload a photo of a datesheet/homework circular or type what happened. Nothing is saved until you confirm, and records stay strictly private to your account.
                  </p>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {[
                    'DSA Mid-Sem on 2026-11-25 09:30-12:30 Room B-204, syllabus: Trees, Graphs',
                    'DBMS Lab File 5 due Friday 5pm',
                    `Mark me present for all classes on ${selectedDate}`,
                  ].map((example, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSnapPrompt(example)}
                      className="text-[11px] px-2.5 py-1 rounded-full bg-zinc-200/70 dark:bg-zinc-800/80 hover:bg-blue-500/15 hover:text-blue-500 transition text-left truncate max-w-full"
                    >
                      + {example}
                    </button>
                  ))}
                </div>

                <form onSubmit={handleParseRecords} className="space-y-3">
                  <textarea
                    rows={3}
                    placeholder="Paste circular text, exam schedule, or natural instruction..."
                    value={snapPrompt}
                    onChange={(e) => setSnapPrompt(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl px-3.5 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />

                  <input
                    ref={snapFileRef}
                    type="file"
                    accept="image/*"
                    onChange={handleSnapImageUpload}
                    className="hidden"
                  />

                  {snapImageDataUrl && (
                    <div className="relative rounded-2xl overflow-hidden border border-zinc-200 dark:border-zinc-800 bg-zinc-950/5 p-2 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={snapImageDataUrl}
                          alt="Uploaded circular preview"
                          className="w-14 h-14 object-cover rounded-xl border border-zinc-200 dark:border-zinc-700"
                        />
                        <span className="text-xs font-medium truncate">
                          Image attached for vision extraction
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSnapImageDataUrl(null)}
                        className="p-1.5 rounded-full text-zinc-400 hover:text-rose-500 transition"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}

                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => snapFileRef.current?.click()}
                      className="px-3.5 py-2 rounded-xl bg-zinc-200/70 dark:bg-zinc-800/80 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <Upload className="w-3.5 h-3.5 text-amber-500" />
                      <span>{snapImageDataUrl ? 'Change Image' : 'Upload Datesheet / Photo'}</span>
                    </button>

                    <button
                      type="submit"
                      disabled={parsingRecords}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
                    >
                      <Wand2 className="w-3.5 h-3.5" />
                      <span>{parsingRecords ? 'Extracting...' : 'Extract & Stage'}</span>
                    </button>
                  </div>
                </form>
              </div>

              {stagedItems.length > 0 && (
                <div className="backdrop-blur-xl bg-white/80 dark:bg-zinc-900/70 p-5 rounded-[24px] border border-blue-500/30 space-y-4 shadow-sm">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-500 border border-blue-500/20">
                          Staged {stagedType}
                        </span>
                        <h4 className="text-xs font-bold">
                          Review &amp; Edit Before Saving ({stagedItems.length})
                        </h4>
                      </div>
                      {stagedSummary && (
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-1">
                          {stagedSummary}
                        </p>
                      )}
                    </div>

                    <select
                      value={stagedType}
                      onChange={(e) => setStagedType(e.target.value as any)}
                      className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-2.5 py-1 text-xs font-semibold"
                    >
                      <option value="exam">Target: My Exam Datesheet</option>
                      <option value="assignment">Target: My Assignments</option>
                      <option value="attendance">Target: My Attendance</option>
                    </select>
                  </div>

                  <div className="space-y-3">
                    {stagedItems.map((item, idx) => (
                      <div
                        key={item.id}
                        className="bg-zinc-50 dark:bg-zinc-950/60 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-3"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[10px] font-bold uppercase text-zinc-400">
                            Personal Item #{idx + 1}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setStagedItems((prev) => prev.filter((x) => x.id !== item.id))
                            }
                            className="text-zinc-400 hover:text-rose-500 transition p-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="text-[10px] font-semibold text-zinc-400 block mb-0.5">
                              Subject
                            </label>
                            <input
                              type="text"
                              value={item.subject}
                              onChange={(e) =>
                                setStagedItems((prev) =>
                                  prev.map((x) =>
                                    x.id === item.id ? { ...x, subject: e.target.value } : x
                                  )
                                )
                              }
                              className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs"
                            />
                          </div>

                          {stagedType === 'assignment' && (
                            <div>
                              <label className="text-[10px] font-semibold text-zinc-400 block mb-0.5">
                                Title
                              </label>
                              <input
                                type="text"
                                value={item.title || ''}
                                onChange={(e) =>
                                  setStagedItems((prev) =>
                                    prev.map((x) =>
                                      x.id === item.id ? { ...x, title: e.target.value } : x
                                    )
                                  )
                                }
                                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs"
                              />
                            </div>
                          )}

                          {stagedType === 'exam' && (
                            <div>
                              <label className="text-[10px] font-semibold text-zinc-400 block mb-0.5">
                                Exam Date
                              </label>
                              <input
                                type="date"
                                value={item.date || selectedDate}
                                onChange={(e) =>
                                  setStagedItems((prev) =>
                                    prev.map((x) =>
                                      x.id === item.id ? { ...x, date: e.target.value } : x
                                    )
                                  )
                                }
                                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs"
                              />
                            </div>
                          )}

                          {stagedType === 'assignment' && (
                            <div>
                              <label className="text-[10px] font-semibold text-zinc-400 block mb-0.5">
                                Due Date &amp; Time
                              </label>
                              <input
                                type="datetime-local"
                                value={(item.due_date || `${selectedDate}T23:59`).slice(0, 16)}
                                onChange={(e) =>
                                  setStagedItems((prev) =>
                                    prev.map((x) =>
                                      x.id === item.id ? { ...x, due_date: e.target.value } : x
                                    )
                                  )
                                }
                                className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs"
                              />
                            </div>
                          )}

                          {stagedType === 'attendance' && (
                            <>
                              <div>
                                <label className="text-[10px] font-semibold text-zinc-400 block mb-0.5">
                                  Date
                                </label>
                                <input
                                  type="date"
                                  value={item.date || selectedDate}
                                  onChange={(e) =>
                                    setStagedItems((prev) =>
                                      prev.map((x) =>
                                        x.id === item.id ? { ...x, date: e.target.value } : x
                                      )
                                    )
                                  }
                                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] font-semibold text-zinc-400 block mb-0.5">
                                  Status
                                </label>
                                <select
                                  value={item.status || 'present'}
                                  onChange={(e) =>
                                    setStagedItems((prev) =>
                                      prev.map((x) =>
                                        x.id === item.id
                                          ? { ...x, status: e.target.value as any }
                                          : x
                                      )
                                    )
                                  }
                                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs"
                                >
                                  <option value="present">Present</option>
                                  <option value="absent">Absent</option>
                                  <option value="od">On Duty (OD)</option>
                                </select>
                              </div>
                            </>
                          )}
                        </div>

                        {stagedType === 'exam' && (
                          <div className="grid grid-cols-3 gap-2">
                            <input
                              type="time"
                              value={item.start_time || ''}
                              onChange={(e) =>
                                setStagedItems((prev) =>
                                  prev.map((x) =>
                                    x.id === item.id ? { ...x, start_time: e.target.value } : x
                                  )
                                )
                              }
                              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs"
                            />
                            <input
                              type="time"
                              value={item.end_time || ''}
                              onChange={(e) =>
                                setStagedItems((prev) =>
                                  prev.map((x) =>
                                    x.id === item.id ? { ...x, end_time: e.target.value } : x
                                  )
                                )
                              }
                              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs"
                            />
                            <input
                              type="text"
                              placeholder="Room"
                              value={item.room_no || ''}
                              onChange={(e) =>
                                setStagedItems((prev) =>
                                  prev.map((x) =>
                                    x.id === item.id ? { ...x, room_no: e.target.value } : x
                                  )
                                )
                              }
                              className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs"
                            />
                          </div>
                        )}

                        {stagedType === 'exam' && (
                          <input
                            type="text"
                            placeholder="Syllabus topics (comma-separated)"
                            value={(item.syllabus_topics || []).join(', ')}
                            onChange={(e) =>
                              setStagedItems((prev) =>
                                prev.map((x) =>
                                  x.id === item.id
                                    ? {
                                        ...x,
                                        syllabus_topics: e.target.value
                                          .split(',')
                                          .map((s) => s.trim())
                                          .filter(Boolean),
                                      }
                                    : x
                                )
                              )
                            }
                            className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-2.5 py-1.5 text-xs"
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                    <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                      <Lock className="w-3 h-3 text-emerald-500" />
                      Saves privately to your personal records only
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setStagedItems([])}
                        className="px-4 py-2 rounded-xl border border-zinc-200 dark:border-zinc-800 text-xs font-semibold hover:bg-zinc-200/50 dark:hover:bg-zinc-800 transition"
                      >
                        Discard
                      </button>
                      <button
                        type="button"
                        onClick={handleConfirmAndSave}
                        disabled={committingStaged}
                        className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>{committingStaged ? 'Saving...' : 'Confirm & Save to My Records'}</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* =============================================================== */}
          {/* TAB 2: PRIVATE EXAM STUDY STUDIO                                */}
          {/* =============================================================== */}
          {tab === 'notes' && (
            <div className="space-y-5">
              <form
                onSubmit={handleGenerateStudyMaterial}
                className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-5 rounded-[24px] border border-zinc-200 dark:border-zinc-800 space-y-4"
              >
                <div>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-blue-500">
                    Private Exam Study Studio (Zero Hallucination)
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    Synthesizes interactive textbook guides, LaTeX equations &amp; diagrams strictly from your personal notes &amp; exam datesheet. Missing syllabus topics are flagged{' '}
                    <code className="text-rose-500 font-semibold">[Not in Your Notes]</code>.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-zinc-400 block mb-1">
                      Subject
                    </label>
                    <input
                      type="text"
                      required
                      list="copilot-subjects-list"
                      placeholder="e.g. Data Structures"
                      value={studySubject}
                      onChange={(e) => setStudySubject(e.target.value)}
                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none"
                    />
                    <datalist id="copilot-subjects-list">
                      {uniqueSubjects.map((sub) => (
                        <option key={sub} value={sub} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-zinc-400 block mb-1">
                      Study Mode
                    </label>
                    <select
                      value={studyMode}
                      onChange={(e) => setStudyMode(e.target.value as any)}
                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none"
                    >
                      <option value="summary">Digital Textbook Revision Sheet</option>
                      <option value="gap_analysis">Syllabus Gap Check</option>
                      <option value="flashcards">Active-Recall Flashcards</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-semibold text-zinc-400 block mb-1">
                    Extra Syllabus Topics to Check (optional, comma-separated)
                  </label>
                  <input
                    type="text"
                    placeholder="e.g. AVL Trees, Dijkstra's Algorithm, B-Trees"
                    value={customSyllabusInput}
                    onChange={(e) => setCustomSyllabusInput(e.target.value)}
                    className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none"
                  />
                </div>

                <div className="flex items-center justify-between gap-2 pt-1 flex-wrap">
                  <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                    <Lock className="w-3 h-3 text-emerald-500" />
                    Cached privately per account to save tokens
                  </span>

                  <button
                    type="submit"
                    disabled={synthesizing}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition shrink-0"
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>{synthesizing ? 'Synthesizing...' : 'Generate Private Study Pack'}</span>
                  </button>
                </div>
              </form>

              {studyResult && (
                <div className="backdrop-blur-xl bg-white/80 dark:bg-zinc-900/70 p-5 rounded-[24px] border border-zinc-200 dark:border-zinc-800 space-y-4">
                  <div className="flex items-start justify-between gap-2 flex-wrap border-b border-zinc-200 dark:border-zinc-800 pb-3">
                    <div className="space-y-1 flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-bold">{studyResult.title}</h4>
                        {studyResult.cached && (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 border border-emerald-500/20">
                            Cached Privately
                          </span>
                        )}
                        {loadedNotesCount !== null && (
                          <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-500 border border-blue-500/20">
                            {loadedNotesCount} Personal Note{loadedNotesCount === 1 ? '' : 's'}
                          </span>
                        )}
                      </div>
                      {!studyResult.richStudy && (
                        <RichStudyRenderer content={studyResult.overview || ''} compact />
                      )}
                    </div>
                  </div>

                  {studyResult.richStudy && (
                    <RichStudyRenderer data={studyResult.richStudy} hideReferences />
                  )}

                  {Array.isArray(studyResult.sections) && studyResult.sections.length > 0 && (
                    <div className="space-y-3 pt-2 border-t border-zinc-200/70 dark:border-zinc-800/70">
                      <h5 className="text-[11px] font-bold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                        Source-Cited Note Breakdown
                      </h5>
                      {studyResult.sections.map((sec: any, sIdx: number) => (
                        <div
                          key={sIdx}
                          className="bg-zinc-50 dark:bg-zinc-950/50 p-4 rounded-2xl border border-zinc-200 dark:border-zinc-800 space-y-2.5"
                        >
                          <h5 className="text-xs font-bold text-blue-500 uppercase tracking-wider">
                            {sec.heading}
                          </h5>
                          <div className="space-y-2">
                            {(sec.points || []).map((pt: any, pIdx: number) => (
                              <div
                                key={pIdx}
                                className="flex items-start justify-between gap-2.5 bg-white/70 dark:bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-200/70 dark:border-zinc-800/70"
                              >
                                <div className="flex-1 min-w-0">
                                  <RichStudyRenderer content={String(pt.text || '')} compact />
                                </div>
                                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-blue-500/10 text-blue-600 dark:text-blue-400 shrink-0">
                                  {pt.citation}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {Array.isArray(studyResult.coveredTopics) && studyResult.coveredTopics.length > 0 && (
                    <div className="space-y-2">
                      <h5 className="text-xs font-bold uppercase tracking-wider text-emerald-500">
                        Covered in Your Notes ({studyResult.coveredTopics.length})
                      </h5>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {studyResult.coveredTopics.map((ct: any, idx: number) => (
                          <div
                            key={idx}
                            className="p-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs flex items-center justify-between gap-2"
                          >
                            <span className="font-semibold text-emerald-700 dark:text-emerald-300">
                              {ct.topic}
                            </span>
                            <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 shrink-0">
                              {ct.citation}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {Array.isArray(studyResult.missingTopics) && studyResult.missingTopics.length > 0 && (
                    <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-2.5">
                      <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                        <AlertTriangle className="w-4 h-4 shrink-0" />
                        <h5 className="text-xs font-bold uppercase tracking-wider">
                          Syllabus Gaps — Not in Your Notes
                        </h5>
                      </div>
                      <div className="space-y-2">
                        {studyResult.missingTopics.map((topic: string, idx: number) => {
                          const cleanTopic = topic
                            .replace(/\[Not in (?:Your )?Notes\]/gi, '')
                            .trim();
                          return (
                            <div
                              key={idx}
                              className="bg-white/80 dark:bg-zinc-900/80 p-2.5 rounded-xl border border-amber-500/20 flex items-center justify-between gap-2 flex-wrap"
                            >
                              <span className="text-xs font-semibold">
                                {cleanTopic}{' '}
                                <span className="text-[10px] font-mono text-rose-500">
                                  [Not in Your Notes]
                                </span>
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setTutorSubject(studySubject);
                                  setTutorTopic(cleanTopic);
                                  setTab('tutor');
                                  handleAskTutor(undefined, cleanTopic);
                                }}
                                className="px-2.5 py-1 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-semibold transition"
                              >
                                Explain with Web Tutor →
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {Array.isArray(studyResult.flashcards) && studyResult.flashcards.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                          Flashcard {flashcardIndex + 1} of {studyResult.flashcards.length}
                        </span>
                        <span className="text-[10px] font-mono text-blue-500">
                          Source: {studyResult.flashcards[flashcardIndex]?.citation}
                        </span>
                      </div>

                      <div
                        onClick={() => setFlashcardFlipped(!flashcardFlipped)}
                        className="min-h-[150px] p-6 rounded-2xl bg-gradient-to-br from-blue-600/10 to-violet-600/10 border border-blue-500/25 cursor-pointer flex flex-col items-center justify-center text-center gap-2 transition hover:border-blue-500/50"
                      >
                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-500">
                          {flashcardFlipped
                            ? 'Answer (Click to flip)'
                            : 'Question (Click to reveal)'}
                        </span>
                        <div className="text-sm font-semibold leading-relaxed max-w-full">
                          <RichStudyRenderer
                            content={
                              flashcardFlipped
                                ? studyResult.flashcards[flashcardIndex]?.back || ''
                                : studyResult.flashcards[flashcardIndex]?.front || ''
                            }
                            compact
                          />
                        </div>
                      </div>

                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          onClick={() => {
                            setFlashcardFlipped(false);
                            setFlashcardIndex((i) =>
                              i === 0 ? studyResult.flashcards.length - 1 : i - 1
                            );
                          }}
                          className="px-3 py-1.5 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-xs font-semibold flex items-center gap-1"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" /> Prev
                        </button>
                        <button
                          type="button"
                          onClick={() => setFlashcardFlipped(!flashcardFlipped)}
                          className="px-3 py-1.5 rounded-xl bg-blue-500/10 text-blue-500 text-xs font-semibold flex items-center gap-1"
                        >
                          <RotateCw className="w-3.5 h-3.5" /> Flip
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setFlashcardFlipped(false);
                            setFlashcardIndex((i) => (i + 1) % studyResult.flashcards.length);
                          }}
                          className="px-3 py-1.5 rounded-xl bg-zinc-200 dark:bg-zinc-800 text-xs font-semibold flex items-center gap-1"
                        >
                          Next <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Save Directly to My Private Vault (No Auto-Download) */}
                  <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 flex-wrap">
                    {(() => {
                      const vaultKey = 'studio-vault';
                      const currentSub =
                        studySaveSubject ||
                        studySubject ||
                        studyResult?.richStudy?.subject_tag ||
                        'General';
                      const subjectChoices = Array.from(
                        new Set([
                          ...uniqueSubjects,
                          ...(studyResult?.richStudy?.subject_tag
                            ? [studyResult.richStudy.subject_tag]
                            : []),
                          'General',
                        ])
                      );
                      const isCustom =
                        Boolean(customSubjectModes[vaultKey]) ||
                        !subjectChoices.includes(currentSub);

                      return (
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                            <Lock className="w-3 h-3 text-emerald-500" />
                            Save to Subject:
                          </span>
                          <select
                            value={isCustom ? '__custom__' : currentSub}
                            onChange={(e) => {
                              const val = e.target.value;
                              setSavedToVaultKeys((prev) => ({ ...prev, [vaultKey]: false }));
                              if (val === '__custom__') {
                                setCustomSubjectModes((prev) => ({ ...prev, [vaultKey]: true }));
                              } else {
                                setCustomSubjectModes((prev) => ({ ...prev, [vaultKey]: false }));
                                setStudySaveSubject(val);
                              }
                            }}
                            className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-2.5 py-1 text-xs font-medium focus:outline-none"
                          >
                            {subjectChoices.map((sub) => (
                              <option key={sub} value={sub}>
                                {sub}
                              </option>
                            ))}
                            <option value="__custom__">+ Custom Subject...</option>
                          </select>
                          {isCustom && (
                            <input
                              type="text"
                              value={studySaveSubject}
                              onChange={(e) => {
                                setSavedToVaultKeys((prev) => ({ ...prev, [vaultKey]: false }));
                                setStudySaveSubject(e.target.value);
                              }}
                              placeholder="Type subject..."
                              className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-2.5 py-1 text-xs font-medium w-36 focus:outline-none"
                            />
                          )}
                        </div>
                      );
                    })()}

                    <button
                      type="button"
                      onClick={() =>
                        saveStudyNoteToPrivateVault(
                          buildRichStudyFromStudioResult(studyResult),
                          studySaveSubject ||
                            studySubject ||
                            studyResult?.richStudy?.subject_tag ||
                            'General',
                          'studio-vault'
                        )
                      }
                      disabled={savingVaultKey === 'studio-vault'}
                      className={`px-4 py-2 rounded-xl text-white text-xs font-semibold flex items-center gap-1.5 transition shrink-0 shadow-sm disabled:opacity-50 ${
                        savedToVaultKeys['studio-vault']
                          ? 'bg-purple-600 hover:bg-purple-500'
                          : 'bg-emerald-600 hover:bg-emerald-500'
                      }`}
                    >
                      {savedToVaultKeys['studio-vault'] ? (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      ) : (
                        <FileDown className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {savingVaultKey === 'studio-vault'
                          ? 'Saving to Vault...'
                          : savedToVaultKeys['studio-vault']
                          ? 'Saved to Vault ✓'
                          : 'Save to My Private Vault'}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* =============================================================== */}
          {/* TAB 3: PRIVATE WEB-GROUNDED TEXTBOOK STUDY TUTOR                */}
          {/* =============================================================== */}
          {tab === 'tutor' && (
            <div className="space-y-5">
              <form
                onSubmit={(e) => handleAskTutor(e)}
                className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-5 rounded-[24px] border border-zinc-200 dark:border-zinc-800 space-y-3.5"
              >
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-blue-500">
                      Private Digital Textbook &amp; Problem Solver
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                      Outputs rendered LaTeX equations, step-by-step derivations, vector diagrams &amp; verified web citations.
                    </p>
                  </div>
                  {tutorHistory.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setTutorHistory([])}
                      className="text-[11px] font-semibold text-zinc-400 hover:text-rose-500 transition"
                    >
                      Clear Session ({tutorHistory.length})
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="text-[11px] font-semibold text-zinc-400 block mb-1">
                      Subject
                    </label>
                    <input
                      type="text"
                      list="tutor-subjects-list"
                      placeholder="e.g. Algorithms / Physics"
                      value={tutorSubject}
                      onChange={(e) => setTutorSubject(e.target.value)}
                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none"
                    />
                    <datalist id="tutor-subjects-list">
                      {uniqueSubjects.map((sub) => (
                        <option key={sub} value={sub} />
                      ))}
                    </datalist>
                  </div>

                  <div>
                    <label className="text-[11px] font-semibold text-zinc-400 block mb-1">
                      Topic / Concept
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Master Theorem or Banker's Algorithm"
                      value={tutorTopic}
                      onChange={(e) => setTutorTopic(e.target.value)}
                      className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none"
                    />
                  </div>
                </div>

                <textarea
                  rows={2}
                  placeholder="Enter a numerical problem, derivation, or specific doubt..."
                  value={tutorQuestion}
                  onChange={(e) => setTutorQuestion(e.target.value)}
                  className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs focus:outline-none"
                />

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex flex-wrap gap-1.5">
                    {[
                      'Solve $T(n) = 2T(n/2) + n \\log n$',
                      'TCP 3-Way Handshake Architecture',
                    ].map((preset, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => {
                          setTutorTopic(preset);
                        }}
                        className="text-[10px] px-2.5 py-1 rounded-full bg-zinc-200/70 dark:bg-zinc-800/80 hover:bg-blue-500/15 hover:text-blue-500 transition"
                      >
                        + {preset}
                      </button>
                    ))}
                  </div>

                  <button
                    type="submit"
                    disabled={tutorLoading}
                    className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition shrink-0"
                  >
                    <Send className="w-3.5 h-3.5" />
                    <span>{tutorLoading ? 'Researching & Typesetting...' : 'Solve & Explain'}</span>
                  </button>
                </div>
              </form>

              {/* Multi-turn Rich Textbook Response History */}
              {tutorHistory.map((turn) => {
                const selectedSub = turnSaveSubjects[turn.id] ?? turn.subject;
                return (
                  <div
                    key={turn.id}
                    className="backdrop-blur-xl bg-white/80 dark:bg-zinc-900/70 p-5 rounded-[24px] border border-zinc-200 dark:border-zinc-800 space-y-4 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap border-b border-zinc-200 dark:border-zinc-800 pb-2.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                        {turn.engine === 'cache'
                          ? 'Instant Topic Cache'
                          : turn.engine === 'groq'
                          ? 'Groq AI'
                          : 'Gemini AI'}
                      </span>
                      {(turn.question || turn.topic) && (
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate max-w-full">
                          Prompt: {turn.question || turn.topic}
                        </p>
                      )}
                    </div>

                    <RichStudyRenderer data={turn.response} />

                    {/* Save Directly to My Private Vault (No Auto-Download) */}
                    <div className="pt-3 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 flex-wrap">
                      {(() => {
                        const subjectChoices = Array.from(
                          new Set([
                            ...uniqueSubjects,
                            ...(turn.response.subject_tag ? [turn.response.subject_tag] : []),
                            'General',
                          ])
                        );
                        const isCustom =
                          Boolean(customSubjectModes[turn.id]) ||
                          !subjectChoices.includes(selectedSub);

                        return (
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[11px] text-zinc-400 flex items-center gap-1">
                              <Lock className="w-3.5 h-3.5 text-emerald-500" />
                              Subject:
                            </span>
                            <select
                              value={isCustom ? '__custom__' : selectedSub}
                              onChange={(e) => {
                                const val = e.target.value;
                                setSavedToVaultKeys((prev) => ({ ...prev, [turn.id]: false }));
                                if (val === '__custom__') {
                                  setCustomSubjectModes((prev) => ({ ...prev, [turn.id]: true }));
                                } else {
                                  setCustomSubjectModes((prev) => ({ ...prev, [turn.id]: false }));
                                  setTurnSaveSubjects((prev) => ({ ...prev, [turn.id]: val }));
                                }
                              }}
                              className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-2.5 py-1 text-xs font-medium focus:outline-none"
                            >
                              {subjectChoices.map((sub) => (
                                <option key={sub} value={sub}>
                                  {sub}
                                </option>
                              ))}
                              <option value="__custom__">+ Custom Subject...</option>
                            </select>
                            {isCustom && (
                              <input
                                type="text"
                                value={selectedSub}
                                onChange={(e) => {
                                  setSavedToVaultKeys((prev) => ({ ...prev, [turn.id]: false }));
                                  setTurnSaveSubjects((prev) => ({
                                    ...prev,
                                    [turn.id]: e.target.value,
                                  }));
                                }}
                                placeholder="Type custom subject..."
                                className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-2.5 py-1 text-xs font-medium w-36 focus:outline-none"
                              />
                            )}
                          </div>
                        );
                      })()}

                      <button
                        type="button"
                        onClick={() =>
                          saveStudyNoteToPrivateVault(turn.response, selectedSub, turn.id)
                        }
                        disabled={savingVaultKey === turn.id}
                        className={`px-4 py-2 rounded-xl text-white text-xs font-semibold flex items-center gap-1.5 transition shrink-0 shadow-sm disabled:opacity-50 ${
                          savedToVaultKeys[turn.id]
                            ? 'bg-purple-600 hover:bg-purple-500'
                            : 'bg-emerald-600 hover:bg-emerald-500'
                        }`}
                      >
                        {savedToVaultKeys[turn.id] ? (
                          <CheckCircle2 className="w-3.5 h-3.5" />
                        ) : (
                          <FileDown className="w-3.5 h-3.5" />
                        )}
                        <span>
                          {savingVaultKey === turn.id
                            ? 'Saving to Vault...'
                            : savedToVaultKeys[turn.id]
                            ? 'Saved to Vault ✓'
                            : 'Save to My Private Vault'}
                        </span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Shareable Universal Study Link Pop-up Modal */}
        {shareModalData && (
          <div
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShareModalData(null)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-[#121214] border border-zinc-200 dark:border-zinc-800 rounded-[24px] p-5 shadow-2xl max-w-md w-full space-y-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0 mt-0.5">
                    <Link2 className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold tracking-tight">
                      Shareable Universal Study Link
                    </h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 leading-relaxed">
                      Paste this link into ChatGPT, Google Gemini, Claude, or send it to a friend. Any AI can read the full User &amp; Co-Pilot Q&amp;A transcript directly.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShareModalData(null)}
                  aria-label="Close share link modal"
                  className="p-1.5 rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition shrink-0"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={shareModalData.shareUrl}
                  onFocus={(e) => e.currentTarget.select()}
                  aria-label="Shareable universal study link"
                  className="flex-1 min-w-0 bg-zinc-100 dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl px-3 py-2 text-xs font-mono text-zinc-800 dark:text-zinc-200 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="button"
                  onClick={handleCopyShareUrl}
                  className="px-3.5 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition shrink-0"
                >
                  {copiedShareLink ? (
                    <Check className="w-3.5 h-3.5" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>{copiedShareLink ? 'Copied ✓' : 'Copy Link'}</span>
                </button>
              </div>

              {!shareModalData.savedToDb && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  Public link storage is not provisioned yet — use &quot;Copy Full Text&quot; to share your transcript immediately.
                </p>
              )}

              <div className="flex items-center justify-between gap-2 pt-2 border-t border-zinc-200 dark:border-zinc-800">
                <button
                  type="button"
                  onClick={handleCopyShareTranscript}
                  className="px-3.5 py-2 rounded-xl bg-zinc-200/70 dark:bg-zinc-800 hover:bg-zinc-300 dark:hover:bg-zinc-700 text-xs font-semibold flex items-center gap-1.5 transition"
                >
                  {copiedShareText ? (
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                  ) : (
                    <Copy className="w-3.5 h-3.5 text-blue-500" />
                  )}
                  <span>{copiedShareText ? 'Copied Full Text ✓' : 'Copy Full Text'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShareModalData(null)}
                  className="px-3 py-2 rounded-xl text-xs font-semibold text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
