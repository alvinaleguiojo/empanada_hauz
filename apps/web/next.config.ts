import type { NextConfig } from "next";
import fs from "node:fs";
import path from "node:path";

const monorepoRoot = path.resolve(process.cwd(), "../..");
const outputFileTracingRoot = fs.existsSync(path.join(monorepoRoot, "package-lock.json")) ? monorepoRoot : undefined;

const nextConfig: NextConfig = {
  outputFileTracingRoot,
  typedRoutes: true
};

export default nextConfig;
