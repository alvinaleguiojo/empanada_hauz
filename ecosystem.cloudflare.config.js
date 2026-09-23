// PM2 configuration for the Cloudflare Tunnel on the local Windows host.
//
// Usage from the repository root:
//   pm2 delete cloudflared
//   pm2 start ecosystem.cloudflare.config.js
//   pm2 save
//
// Do not use:
//   pm2 start cloudflared tunnel run empanada-api
// PM2 on Windows can interpret "tunnel" as a script path.
//
// Set CLOUDFLARED_BIN when the executable lives somewhere else.
// The fallback matches the Windows installation currently used by production.

const path = require("node:path");

const cloudflaredBin =
  process.env.CLOUDFLARED_BIN ||
  "C:\\PROGRAM FILES (X86)\\CLOUDFLARED\\CLOUDFLARED.EXE";

const cloudflaredConfig = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  ".cloudflared",
  "config.yml"
);

module.exports = {
  apps: [
    {
      name: "cloudflared",
      script: cloudflaredBin,
      interpreter: "none",
      args: `--config "${cloudflaredConfig}" tunnel run empanada-api`,
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 5000,
      watch: false,
      time: true,
      out_file: "./logs/cloudflared-out.log",
      error_file: "./logs/cloudflared-error.log"
    }
  ]
};
