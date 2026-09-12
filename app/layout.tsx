import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ShouldISkip — Smart Attendance Margin & Timetable Studio',
  description: 'Calculate your safe skips, manage dynamic schedules, and monitor attendance thresholds.',
  icons: {
    icon: '/icon.png',
    apple: '/icon.png',
  },
  openGraph: {
    title: 'ShouldISkip — Attendance & Bunk Margin Calculator',
    description: 'Calculate your safe bunks, manage schedules, and stay above the required threshold.',
    url: 'https://shouldiskip.vercel.app',
    siteName: 'ShouldISkip',
    locale: 'en_US',
    type: 'website',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased selection:bg-blue-500/20">
        {children}
      </body>
    </html>
  );
}