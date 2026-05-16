FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm install

FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build --workspace @empanada-hauz/shared && npm run build --workspace @empanada-hauz/web

FROM node:20-alpine
WORKDIR /app/apps/web
ENV NODE_ENV=production
COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/apps/web/.next ./.next
COPY --from=builder /app/apps/web/package.json ./package.json
COPY --from=builder /app/apps/web/public ./public
COPY --from=builder /app/packages/shared/dist /app/packages/shared/dist
CMD ["/app/node_modules/.bin/next", "start"]
