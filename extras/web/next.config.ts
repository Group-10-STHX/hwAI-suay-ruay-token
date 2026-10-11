import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  distDir: process.env.WAI_DIST_DIR || '.next', // lets a second build/server run beside `next dev` without clobbering it
};

export default nextConfig;
