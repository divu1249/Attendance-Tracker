import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const viewport: Viewport = {
  themeColor: '#2563eb',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: 'ShouldISkip — Smart Attendance Margin & Dynamic Timetable Studio',
  description: 'Track safe bunks, simulate missed classes, and manage dynamic college timetables.',
  manifest: '/manifest.json',
  metadataBase: new URL('https://shouldiskip.vercel.app'),
  icons: {
    icon: '/logo.png',
    apple: '/logo.png',
  },
  openGraph: {
    title: 'ShouldISkip — Attendance Intelligence Engine',
    description: 'Calculate your exact safe bunks, plan long weekends, and never drop below 75%.',
    url: 'https://shouldiskip.vercel.app',
    siteName: 'ShouldISkip',
    images: [
      {
        url: '/logo.png',
        width: 512,
        height: 512,
        alt: 'ShouldISkip Mascot',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'ShouldISkip — Attendance Intelligence Engine',
    description: 'Know exactly how many lectures you can skip without dipping below your threshold.',
    images: ['/logo.png'],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>{children}</body>
    </html>
  );
}