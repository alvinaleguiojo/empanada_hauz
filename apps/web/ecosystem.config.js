// PM2 process config for the Next.js frontend on the local Windows host.
//
// From the repository root:
//   npm run build --workspace @empanada-hauz/web
//   pm2 start apps/web/ecosystem.config.js
//   pm2 save
//
// The frontend is intentionally a single Next.js instance because Cloudflare
// Tunnel handles the public ingress and no local load-balancing is needed.

module.exports = {
  apps: [
    {
      name: "empanada-hauz-web",
      cwd: __dirname,
      script: "npm.cmd",
      args: "start -- --port 3000",
      interpreter: "none",
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
