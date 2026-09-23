// PM2 process config for the Next.js frontend on the local Windows host.
//
// From the repository root:
//   npm run build --workspace @empanada-hauz/web
//   pm2 start apps/web/ecosystem.config.js
//   pm2 save
//
// Use Next's Node entrypoint directly instead of npm.cmd. PM2 on Windows can
// fail with spawn EINVAL when npm.cmd is used with interpreter=none.

const path = require("node:path");

const repoRoot = path.resolve(__dirname, "../..");
const nextEntrypoint = path.join(
  repoRoot,
  "node_modules",
  "next",
  "dist",
  "bin",
  "next"
);

module.exports = {
  apps: [
    {
      name: "empanada-hauz-web",
      cwd: __dirname,
      script: nextEntrypoint,
      args: "start --port 3000",
      interpreter: "node",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 2000,
      watch: false,
      time: true,
      env: {
        NODE_ENV: "production"
      },
      out_file: "./logs/web-out.log",
      error_file: "./logs/web-error.log"
    }
  ]
};
