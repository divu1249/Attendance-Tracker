'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { toast } from 'sonner';
import {
  ArrowBigUp,
  ArrowBigDown,
  MessageSquarePlus,
  X,
  Plus,
  Trash2,
  Sparkles,
  Flame,
  Clock,
  CheckCircle2,
  Rocket,
  Compass,
  Filter,
  LogIn,
} from 'lucide-react';

export type SuggestionCategory = 'Feature' | 'AI Copilot' | 'Classrooms' | 'Bug';
export type SuggestionStatus = 'open' | 'planned' | 'in_progress' | 'shipped';

export interface SuggestionItem {
  id: string;
  user_id: string;
  author_name: string;
  title: string;
  description: string;
  category: string;
  status: SuggestionStatus;
  score: number;
  created_at: string;
}

interface SuggestionBoxDrawerProps {
  user?: any;
  profile?: any;
  externalOpen?: boolean;
  onExternalOpenChange?: (open: boolean) => void;
  onRequireAuth?: () => void;
}

const CATEGORIES: Array<'All' | SuggestionCategory> = [
  'All',
  'Feature',
  'AI Copilot',
  'Classrooms',
  'Bug',
];

const STATUS_META: Record<
  SuggestionStatus,
  { label: string; badgeClass: string; icon?: React.ReactNode }
> = {
  open: {
    label: 'Open',
    badgeClass:
      'bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-400 border-zinc-300/60 dark:border-zinc-700',
  },
  planned: {
    label: 'Planned',
    badgeClass:
      'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/25',
    icon: <Compass className="w-2.5 h-2.5" />,
  },
  in_progress: {
    label: 'In Progress',
    badgeClass:
      'bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/25',
    icon: <Sparkles className="w-2.5 h-2.5" />,
  },
  shipped: {
    label: 'Shipped',
    badgeClass:
      'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/25',
    icon: <Rocket className="w-2.5 h-2.5" />,
  },
};

export default function SuggestionBoxDrawer({
  user,
  profile,
  externalOpen,
  onExternalOpenChange,
  onRequireAuth,
}: SuggestionBoxDrawerProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = externalOpen !== undefined ? externalOpen : internalOpen;

  const setOpen = useCallback(
    (next: boolean) => {
      if (onExternalOpenChange) onExternalOpenChange(next);
      else setInternalOpen(next);
    },
    [onExternalOpenChange]
  );

  const isAdmin = user?.email === 'divyanshchauhan356@gmail.com';

  // Strict privacy: never expose email publicly, only full_name or username fallback
  const publicName = useMemo(() => {
    const fn = profile?.full_name?.trim();
    if (fn) return fn;
    const un = profile?.username?.trim();
    if (un) return un;
    return 'Student';
  }, [profile?.full_name, profile?.username]);

  const [suggestions, setSuggestions] = useState<SuggestionItem[]>([]);
  const [userVotes, setUserVotes] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState<'top' | 'newest'>('top');
  const [categoryFilter, setCategoryFilter] = useState<'All' | SuggestionCategory>('All');

  // New suggestion form state
  const [showNewForm, setShowNewForm] = useState(false);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<SuggestionCategory>('Feature');
  const [submitting, setSubmitting] = useState(false);

  const fetchSuggestions = useCallback(async () => {
    setLoading(true);
    try {
      let query = supabase.from('suggestions').select('*');
      if (sortBy === 'top') {
        query = query.order('score', { ascending: false }).order('created_at', { ascending: false });
      } else {
        query = query.order('created_at', { ascending: false });
      }

      const { data, error } = await query;
      if (error) throw error;

      setSuggestions((data || []) as SuggestionItem[]);

      if (user?.id) {
        try {
          const { data: voteRows } = await supabase
            .from('suggestion_votes')
            .select('suggestion_id, vote')
            .eq('user_id', user.id);

          if (voteRows) {
            const map: Record<string, number> = {};
            voteRows.forEach((v: any) => {
              map[v.suggestion_id] = Number(v.vote) || 0;
            });
            setUserVotes(map);
          }
        } catch {
          // Optional table read fallback
        }
      }
    } catch (err: any) {
      console.warn('Suggestions fetch warning:', err?.message);
    } finally {
      setLoading(false);
    }
  }, [sortBy, user?.id]);

  useEffect(() => {
    if (isOpen) {
      fetchSuggestions();
    }
  }, [isOpen, fetchSuggestions]);

  const filteredSuggestions = useMemo(() => {
    if (categoryFilter === 'All') return suggestions;
    return suggestions.filter(
      (s) => (s.category || '').toLowerCase() === categoryFilter.toLowerCase()
    );
  }, [suggestions, categoryFilter]);

  const handleVote = async (item: SuggestionItem, clickedVote: 1 | -1) => {
    if (!user) {
      toast.error('Please log in to vote on community ideas.');
      if (onRequireAuth) {
        setOpen(false);
        onRequireAuth();
      }
      return;
    }

    const prevVote = userVotes[item.id] || 0;
    const nextVote = prevVote === clickedVote ? 0 : clickedVote;
    const delta = nextVote - prevVote;

    // Optimistic update
    setUserVotes((prev) => ({ ...prev, [item.id]: nextVote }));
    setSuggestions((prev) =>
      prev.map((s) => (s.id === item.id ? { ...s, score: (s.score || 0) + delta } : s))
    );

    try {
      const { error } = await supabase.rpc('vote_suggestion', {
        p_suggestion_id: item.id,
        p_vote: nextVote,
      });

      if (error) throw error;

      // Sync exact score silently
      const { data: refreshed } = await supabase
        .from('suggestions')
        .select('score')
        .eq('id', item.id)
        .maybeSingle();

      if (refreshed && typeof refreshed.score === 'number') {
        setSuggestions((prev) =>
          prev.map((s) => (s.id === item.id ? { ...s, score: refreshed.score } : s))
        );
      }
    } catch (err: any) {
      // Revert optimistic update on failure
      setUserVotes((prev) => ({ ...prev, [item.id]: prevVote }));
      setSuggestions((prev) =>
        prev.map((s) => (s.id === item.id ? { ...s, score: (s.score || 0) - delta } : s))
      );
      toast.error('Could not record vote: ' + (err?.message || 'Unknown error'));
    }
  };

  const handleSubmitSuggestion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      toast.error('Sign in to post a suggestion.');
      if (onRequireAuth) {
        setOpen(false);
        onRequireAuth();
      }
      return;
    }

    if (!title.trim() || !description.trim()) return;
    setSubmitting(true);

    try {
      const { data, error } = await supabase
        .from('suggestions')
        .insert({
          user_id: user.id,
          author_name: publicName,
          title: title.trim(),
          description: description.trim(),
          category,
          status: 'open',
          score: 1,
        })
        .select()
        .single();

      if (error) throw error;

      // Auto-register creator's initial upvote if RPC is available
      try {
        await supabase.rpc('vote_suggestion', {
          p_suggestion_id: data.id,
          p_vote: 1,
        });
      } catch {
        // Non-fatal
      }

      setTitle('');
      setDescription('');
      setShowNewForm(false);
      toast.success('Suggestion posted to community board!');
      await fetchSuggestions();
    } catch (err: any) {
      toast.error('Failed to post suggestion: ' + err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAdminStatusChange = async (id: string, nextStatus: SuggestionStatus) => {
    if (!isAdmin) return;
    const prevList = suggestions;
    setSuggestions((prev) =>
      prev.map((s) => (s.id === id ? { ...s, status: nextStatus } : s))
    );

    const { error } = await supabase
      .from('suggestions')
      .update({ status: nextStatus })
      .eq('id', id);

    if (error) {
      setSuggestions(prevList);
      toast.error('Status update failed: ' + error.message);
    } else {
      toast.success(`Marked as ${STATUS_META[nextStatus].label}`);
    }
  };

  const handleAdminDelete = async (id: string) => {
    if (!isAdmin) return;
    const { error } = await supabase.from('suggestions').delete().eq('id', id);
    if (error) {
      toast.error('Failed to delete suggestion: ' + error.message);
    } else {
      setSuggestions((prev) => prev.filter((s) => s.id !== id));
      toast.success('Suggestion removed.');
    }
  };

  return (
    <>
      {/* Persistent Floating Right-Edge Vertical Banner */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open Community Ideas and Feedback Board"
        className="fixed right-0 top-1/2 -translate-y-1/2 z-40 group flex items-center gap-1.5 py-3.5 px-2 rounded-l-2xl backdrop-blur-xl bg-white/85 dark:bg-zinc-900/85 border border-r-0 border-zinc-200 dark:border-zinc-800 shadow-lg hover:bg-blue-600 hover:text-white hover:border-blue-500 transition-all duration-200"
      >
        <div className="flex flex-col items-center gap-1.5">
          <ArrowBigUp className="w-4 h-4 text-blue-500 group-hover:text-white transition" />
          <span
            className="text-[11px] font-bold tracking-wider uppercase select-none"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            Ideas &amp; Feedback
          </span>
        </div>
      </button>

      {/* Reddit-Style Global Suggestion Popup / Drawer */}
      {isOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-end p-0 sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-zinc-100 dark:bg-[#0c0c0e] sm:rounded-[28px] border-l sm:border border-zinc-200 dark:border-zinc-800 w-full max-w-2xl h-full sm:h-[90vh] flex flex-col shadow-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="px-6 py-4 backdrop-blur-xl bg-white/80 dark:bg-zinc-900/80 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-500 flex items-center justify-center shrink-0">
                  <MessageSquarePlus className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-bold tracking-tight truncate">
                      Community Suggestion Box
                    </h2>
                    <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                      {suggestions.length}
                    </span>
                  </div>
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400 truncate">
                    Upvote features you want next. Names only — emails stay private.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    if (!user) {
                      toast.error('Please sign in to submit an idea.');
                      if (onRequireAuth) {
                        setOpen(false);
                        onRequireAuth();
                      }
                      return;
                    }
                    setShowNewForm(!showNewForm);
                  }}
                  className="px-3.5 py-1.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1.5 shadow-sm transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Post Idea</span>
                </button>

                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="w-8 h-8 rounded-full bg-zinc-200/70 dark:bg-zinc-800/70 hover:opacity-80 flex items-center justify-center text-zinc-500 transition"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Controls Bar: Sort + Category Filters */}
            <div className="px-6 py-3 bg-white/60 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 shrink-0">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setSortBy('top')}
                  className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 transition ${
                    sortBy === 'top'
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                      : 'bg-zinc-200/60 dark:bg-zinc-800/70 text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  <Flame className="w-3 h-3" />
                  <span>Top Voted</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSortBy('newest')}
                  className={`px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-1 transition ${
                    sortBy === 'newest'
                      ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
                      : 'bg-zinc-200/60 dark:bg-zinc-800/70 text-zinc-600 dark:text-zinc-400'
                  }`}
                >
                  <Clock className="w-3 h-3" />
                  <span>Newest</span>
                </button>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                <Filter className="w-3 h-3 text-zinc-400 shrink-0 mr-0.5" />
                {CATEGORIES.map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold shrink-0 transition border ${
                      categoryFilter === cat
                        ? 'bg-blue-600 text-white border-transparent'
                        : 'bg-white/70 dark:bg-zinc-900/70 border-zinc-200 dark:border-zinc-800 text-zinc-600 dark:text-zinc-400 hover:border-blue-500/40'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Unauthenticated Notice */}
              {!user && (
                <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-3.5 rounded-2xl border border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-3">
                  <p className="text-xs text-zinc-600 dark:text-zinc-400">
                    Browsing in read-only mode. Log in to upvote ideas or submit your own request.
                  </p>
                  {onRequireAuth && (
                    <button
                      type="button"
                      onClick={() => {
                        setOpen(false);
                        onRequireAuth();
                      }}
                      className="px-3 py-1.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-1 shrink-0 transition"
                    >
                      <LogIn className="w-3 h-3" />
                      <span>Sign In</span>
                    </button>
                  )}
                </div>
              )}

              {/* New Suggestion Form */}
              {showNewForm && (
                <form
                  onSubmit={handleSubmitSuggestion}
                  className="backdrop-blur-xl bg-white/80 dark:bg-zinc-900/80 p-5 rounded-[24px] border border-blue-500/30 shadow-sm space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-blue-500">
                      Submit New Feature Idea or Bug
                    </h3>
                    <button
                      type="button"
                      onClick={() => setShowNewForm(false)}
                      className="text-xs text-zinc-400 hover:text-zinc-600"
                    >
                      Cancel
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <input
                      type="text"
                      required
                      maxLength={100}
                      placeholder="Short, clear title..."
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      className="sm:col-span-2 bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as SuggestionCategory)}
                      className="bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs focus:outline-none"
                    >
                      <option value="Feature">Feature</option>
                      <option value="AI Copilot">AI Copilot</option>
                      <option value="Classrooms">Classrooms</option>
                      <option value="Bug">Bug</option>
                    </select>
                  </div>

                  <textarea
                    required
                    rows={3}
                    maxLength={600}
                    placeholder="Describe the use case or improvement..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="w-full bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700 rounded-xl px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 resize-y"
                  />

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] text-zinc-400">
                      Posting publicly as <strong className="text-zinc-600 dark:text-zinc-200">{publicName}</strong>
                    </span>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 transition"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{submitting ? 'Submitting...' : 'Submit Idea'}</span>
                    </button>
                  </div>
                </form>
              )}

              {/* Feed */}
              {loading ? (
                <div className="py-12 text-center text-xs text-zinc-400">
                  Loading community suggestions...
                </div>
              ) : filteredSuggestions.length === 0 ? (
                <div className="backdrop-blur-xl bg-white/70 dark:bg-zinc-900/60 p-10 rounded-[24px] border border-zinc-200 dark:border-zinc-800 text-center space-y-2">
                  <MessageSquarePlus className="w-8 h-8 mx-auto text-zinc-400" />
                  <h3 className="text-sm font-bold">No suggestions yet</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400">
                    Be the first student to suggest an improvement in this category!
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredSuggestions.map((item) => {
                    const myVote = userVotes[item.id] || 0;
                    const statusKey: SuggestionStatus =
                      item.status && STATUS_META[item.status] ? item.status : 'open';
                    const statusMeta = STATUS_META[statusKey];

                    return (
                      <div
                        key={item.id}
                        className="backdrop-blur-xl bg-white/80 dark:bg-zinc-900/70 rounded-[22px] border border-zinc-200 dark:border-zinc-800 p-4 flex gap-3.5 hover:border-blue-500/30 transition shadow-sm"
                      >
                        {/* Left Reddit-Style Vote Column */}
                        <div className="flex flex-col items-center justify-start bg-zinc-100 dark:bg-zinc-800/80 border border-zinc-200 dark:border-zinc-700/70 rounded-2xl px-2 py-2 gap-1 h-fit shrink-0 min-w-[44px]">
                          <button
                            type="button"
                            onClick={() => handleVote(item, 1)}
                            aria-label="Upvote suggestion"
                            className={`p-1 rounded-lg transition ${
                              myVote === 1
                                ? 'text-blue-600 dark:text-blue-400 bg-blue-500/15'
                                : 'text-zinc-400 hover:text-blue-500'
                            }`}
                          >
                            <ArrowBigUp
                              className="w-4 h-4"
                              fill={myVote === 1 ? 'currentColor' : 'none'}
                            />
                          </button>

                          <span
                            className={`text-xs font-extrabold tabular-nums ${
                              myVote === 1
                                ? 'text-blue-600 dark:text-blue-400'
                                : myVote === -1
                                ? 'text-rose-500'
                                : 'text-zinc-800 dark:text-zinc-200'
                            }`}
                          >
                            {item.score ?? 0}
                          </span>

                          <button
                            type="button"
                            onClick={() => handleVote(item, -1)}
                            aria-label="Downvote suggestion"
                            className={`p-1 rounded-lg transition ${
                              myVote === -1
                                ? 'text-rose-500 bg-rose-500/15'
                                : 'text-zinc-400 hover:text-rose-500'
                            }`}
                          >
                            <ArrowBigDown
                              className="w-4 h-4"
                              fill={myVote === -1 ? 'currentColor' : 'none'}
                            />
                          </button>
                        </div>

                        {/* Right Content Column */}
                        <div className="flex-1 min-w-0 space-y-2">
                          <div className="flex items-start justify-between gap-2 flex-wrap">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-zinc-200/70 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300 border border-zinc-300/50 dark:border-zinc-700">
                                {item.category || 'Feature'}
                              </span>

                              <span
                                className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full border flex items-center gap-1 ${statusMeta.badgeClass}`}
                              >
                                {statusMeta.icon}
                                <span>{statusMeta.label}</span>
                              </span>
                            </div>

                            {isAdmin && (
                              <div className="flex items-center gap-1.5">
                                <select
                                  value={statusKey}
                                  onChange={(e) =>
                                    handleAdminStatusChange(
                                      item.id,
                                      e.target.value as SuggestionStatus
                                    )
                                  }
                                  aria-label="Update suggestion status"
                                  className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-0.5 text-[11px] font-semibold focus:outline-none"
                                >
                                  <option value="open">Open</option>
                                  <option value="planned">Planned</option>
                                  <option value="in_progress">In Progress</option>
                                  <option value="shipped">Shipped</option>
                                </select>

                                <button
                                  type="button"
                                  onClick={() => handleAdminDelete(item.id)}
                                  className="p-1 rounded-lg text-zinc-400 hover:text-rose-500 transition"
                                  title="Delete suggestion"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>

                          <h3 className="text-sm font-bold tracking-tight leading-snug">
                            {item.title}
                          </h3>

                          <p className="text-xs text-zinc-600 dark:text-zinc-400 whitespace-pre-wrap leading-relaxed">
                            {item.description}
                          </p>

                          <div className="flex items-center justify-between text-[11px] text-zinc-400 pt-1">
                            <span>
                              Suggested by <strong className="text-zinc-600 dark:text-zinc-300">{item.author_name || 'Student'}</strong>
                            </span>
                            <span className="font-mono text-[10px]">
                              {new Date(item.created_at).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
