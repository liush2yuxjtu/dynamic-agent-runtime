import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  serverExternalPackages: [
    '@ai-sdk/harness-pi',
    '@ai-sdk/sandbox-just-bash',
  ],
};

export default nextConfig;
