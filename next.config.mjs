import withPWAInit from 'next-pwa';
import { PHASE_DEVELOPMENT_SERVER } from 'next/constants.js';

const isProduction = process.env.NODE_ENV === 'production' && process.env.VERCEL === '1';

const withPWA = withPWAInit({
  dest: 'public',
  disable: !isProduction, // Runs PWA workers cleanly on live Vercel deployments, avoids Windows build freezes locally
  register: true,
  skipWaiting: true,
});

export default function config(phase) {
  /** @type {import('next').NextConfig} */
  const nextConfig = {
    distDir: phase === PHASE_DEVELOPMENT_SERVER ? '.next-dev' : '.next',
    output: 'standalone',
    reactStrictMode: true,
    swcMinify: true,
  };

  return withPWA(nextConfig);
}