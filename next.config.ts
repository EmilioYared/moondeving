import type { NextConfig } from "next";

const nextConfig: NextConfig = {
    images: {
    domains: ['ewmjdyoobyhwdprfzbwt.supabase.co'], // Replace with your Supabase domain
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
};

export default nextConfig;
