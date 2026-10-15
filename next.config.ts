import type { NextConfig } from "next";

const nextConfig: NextConfig = {
si crm3.tzmicha.com
  experimental: { serverActions: { allowedOrigins: ["localhost:3000", "crm3.tzmicha.com"] } },
  devIndicators: false,
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "**.supabase.in" },
    ],
  },
};

export default nextConfig;
