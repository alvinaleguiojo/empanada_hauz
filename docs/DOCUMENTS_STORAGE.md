# Documents storage

New Documents uploads are stored on persistent local disk, while MongoDB stores file metadata only.

Set `DOCUMENTS_STORAGE_PATH` to a persistent writable directory. Docker Compose uses `/data/documents` backed by the `documents-data` volume.

The `/documents/:id/content` endpoint streams filesystem files and supports HTTP byte ranges for video playback and seeking.

Existing legacy MongoDB/chunked files remain readable during the transition.
