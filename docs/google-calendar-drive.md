# Google Calendar + Drive integration

The `feature/google-calendar-drive` branch adds a Google Workspace integration for scheduled orders.

## Environment

Configure these API variables:

```env
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=https://YOUR_API_HOST/api/google-workspace/oauth/callback
GOOGLE_CALENDAR_ID=primary
GOOGLE_DRIVE_EXPORT_FOLDER_ID=...
GOOGLE_TOKEN_ENCRYPTION_KEY=base64-encoded-32-byte-key
WEB_PUBLIC_URL=https://YOUR_WEB_HOST
```

`GOOGLE_TOKEN_ENCRYPTION_KEY` is required when saving an OAuth refresh token. Generate a random 32-byte key and base64 encode it; do not commit it.

## Google Cloud setup

Enable Google Calendar API and Google Drive API. Configure an OAuth 2.0 Web application client and add the exact callback URL above as an authorized redirect URI.

Requested scopes:

- `https://www.googleapis.com/auth/calendar.events`
- `https://www.googleapis.com/auth/drive.file`

The Calendar scope permits creating and updating events, while `drive.file` limits Drive access to files created or opened by the application.

## Flow

1. Sign in to Empanada Hauz.
2. Open `/settings/google`.
3. Click **Connect Google**.
4. Google redirects to `/api/google-workspace/oauth/callback`.
5. The refresh token is encrypted with AES-256-GCM and stored in a dedicated MongoDB collection named `GoogleWorkspaceConnection`.
6. Scheduled orders can be synchronized with `POST /api/orders/:id/google-calendar/sync`.
7. The Calendar event is tagged with `empanadaOrderId`, so repeated syncs update the existing event instead of creating duplicates.

## Drive

The existing order export endpoint remains available at `POST /api/orders/export/google-drive` and continues to use the existing Drive export configuration. The new Google connection is intentionally isolated from that legacy export path on this branch; a follow-up can refactor the export service to consume the encrypted per-connection OAuth token and attach generated order files to Calendar events.
