# Deployment Guide

## Containers

- `postgres`: persistent PostgreSQL 16 instance
- `redis`: BullMQ and cache backend
- `api`: NestJS application
- `web`: Next.js application

## Recommended production setup

1. Use managed PostgreSQL and Redis when available.
2. Keep `api` and `web` as separate services behind a reverse proxy.
3. Terminate TLS at Nginx, Caddy, or a cloud load balancer.
4. Restrict Messenger webhook ingress to the API only.
5. Store secrets in a proper secret manager instead of `.env`.
6. Add structured logging, error monitoring, and database backups before launch.

## Production environment

- Set strong `JWT_SECRET`.
- Set valid `OPENAI_API_KEY`.
- Set `META_VERIFY_TOKEN` and `META_PAGE_ACCESS_TOKEN`.
- Set `CORS_ORIGIN` to the deployed frontend URL.
- Set `NEXT_PUBLIC_API_URL` to the public API URL.
- Set `NEXT_PUBLIC_SOCKET_URL` to the public Socket.IO namespace URL.

## Build and run

```bash
docker-compose build
docker-compose up -d
```

## Database rollout

```bash
npm run prisma:deploy --workspace @empanada-hauz/api
npm run prisma:seed --workspace @empanada-hauz/api
```

## Reverse proxy notes

- Proxy `/api` to the NestJS service.
- Proxy Socket.IO upgrades for `/ops`.
- Proxy all other traffic to the Next.js service.

## Hardening backlog

- Add webhook signature verification for Meta payloads.
- Move login token handling from local cookie storage to secure HTTP-only cookie issuance.
- Add rate limiting, audit logs, and role-based permission guards.
- Add tests for AI extraction, queue processors, and order lifecycle transitions.
