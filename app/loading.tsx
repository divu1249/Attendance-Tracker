export default function Loading() {
  return (
    <div className="min-h-screen bg-zinc-100 dark:bg-[#0c0c0e] p-6 max-w-6xl mx-auto space-y-6 animate-pulse">
      <div className="h-16 bg-zinc-200 dark:bg-zinc-800 rounded-2xl w-full" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="h-32 bg-zinc-200 dark:bg-zinc-800 rounded-3xl" />
        <div className="h-32 bg-zinc-200 dark:bg-zinc-800 rounded-3xl" />
        <div className="h-32 bg-zinc-200 dark:bg-zinc-800 rounded-3xl" />
      </div>
      <div className="h-14 bg-zinc-200 dark:bg-zinc-800 rounded-2xl w-full" />
      <div className="h-64 bg-zinc-200 dark:bg-zinc-800 rounded-3xl w-full" />
    </div>
  );
}