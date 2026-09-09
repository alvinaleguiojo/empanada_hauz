# Documents

The `/documents` page is the unified Drive-style document browser.

The UI supports system documents and user uploads when the `/documents` API returns the corresponding metadata (`isSystem`, `ownerName`, `starred`) and filtering parameters (`system`, `shared`, `starred`). System documents are displayed as read-only.

Existing document API endpoints remain `/documents`, `/documents/folder`, and `/documents/:id/download`.
