import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: { serverActions: { allowedOrigins: ["localhost:3000"] } },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "**.supabase.in" },
    ],
  },
};

export default nextConfig;
