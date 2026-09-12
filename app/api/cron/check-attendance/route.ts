import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { Resend } from 'resend';

const resend = new Resend(process.env.RESEND_API_KEY);

export async function GET(request: NextRequest) {
  // 1. Authenticate Cron Job
  const authHeader = request.headers.get('authorization');
  if (
    process.env.CRON_SECRET &&
    authHeader !== `Bearer ${process.env.CRON_SECRET}`
  ) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // 2. Fetch all student profiles
    const { data: profiles, error: profError } = await supabaseAdmin
      .from('profiles')
      .select('*');

    if (profError || !profiles) {
      return NextResponse.json({ error: profError?.message }, { status: 500 });
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const alertResults = [];

    for (const student of profiles) {
      const target = student.target_threshold || 75.0;

      // Check if student was already alerted recently (rate limit: once every 5 days)
      if (student.last_alerted_at) {
        const lastAlert = new Date(student.last_alerted_at);
        const daysSince = Math.floor(
          (Date.now() - lastAlert.getTime()) / (1000 * 60 * 60 * 24)
        );
        if (daysSince < 5) continue;
      }

      // Fetch user attendance records
      const { data: records } = await supabaseAdmin
        .from('attendance_records')
        .select('slot_id, status, date')
        .eq('user_id', student.id);

      const { data: holidays } = await supabaseAdmin
        .from('holidays')
        .select('holiday_date')
        .eq('user_id', student.id);

      const holidaySet = new Set((holidays || []).map((h) => h.holiday_date));
      const validRecords = (records || []).filter((r) => !holidaySet.has(r.date));

      const totalHeld = validRecords.length;
      if (totalHeld < 5) continue; // Skip fresh ledgers

      const totalAttended = validRecords.filter((r) => r.status === 'present').length;
      const pct = (totalAttended / totalHeld) * 100;

      if (pct < target) {
        const needed = Math.ceil(
          (target * totalHeld - 100 * totalAttended) / (100 - target)
        );

        // Send alert email through Resend
        const emailResponse = await resend.emails.send({
          from: 'Attendance Studio <onboarding@resend.dev>',
          to: student.email,
          subject: `⚠️ Low Attendance Warning: ${pct.toFixed(1)}% (${student.college_name || 'Campus'})`,
          html: `
            <div style="font-family: -apple-system, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; border: 1px solid #e5e5ea; border-radius: 16px;">
              <h2 style="color: #ff3b30; margin-top: 0;">Attendance Alert: Below Threshold</h2>
              <p>Hi <strong>${student.username || 'Student'}</strong>,</p>
              <p>Your current overall attendance has fallen to <strong>${pct.toFixed(1)}%</strong>, which is below your designated target of <strong>${target}%</strong>.</p>
              
              <div style="background: #f2f2f7; padding: 16px; border-radius: 12px; margin: 20px 0;">
                <p style="margin: 4px 0;"><strong>Attended:</strong> ${totalAttended} / ${totalHeld} Lectures</p>
                <p style="margin: 4px 0;"><strong>Consecutive Classes Needed:</strong> +${needed} classes</p>
              </div>

              <p style="font-size: 13px; color: #8e8e93;">To protect your semester eligibility, ensure you attend upcoming scheduled slots without further unexcused absences.</p>
              <p style="font-size: 11px; color: #aeaeb2; margin-top: 24px;">Campus Studio Automated Alert Engine</p>
            </div>
          `,
        });

        // Stamp last_alerted_at
        await supabaseAdmin
          .from('profiles')
          .update({ last_alerted_at: todayStr })
          .eq('id', student.id);

        alertResults.push({ email: student.email, pct, sent: true });
      }
    }

    return NextResponse.json({
      status: 'success',
      processed: profiles.length,
      alerts: alertResults,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}