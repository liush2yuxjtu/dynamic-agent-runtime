import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },
  serverExternalPackages: [
    '@ai-sdk/harness-cline',
    '@ai-sdk/harness-pi',
    '@cline/agents',
    '@cline/core',
    '@cline/llms',
    '@ai-sdk/sandbox-just-bash',
  ],
};

export default nextConfig;
