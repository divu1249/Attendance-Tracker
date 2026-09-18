import withPWAInit from 'next-pwa';

const isProduction = process.env.NODE_ENV === 'production' && process.env.VERCEL === '1';

const withPWA = withPWAInit({
  dest: 'public',
  disable: !isProduction, // Runs PWA workers cleanly on live Vercel deployments, avoids Windows build freezes locally
  register: true,
  skipWaiting: true,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
};

export default withPWA(nextConfig);