import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async redirects() {
    return [
      { source: "/", destination: "/costing-hub", permanent: true },
      { source: "/sheets", destination: "/costing-hub/sheets", permanent: true },
      {
        source: "/sheets/:id",
        destination: "/costing-hub/sheets/:id",
        permanent: true,
      },
      {
        source: "/products",
        destination: "/costing-hub/products",
        permanent: true,
      },
    ];
  },
};

export default nextConfig;
