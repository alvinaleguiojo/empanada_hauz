import type { NextConfig } from "next";
import fs from "node:fs";
import path from "node:path";

const monorepoRoot = path.resolve(process.cwd(), "../..");
const outputFileTracingRoot = fs.existsSync(path.join(monorepoRoot, "package-lock.json")) ? monorepoRoot : undefined;

const nextConfig: NextConfig = {
  outputFileTracingRoot,
  typedRoutes: true,
  images: {
    formats: ["image/avif", "image/webp"],
    deviceSizes: [640, 750, 828, 1080, 1200],
    minimumCacheTTL: 60 * 60 * 24,
  },
};

export default nextConfig;
