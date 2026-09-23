# Deployment Guide

## Containers

- `redis`: BullMQ and cache backend
- `api`: NestJS application
- `web`: Next.js application

## Recommended production setup

1. Use managed MongoDB and Redis when available.
2. Keep `api` and `web` as separate services behind a reverse proxy.
3. Terminate TLS at Nginx, Caddy, or a cloud load balancer.
4. Restrict Messenger webhook ingress to the API only.
5. Store secrets in a proper secret manager instead of `.env`.
6. Add structured logging, error monitoring, and database backups before launch.

## Production environment

- Set strong `JWT_SECRET`.
- Set valid `OPENAI_API_KEY`.
- Set `META_VERIFY_TOKEN` and `META_PAGE_ACCESS_TOKEN`.
- To append created orders to Google Sheets, set `GOOGLE_SHEETS_SPREADSHEET_ID`, `GOOGLE_SERVICE_ACCOUNT_EMAIL`, and `GOOGLE_PRIVATE_KEY`. Optionally set `GOOGLE_SHEETS_ORDERS_SHEET_NAME`; it defaults to `Orders`.
- To upload Excel exports to a normal Google Drive folder, set `GOOGLE_DRIVE_EXPORT_FOLDER_ID`, `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, and `GOOGLE_OAUTH_REFRESH_TOKEN`. Service accounts require a Google Workspace shared drive because they do not have storage quota in normal My Drive.
- To use browser address autocomplete and Google Maps, set `GOOGLE_MAPS_API_KEY` with the required Maps JavaScript/Places APIs enabled. This key is served by the NestJS `/api/google-maps-key` endpoint; do not use `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` for this feature.
- To calculate own-delivery road distance, fare, and ETA, the same `GOOGLE_MAPS_API_KEY` must have Geocoding API and Routes API enabled. If pickup/dropoff coordinates are supplied from Places, the app can estimate distance and ETA without Routes API.
- Tune own-delivery pricing with `DELIVERY_BASE_FARE`, `DELIVERY_PER_KM_RATE`, `DELIVERY_SERVICE_FEE`, `DELIVERY_DISTANCE_MULTIPLIER`, and `DELIVERY_AVG_SPEED_KMPH`.
- Set `CORS_ORIGIN` to the deployed frontend URL.
- Set `NEXT_PUBLIC_API_URL=https://api.empanadahauz.com/api` for the web app.
- Set `NEXT_PUBLIC_SOCKET_URL=https://api.empanadahauz.com/ops` for the web app.
- Documents and videos are stored outside MongoDB. For Docker Compose, the API mounts the persistent `documents-data` volume at `/data/documents` and sets `DOCUMENTS_STORAGE_PATH=/data/documents`.
- If deploying without Docker, set `DOCUMENTS_STORAGE_PATH` to a persistent writable directory. Do not point it at an ephemeral container filesystem.

## Cloudflare Tunnel + PM2 on the local Windows host

The production frontend and API can run locally while Cloudflare Tunnel provides the public HTTPS endpoints:

- `https://empanadahauz.com` -> Next.js on `127.0.0.1:3000`
- `https://www.empanadahauz.com` -> Next.js on `127.0.0.1:3000`
- `https://api.empanadahauz.com` -> NestJS on `127.0.0.1:4000`
- Socket.IO namespace `/ops` remains on the API hostname.

Keep the tunnel credentials outside Git. Start from `cloudflared/config.yml.example` and create the real Cloudflare config in the Windows user's `.cloudflared` directory.

For the existing named tunnel:

```powershell
cloudflared tunnel route dns empanada-api empanadahauz.com
cloudflared tunnel route dns empanada-api www.empanadahauz.com
cloudflared tunnel route dns empanada-api api.empanadahauz.com
```

Only run the DNS commands when the hostname routes do not already exist.

The repository includes `ecosystem.cloudflare.config.js` specifically because passing `tunnel run empanada-api` directly to PM2 on Windows can cause PM2 to interpret `tunnel` as the script path. Use the ecosystem file instead:

```powershell
pm2 delete cloudflared
pm2 start ecosystem.cloudflare.config.js
pm2 save
pm2 logs cloudflared
```

The PM2 entry expects the `cloudflared` executable to be available on PATH, which matches the Windows installation used by this deployment.

Before starting the tunnel, make sure the local services are healthy:

```powershell
curl http://127.0.0.1:3000
curl http://127.0.0.1:4000/api/health
```

Then verify the public endpoints:

```powershell
curl https://empanadahauz.com
curl https://api.empanadahauz.com/api/health
```

Cloudflare Tunnel proxies WebSocket upgrades, so the web app can continue using `https://api.empanadahauz.com/ops` for Socket.IO.

## Build and run

```bash
docker-compose build
docker-compose up -d
```

## Database rollout

```bash
npm run prisma:push --workspace @empanada-hauz/api
npm run prisma:seed --workspace @empanada-hauz/api
```

## Reverse proxy notes

- Proxy `/api` to the NestJS service.
- Proxy Socket.IO upgrades for `/ops`.
- Proxy all other traffic to the Next.js service.
- Preserve HTTP `Range` requests for `/documents/:id/content` so browser video playback can seek without downloading the whole file.

## Hardening backlog

- Add webhook signature verification for Meta payloads.
- Move login token handling from local cookie storage to secure HTTP-only cookie issuance.
- Add rate limiting, audit logs, and role-based permission guards.
- Add tests for AI extraction, queue processors, and order lifecycle transitions.
