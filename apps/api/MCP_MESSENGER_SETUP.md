# Empanada Hauz MCP

The API exposes Streamable HTTP MCP endpoints that use provider-independent OAuth 2.0 authentication with PKCE (S256).

This means the same Empanada Hauz MCP authentication flow can be used by compatible MCP clients such as ChatGPT, Claude, Grok, and other MCP hosts. Authentication is not tied to an OpenAI, Anthropic, or xAI token.

## MCP endpoints

Main business MCP:

`https://api.empanadahauz.com/api/mcp`

Messenger MCP:

`https://api.empanadahauz.com/api/mcp/messenger`

## Authentication

MCP clients authenticate through the Empanada Hauz OAuth authorization server.

Discovery endpoints:

`GET /.well-known/oauth-protected-resource`

`GET /.well-known/oauth-authorization-server`

OAuth endpoints:

`POST /oauth/register`

`GET /oauth/authorize`

`POST /oauth/authorize`

`POST /oauth/token`

The flow is:

1. The MCP client discovers the protected resource metadata.
2. The client discovers the OAuth authorization server metadata.
3. The client identifies itself either with a Client ID Metadata Document (CIMD) URL or, for backward compatibility, through dynamic client registration.
4. The client starts authorization with PKCE S256 and may request `offline_access` for long-lived connectivity.
5. The Empanada Hauz sign-in page authenticates the user's existing account.
6. The client exchanges the authorization code for a Bearer access token and refresh token.
7. The client sends `Authorization: Bearer <token>` to the MCP endpoint.
8. When the access token expires, the client can exchange the refresh token at `/oauth/token`; refresh tokens are rotated and the previous token is revoked.

The API accepts OAuth token submissions as `application/x-www-form-urlencoded`, which is required by many MCP clients, including clients that use standard OAuth token exchange behavior. The authorization-server metadata advertises `client_id_metadata_document_supported: true`, `refresh_token`, and `offline_access` for current MCP clients, while the legacy registration endpoint remains available for compatibility.

No provider-specific API key is required for the OAuth flow.

## Client isolation

Each MCP client receives its own OAuth client registration and authorization flow. ChatGPT, Claude, Grok, or another client does not need to share a token with another provider.

Client registrations contain:

- `client_id`
- registered `redirect_uris`
- optional client name

Authorization codes are short-lived and single-use. PKCE S256 is supported and enforced when a client supplies a code challenge. Refresh tokens are stored as hashes, expire after 30 days, are bound to the OAuth client and user, and are rotated on refresh. CIMD client metadata is fetched only from public HTTPS URLs; localhost/private-network metadata URLs are rejected.

## Resource protection

Access tokens are JWT Bearer tokens issued specifically for the MCP resource:

`https://api.empanadahauz.com/api/mcp`

The API validates:

- Bearer authentication
- JWT signature and expiration
- the token subject against an Empanada Hauz user
- the OAuth audience against the requested MCP resource

The same authenticated user identity is therefore used regardless of which MCP client initiated the OAuth flow.

## Messenger tools

The Messenger MCP exposes:

- `list_messenger_conversations` — list stored Messenger conversations.
- `get_messenger_messages` — read stored messages for a conversation.
- `get_messenger_profile` — resolve the public profile name for a Messenger PSID through Meta Graph API.
- `send_messenger_message` — send and persist a text reply to a Messenger PSID.
- `sync_messenger` — import Messenger conversations and message history from the configured Meta Page.
- `request_messenger_thread_control` — request Meta thread handover/control for a PSID.

The MCP layer reuses the existing Messenger service and Meta OAuth/token configuration. It does not require a separate Facebook integration or Page token storage.

## Important

The OAuth authorization server is provider-independent, but each AI product still needs to support remote MCP over Streamable HTTP and OAuth discovery/authorization. The MCP server cannot force a client that does not support these standards to connect.

