// pm2 process config for the API in production.
//
// Why this exists: running `npm start` directly in a terminal/screen
// session means the whole app (including every open Socket.IO connection)
// goes down on any laptop sleep, terminal close, crash, or reboot, with
// nothing bringing it back up until someone notices. pm2 supervises the
// process, restarts it automatically, and can start it on machine boot.
//
// Usage:
//   cd apps/api
//   npm run build
//   pm2 start ecosystem.config.js
//   pm2 save              # persist the process list
//   pm2 startup           # prints the command to auto-start pm2 on reboot - run what it prints
//
// After a code change:
//   npm run build
//   pm2 restart empanada-hauz-api
//
// IMPORTANT: exec_mode is intentionally "fork" (single instance), not
// "cluster". Cluster mode runs multiple Node processes behind a round-robin
// balancer, which breaks Socket.IO unless a sticky-session/shared adapter
// (e.g. the Redis adapter) is configured - a client's WebSocket connection
// could land on a different instance than the one that has its session,
// silently dropping realtime events. Given this deployment's history with
// Redis reliability, a single fork instance is the simpler, safer choice
// here; revisit only if this ever needs to scale beyond one process.
module.exports = {
  apps: [
    {
      name: "empanada-hauz-api",
      cwd: __dirname,
      script: "dist/main.js",
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      max_restarts: 10,
      min_uptime: "10s",
      restart_delay: 2000,
      watch: false,
      env: {
        NODE_ENV: "production"
      },
      out_file: "./logs/out.log",
      error_file: "./logs/error.log",
      time: true
    }
  ]
};
