FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN npm install

FROM node:20-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build --workspace @empanada-hauz/shared && npm run prisma:generate --workspace @empanada-hauz/api && npm run build --workspace @empanada-hauz/api

FROM node:20-bookworm-slim
WORKDIR /app/apps/api
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-venv libsndfile1 \
  && python3 -m venv /opt/empanada-voice \
  && /opt/empanada-voice/bin/pip install --no-cache-dir --upgrade pip \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules /app/node_modules
COPY --from=builder /app/apps/api/dist ./dist
COPY --from=builder /app/apps/api/package.json ./package.json
COPY --from=builder /app/apps/api/prisma ./prisma
COPY --from=builder /app/apps/api/tools ./tools
COPY --from=builder /app/packages/shared/dist /app/packages/shared/dist

RUN /opt/empanada-voice/bin/pip install --no-cache-dir -r ./tools/requirements-transcription.txt -r ./tools/requirements-tts.txt

ENV TRANSCRIPTION_PYTHON=/opt/empanada-voice/bin/python
ENV TTS_PYTHON=/opt/empanada-voice/bin/python

CMD ["node", "dist/main.js"]
