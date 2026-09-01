# Meta Page OAuth / Reconnect

The Messenger inbox now supports reconnecting the configured Facebook Page without manually replacing `META_PAGE_ACCESS_TOKEN`.

## Required environment variables

```env
META_APP_ID=<Meta app ID>
META_APP_SECRET=<Meta app secret>
META_PAGE_ID=<Empanada Hauz Page ID>
META_GRAPH_API_VERSION=v26.0
META_VERIFY_TOKEN=<webhook verify token>
META_OAUTH_REDIRECT_URI=https://api.empanadahauz.com/api/messenger/auth/callback
META_WEBHOOK_URL=https://api.empanadahauz.com/api/messenger/webhook
META_TOKEN_ENCRYPTION_KEY=<64 hex characters / 32 random bytes>
WEB_APP_URL=https://empanadahauz.com
```

The production Messenger webhook URL is:

`https://api.empanadahauz.com/api/messenger/webhook`

The webhook verification token is the value of `META_VERIFY_TOKEN`. Keep this token private and use the same value in the Meta Developer dashboard when configuring the webhook.

Generate the encryption key with Node:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

`META_PAGE_ACCESS_TOKEN` remains supported as a fallback for an existing installation, but a successful OAuth connection stores the new Page token encrypted in MongoDB and uses that token for Messenger sync and sends.

## Meta dashboard configuration

Configure the Meta app's Webhooks/Messenger subscription with:

- **Callback URL:** `https://api.empanadahauz.com/api/messenger/webhook`
- **Verify token:** exactly the value of `META_VERIFY_TOKEN`

For OAuth, add the exact value of `META_OAUTH_REDIRECT_URI` to the Meta app's valid OAuth redirect URIs. The Meta app must have the Page/Messenger permissions required by the application and the operator must authorize the configured Page during login.

The API exposes both webhook methods at the same URL:

- `GET /api/messenger/webhook` — Meta verification handshake; returns `hub.challenge` when the verify token matches.
- `POST /api/messenger/webhook` — receives Messenger events, verifies `x-hub-signature-256`, persists inbound text messages, processes them, and sends the generated reply.

## Flow

1. Open Messenger in the operations UI.
2. Click **Reconnect**.
3. Authorize the Empanada Hauz Page in Meta.
4. Meta redirects to `/api/messenger/auth/callback`.
5. The API exchanges the authorization code, selects `META_PAGE_ID`, validates the returned Page Access Token, and encrypts it in `MetaConnection`.
6. The callback redirects back to `/messenger?meta=connected`.
7. **Sync Meta** automatically uses the stored Page token and validates authentication before importing history.
8. Meta sends new Messenger events to the webhook URL above.

If the Page token later becomes invalid, click **Reconnect** again. No token needs to be pasted into the application UI.
