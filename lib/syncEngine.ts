import { supabase } from '@/lib/supabaseClient';

export interface PendingOp {
  id: string;
  table: 'attendance_records' | 'timetable' | 'holidays' | 'profiles';
  action: 'UPSERT' | 'DELETE';
  payload: any;
  timestamp: number;
}

const STORAGE_MIRROR_KEY = 'sis_local_mirror_v1';
const QUEUE_KEY = 'sis_pending_mutation_queue_v1';

export const SyncEngine = {
  getMirror(userId: string): any {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(`${STORAGE_MIRROR_KEY}_${userId}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  setMirror(userId: string, data: any) {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(`${STORAGE_MIRROR_KEY}_${userId}`, JSON.stringify(data));
    } catch (e) {
      console.warn('Storage quota exceeded', e);
    }
  },

  enqueue(op: Omit<PendingOp, 'id' | 'timestamp'>) {
    if (typeof window === 'undefined') return;
    const queue: PendingOp[] = this.getQueue();
    queue.push({
      ...op,
      id: Math.random().toString(36).substring(2, 9),
      timestamp: Date.now(),
    });
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  },

  getQueue(): PendingOp[] {
    if (typeof window === 'undefined') return [];
    try {
      const raw = localStorage.getItem(QUEUE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  async drainQueue(): Promise<number> {
    const queue = this.getQueue();
    if (queue.length === 0) return 0;

    const remaining: PendingOp[] = [];
    let flushedCount = 0;

    for (const op of queue) {
      try {
        if (op.table === 'attendance_records') {
          if (op.action === 'DELETE') {
            await supabase
              .from('attendance_records')
              .delete()
              .eq('user_id', op.payload.user_id)
              .eq('slot_id', op.payload.slot_id)
              .eq('date', op.payload.date);
          } else {
            await supabase
              .from('attendance_records')
              .upsert(op.payload, { onConflict: 'user_id,slot_id,date' });
          }
        } else if (op.table === 'holidays') {
          if (op.action === 'DELETE') {
            await supabase
              .from('holidays')
              .delete()
              .eq('user_id', op.payload.user_id)
              .eq('holiday_date', op.payload.holiday_date);
          } else {
            await supabase.from('holidays').upsert(op.payload);
          }
        } else if (op.table === 'profiles') {
          await supabase.from('profiles').update(op.payload).eq('id', op.payload.id);
        }
        flushedCount++;
      } catch {
        remaining.push(op);
      }
    }

    localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
    return flushedCount;
  },
};