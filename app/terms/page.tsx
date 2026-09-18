import Link from 'next/link';

export default function TermsAndConditions() {
  return (
    <main className="min-h-screen bg-zinc-50 dark:bg-[#0c0c0e] text-zinc-900 dark:text-zinc-100 p-6 md:p-12 max-w-3xl mx-auto space-y-6 text-xs leading-relaxed">
      <Link href="/dashboard" className="text-blue-500 hover:underline">← Back to Workspace</Link>
      <h1 className="text-2xl font-bold tracking-tight">Terms of Service</h1>
      <p className="text-zinc-500">Last updated: September 2026</p>

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">1. Attendance Calculations & Disclaimer</h2>
        <p>Calculations provided by ShouldISkip (including safe skips, required recovery lectures, and long-weekend simulations) are mathematical projections. Final eligibility determinations are governed by your individual university, college, or institutional authority.</p>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-bold text-zinc-800 dark:text-zinc-200">2. Anonymous Class Pulse</h2>
        <p>Participation in anonymous room voting is non-binding and aggregates votes purely by share token without transmitting personally identifiable credentials.</p>
      </section>
    </main>
  );
}