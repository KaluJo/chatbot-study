import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      {
        source: '/chatty',
        destination: '/agency',
        permanent: true,
      },
      {
        source: '/survey',
        destination: '/values',
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
