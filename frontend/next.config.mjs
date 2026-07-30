/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  async redirects() {
    return [
      { source: "/review", destination: "/results?tab=records", permanent: false },
      { source: "/timeline", destination: "/results?tab=records", permanent: false },
      { source: "/writing", destination: "/results?tab=writing", permanent: false },
    ];
  },
  async rewrites() {
    const backend = process.env.REPROLAB_INTERNAL_API ?? "http://127.0.0.1:8000";
    return [
      { source: "/api/:path*", destination: `${backend}/api/:path*` },
      { source: "/health", destination: `${backend}/health` },
      { source: "/openapi.json", destination: `${backend}/openapi.json` },
      { source: "/docs", destination: `${backend}/docs` },
      { source: "/docs/:path*", destination: `${backend}/docs/:path*` },
    ];
  },
};

export default nextConfig;
