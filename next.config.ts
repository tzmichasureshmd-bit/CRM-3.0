import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: { serverActions: { allowedOrigins: ["localhost:3000", "crm.tzmicha.com"] } },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "**.supabase.in" },
    ],
  },
};

export default nextConfig;
