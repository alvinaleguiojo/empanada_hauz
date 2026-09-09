export function storageExtension(originalName: string, mimeType: string) {
  const match = originalName.toLowerCase().match(/\.[a-z0-9]{1,10}$/);
  if (match) return match[0];

  const fallbackByMime: Record<string, string> = {
    "image/jpeg": ".jpg",
    "image/png": ".png",
    "image/webp": ".webp",
    "image/gif": ".gif",
    "image/svg+xml": ".svg",
    "image/avif": ".avif",
    "video/mp4": ".mp4",
    "video/webm": ".webm",
    "video/quicktime": ".mov",
    "audio/mpeg": ".mp3",
    "audio/wav": ".wav",
    "application/pdf": ".pdf"
  };
  return fallbackByMime[mimeType.toLowerCase()] ?? "";
}
