import { join, resolve } from "path";

export function getDocumentsStorageRoot() {
  if (process.env.DOCUMENTS_STORAGE_PATH) return resolve(process.env.DOCUMENTS_STORAGE_PATH);

  const cwd = resolve(process.cwd());
  return cwd.endsWith(`${join("apps", "api")}`)
    ? join(cwd, "storage", "documents")
    : join(cwd, "apps", "api", "storage", "documents");
}
