import Link from 'next/link';
import Image from 'next/image';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#0c0c0e] text-zinc-900 dark:text-zinc-100 flex flex-col items-center justify-center p-6 text-center">
      <div className="relative w-28 h-28 mb-4">
        <Image
          src="/logo.png"
          alt="ShouldISkip Cat Mascot"
          fill
          sizes="112px"
          className="object-contain drop-shadow-lg"
          priority
        />
      </div>
      <h1 className="text-4xl font-extrabold tracking-tight">404</h1>
      <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-sm mt-2 mb-6">
        Looks like this lecture was skipped. The route you are looking for does not exist.
      </p>
      <Link
        href="/dashboard"
        className="px-5 py-2.5 rounded-full bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold shadow-lg shadow-blue-500/20 transition active:scale-95"
      >
        Return to Safety
      </Link>
    </div>
  );
}