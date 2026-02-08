import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Silence the Turbopack/webpack config mismatch warning
  turbopack: {},
  // Webpack config to explicitly ignore the whatsapp-bot folder
  webpack: (config) => {
    config.watchOptions = {
      ...config.watchOptions,
      ignored: [
        '**/node_modules/**',
        '**/whatsapp-bot/**',
        '**/.git/**'
      ],
    };
    return config;
  },
};

export default nextConfig;
