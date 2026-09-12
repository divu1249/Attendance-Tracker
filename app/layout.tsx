import './globals.css';

export const metadata = {
  title: 'Attendance Tracker',
  description: 'College attendance tracking and alerts',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}