import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET(request: Request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = new Date().toISOString().split('T')[0];
  const { data: users, error: userErr } = await supabase.from('profiles').select('*');

  if (userErr || !users) return NextResponse.json({ processed: 0 });

  for (const user of users) {
    if (user.last_alerted_at === today) continue;

    const { data: records } = await supabase
      .from('attendance_records')
      .select('status, date')
      .eq('user_id', user.id);

    const { data: userHolidays } = await supabase
      .from('holidays')
      .select('holiday_date')
      .eq('user_id', user.id);

    const holidays = new Set((userHolidays || []).map((h) => h.holiday_date));
    const valid = (records || []).filter((r) => !holidays.has(r.date));

    if (valid.length === 0) continue;

    const present = valid.filter((r) => r.status === 'present').length;
    const total = valid.length;
    const pct = (present / total) * 100;
    const target = user.target_threshold || 75;

    if (pct < target) {
      const needed = Math.max(0, Math.ceil((target * total - 100 * present) / (100 - target)));

      await resend.emails.send({
        from: 'Attendance Alerts <onboarding@resend.dev>',
        to: user.email,
        subject: `⚠️ Low Attendance Alert: ${pct.toFixed(1)}% (Target: ${target}%)`,
        html: `
          <div style="font-family: sans-serif; padding: 20px; color: #0f172a; line-height: 1.5;">
            <h2 style="color: #dc2626;">Attendance Shortage Alert</h2>
            <p>Your aggregate attendance is currently at <strong>${pct.toFixed(1)}%</strong>, below your goal of ${target}%.</p>
            <p>Classes attended: <strong>${present} / ${total}</strong></p>
            <p style="color: #dc2626; font-weight: bold;">
              Attend the next ${needed} consecutive classes without absence to recover above ${target}%.
            </p>
          </div>
        `,
      });

      await supabase
        .from('profiles')
        .update({ last_alerted_at: today })
        .eq('id', user.id);
    }
  }

  return NextResponse.json({ status: 'ok' });
}