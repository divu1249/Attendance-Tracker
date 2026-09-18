import Link from 'next/link';

export default function PrivacyPolicy() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-[#0c0c0e] text-zinc-900 dark:text-zinc-100 p-6 md:p-12 max-w-3xl mx-auto space-y-6 text-xs leading-relaxed">
      <Link href="/dashboard" className="text-blue-500 hover:underline">← Back to Workspace</Link>
      <h1 className="text-2xl font-bold tracking-tight">Privacy Policy</h1>
      <p className="text-zinc-500">Last updated: September 2026</p>

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">1. Data Ownership</h2>
        <p>ShouldISkip does not sell, monetize, or track personal student identity records. Your attendance entries and schedules are stored securely in PostgreSQL with Row-Level Security (RLS) policies scoped strictly to your authenticated session ID.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">2. Local Storage Usage</h2>
        <p>This application uses your browser's local storage and IndexedDB solely for the Write-Ahead Local Ledger (WALL) pattern, ensuring offline functionality and network resilience.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">3. Account Deletion</h2>
        <p>You can execute a complete, irreversible purge of all personal attendance data, timetable records, and account credentials directly inside your Profile settings at any time.</p>
      </section>
    </main>
  );
}