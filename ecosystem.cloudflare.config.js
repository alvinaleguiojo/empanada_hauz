// PM2 configuration for the Cloudflare Tunnel on the local Windows host.
//
// IMPORTANT: Keep the tunnel name here, not credentials. cloudflared reads
// the credentials/config from the user's normal ~/.cloudflared directory.
//
// Usage:
//   pm2 delete cloudflared
//   pm2 start ecosystem.cloudflare.config.js
//   pm2 save
//
// Do not use:
//   pm2 start cloudflared tunnel run empanada-api
// On Windows PM2 can interpret "tunnel" as another script path.

module.exports = {
  apps: [
    {
      name: "cloudflared",
      script: "cloudflared",
      interpreter: "none",
      args: "tunnel run empanada-api",
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
