# Messenger MCP

The API exposes a Streamable HTTP MCP endpoint for the existing Empanada Hauz Messenger integration.

## Endpoint

`POST /api/mcp/messenger`

The NestJS application already uses the `/api` global prefix, so the production endpoint is:

`https://api.empanadahauz.com/api/mcp/messenger`

## Authentication

Set `MCP_BEARER_TOKEN` in the API environment. Clients should send:

```http
Authorization: Bearer <MCP_BEARER_TOKEN>
```

If `MCP_BEARER_TOKEN` is configured, requests with a different or missing bearer token are rejected.

## Tools

- `list_messenger_conversations` — list stored Messenger conversations.
- `get_messenger_messages` — read stored messages for a conversation.
- `get_messenger_profile` — resolve the public profile name for a Messenger PSID through Meta Graph API.
- `send_messenger_message` — send and persist a text reply to a Messenger PSID.
- `sync_messenger` — import Messenger conversations and message history from the configured Meta Page.
- `request_messenger_thread_control` — request Meta thread handover/control for a PSID.

## Existing Meta configuration

The MCP layer reuses the existing Messenger service and therefore the existing Meta OAuth/token configuration. See `META_OAUTH_SETUP.md` for:

- `META_APP_ID`
- `META_APP_SECRET`
- `META_PAGE_ID`
- `META_GRAPH_API_VERSION`
- `META_VERIFY_TOKEN`
- `META_OAUTH_REDIRECT_URI`
- `META_WEBHOOK_URL`
- `META_TOKEN_ENCRYPTION_KEY`

No second Facebook integration or Page token storage is introduced by this MCP layer.
