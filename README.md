# Empanada Hauz Operations System

Production-oriented monorepo for an AI-powered food operations management system for an empanada business. The stack follows the requested architecture:

- `apps/api`: NestJS, Prisma, MongoDB, Redis, BullMQ, JWT, Socket.IO
- `apps/web`: Next.js App Router, TypeScript, TailwindCSS, Zustand, Socket.IO client
- `packages/shared`: shared domain types between frontend and backend

## Core capabilities

- Messenger webhook verification and ingestion with immediate `200 OK`
- Messenger handover/standby diagnostics and optional thread-control requests
- Import of existing Messenger conversations and historical messages through the Meta Graph API
- Protected Messenger history sync endpoint with pagination and idempotent message import
- OpenAI-driven intent classification and order extraction for new webhook messages only
- Order workflow with batch assignment and kitchen queue progression
- Manual Maxim booking queue with copy-ready payloads
- Customer CRM metrics and VIP tracking model
- Inventory tracking with adjustment logs
- Operations analytics overview
- Realtime updates over Socket.IO

## Repository structure

```text
.
├─ apps
│  ├─ api
│  │  ├─ prisma
│  │  │  ├─ migrations
│  │  │  ├─ schema.prisma
│  │  │  └─ seed.ts
│  │  └─ src
│  │     ├─ common
│  │     ├─ database
│  │     └─ modules
│  │        ├─ ai
│  │        ├─ analytics
│  │        ├─ auth
│  │        ├─ batches
│  │        ├─ customers
│  │        ├─ deliveries
│  │        ├─ health
│  │        ├─ inventory
│  │        ├─ kitchen
│  │        ├─ messenger
│  │        ├─ notifications
│  │        └─ orders
│  └─ web
│     └─ src
│        ├─ app
│        ├─ components
│        ├─ lib
│        └─ store
└─ packages
   └─ shared
```

## Local development

1. Copy `.env.example` to `.env`.
2. Start infrastructure:

```bash
docker-compose up -d redis
```

3. Install dependencies:

```bash
npm install
```

4. Generate Prisma client, push the MongoDB schema, and seed:

```bash
npm run db:generate
npm run db:push
npm run prisma:seed --workspace @empanada-hauz/api
```

5. Run the apps:

```bash
npm run dev
```

## Environment variables

- `DATABASE_URL`: MongoDB connection string
- `REDIS_URL`: Redis connection string
- `JWT_SECRET`: JWT signing key
- `OPENAI_API_KEY`: OpenAI API key for AI extraction
- `OPENAI_MODEL`: model name, default `gpt-5-mini`
- `META_VERIFY_TOKEN`: verification token for Messenger webhook
- `META_PAGE_ACCESS_TOKEN`: Page access token for Messenger Send API and conversation/message history reads
- `META_PAGE_ID`: Facebook Page ID used for the conversations Graph API
- `META_GRAPH_API_VERSION`: Graph API version, defaults to `v26.0`
- `META_AUTO_REQUEST_THREAD_CONTROL`: set to `true` only when this app is configured as a Messenger secondary receiver and should request control when it receives a `standby` message; defaults to disabled
- `GOOGLE_SHEETS_SPREADSHEET_ID`: optional spreadsheet ID for appending newly created orders
- `GOOGLE_SHEETS_ORDERS_SHEET_NAME`: optional worksheet name, defaults to `Orders`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL`: optional Google service account email for Sheets sync
- `GOOGLE_PRIVATE_KEY`: optional Google service account private key for Sheets sync; keep escaped newlines as `\n` in `.env`
- `GOOGLE_DRIVE_EXPORT_FOLDER_ID`: optional Drive folder ID for order Excel exports
- `GOOGLE_OAUTH_CLIENT_ID`: optional OAuth client ID for uploading exports to a normal My Drive folder
- `GOOGLE_OAUTH_CLIENT_SECRET`: optional OAuth client secret for Drive export uploads
- `GOOGLE_OAUTH_REFRESH_TOKEN`: optional OAuth refresh token for Drive export uploads
- `GOOGLE_MAPS_API_KEY`: optional Google Maps key for delivery geocoding, road distance, fare estimates, and ETA
- `GOOGLE_MAPS_REGION`: optional geocoding region bias, defaults to `ph`
- `GOOGLE_MAPS_TRAVEL_MODE`: optional Routes API travel mode, defaults to `TWO_WHEELER`
- `DELIVERY_BASE_FARE`: optional own-delivery base fare, defaults to `50`
- `DELIVERY_PER_KM_RATE`: optional own-delivery per-km rate, defaults to `12`
- `DELIVERY_SERVICE_FEE`: optional flat service fee, defaults to `0`
- `NEXT_PUBLIC_API_URL`: frontend API base URL
- `NEXT_PUBLIC_SOCKET_URL`: frontend Socket.IO namespace URL

## Messenger handover / AI agent coexistence

Subscribing the Page to this app does not by itself make this app the Messenger Primary Receiver. Meta's handover protocol assigns thread ownership separately. When another AI agent owns a thread, this app can receive the same conversation on the `standby` channel only when it is configured as an appropriate receiver for the Page. The backend logs `messaging`, `standby`, and `messaging_handovers` counts and can optionally request thread control when `META_AUTO_REQUEST_THREAD_CONTROL=true`.

In the Page's Meta settings, open the Messenger/Advanced Messaging receiver configuration and ensure the intended app is configured as the Primary Receiver or Secondary Receiver as appropriate for the AI-agent workflow. A Primary Receiver owns new threads by default; secondary receivers are used with the handover protocol. This role is configured at the Page/Meta level rather than by the NestJS webhook code.

## Messenger history sync

After setting `META_PAGE_ACCESS_TOKEN` and `META_PAGE_ID`, authenticate as an operations/admin user and call:

```text
POST /api/messenger/sync
```

Optional query parameters limit the import:

```text
POST /api/messenger/sync?maxConversations=100&maxMessagesPerConversation=1000
```

The sync follows Meta pagination, stores the Meta conversation ID on each local conversation, imports historical messages without running AI/order automation, and is safe to run repeatedly because Meta message IDs are de-duplicated.

## API summary

- `POST /api/auth/login`
- `GET /api/messenger/webhook`
- `POST /api/messenger/webhook`
- `POST /api/messenger/send`
- `POST /api/messenger/sync`
- `GET /api/messenger/conversations`
- `GET /api/messenger/conversations/:id/messages`
- `GET /api/customers`
- `GET /api/orders`
- `POST /api/orders`
- `PATCH /api/orders/:id/status`
- `GET /api/batches`
- `POST /api/batches`
- `GET /api/kitchen/board`
- `GET /api/deliveries/queue`
- `GET /api/deliveries/grouped`
- `GET /api/analytics/overview`
- `GET /api/inventory`
- `PATCH /api/inventory/:id/adjust`

## Seeded access

- Email: `admin@empanadahauz.local`
- Password: `ChangeMe123!`

## Deployment

See `DEPLOYMENT.md` for container deployment guidance.
