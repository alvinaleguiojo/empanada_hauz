import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { createReadStream, createWriteStream, promises as fs } from "fs";
import { Readable } from "stream";
import { basename, dirname, extname, join, resolve, sep } from "path";
import { pipeline } from "stream/promises";
import { randomUUID } from "crypto";
import { PrismaService } from "../../database/prisma.service";
import { storageExtension } from "./storage-extension";

export type DocumentRecord = {
  _id: string; name: string; type: "file" | "folder"; mimeType: string | null; size: number;
  folderId: string | null; content?: string | null; storagePath?: string | null; public: boolean;
  uploadedBy?: string | null; source?: string | null; createdAt: Date | string; updatedAt: Date | string;
  storage?: "filesystem" | "chunks" | "legacy"; url?: string;
};

type MongoFindResult<T> = { cursor?: { firstBatch?: T[] } };
type ProductImage = { _id: string; name: string; imageUrls?: string[]; imageUrl?: string | null; updatedAt?: Date | string };
type DocumentChunk = { documentId: string; index: number; data: string };
type JsonObject = Prisma.InputJsonObject;
type AggregateResult<T> = { cursor?: { firstBatch?: T[] } };
type LegacyImageRef = { _id: string; name: string; imageIndex: number; createdAt: Date | string; updatedAt: Date | string };
type UploadedFile = { originalname: string; mimetype: string; size: number; path: string };

export const MAX_FILE_SIZE = 100 * 1024 * 1024;

function estimateDataUrlBytes(content: string) {
  const comma = content.indexOf(",");
  const base64 = comma >= 0 ? content.slice(comma + 1) : "";
  const padding = base64.endsWith("==") ? 2 : base64.endsWith("=") ? 1 : 0;
  return Math.max(0, Math.floor((base64.length * 3) / 4) - padding);
}

@Injectable()
export class DocumentsService {
  private readonly collection = "documents";
  private readonly chunksCollection = "document_chunks";
  private readonly storageRoot = resolve(process.env.DOCUMENTS_STORAGE_PATH || join(process.cwd(), "apps", "api", "storage", "documents"));

  constructor(private readonly prisma: PrismaService) {}

  async ensureStorage() {
    await fs.mkdir(this.storageRoot, { recursive: true });
    await fs.mkdir(join(this.storageRoot, ".tmp"), { recursive: true });
  }

  async list(folderId?: string | null, search?: string) {
    const selectedFolderId = folderId || null;
    const escapedSearch = search?.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const filter: JsonObject = escapedSearch ? { type: "file", folderId: selectedFolderId, name: { $regex: escapedSearch, $options: "i" } } : { type: "file", folderId: selectedFolderId };
    const result = (await this.prisma.$runCommandRaw({ find: this.collection, filter, sort: { name: 1 }, limit: 500, projection: { content: 0, storagePath: 0 } })) as unknown as MongoFindResult<DocumentRecord>;
    const folders = (await this.prisma.$runCommandRaw({ find: this.collection, filter: { type: "folder", folderId: selectedFolderId } as JsonObject, sort: { name: 1 }, limit: 500, projection: { content: 0, storagePath: 0 } })) as unknown as MongoFindResult<DocumentRecord>;
    const stored = [...(folders.cursor?.firstBatch ?? []), ...(result.cursor?.firstBatch ?? [])].map((item) => ({ ...item, content: undefined, storage: item.storage ?? (item.content ? "legacy" : "chunks"), url: `/documents/${item._id}/content` }));

    if (!folderId) {
      const productFilter = escapedSearch ? { name: { $regex: escapedSearch, $options: "i" } } : {};
      const legacyResult = (await this.prisma.$runCommandRaw({ aggregate: "products", pipeline: [
        { $match: productFilter },
        { $project: { name: 1, updatedAt: 1, legacyImages: { $cond: [{ $isArray: "$imageUrls" }, "$imageUrls", { $cond: [{ $ne: ["$imageUrl", null] }, ["$imageUrl"], []] }] } } },
        { $unwind: { path: "$legacyImages", includeArrayIndex: "imageIndex" } },
        { $match: { legacyImages: { $regex: "^data:", $options: "i" } } },
        { $project: { _id: 1, name: 1, imageIndex: 1, updatedAt: 1 } },
        { $limit: 1000 },
      ], cursor: {} })) as unknown as AggregateResult<LegacyImageRef>;
      const legacyFiles = (legacyResult.cursor?.firstBatch ?? []).map((item) => ({
        _id: `product-image:${item._id}:${Number(item.imageIndex)}`, name: `${item.name} · image ${Number(item.imageIndex) + 1}`,
        type: "file" as const, mimeType: "image/*", size: 0, folderId: null, public: true, source: "product-legacy",
        createdAt: item.updatedAt ?? new Date(), updatedAt: item.updatedAt ?? new Date(), storage: "legacy" as const,
        url: `/documents/product-image:${item._id}:${Number(item.imageIndex)}/content`,
      }));
      return [...stored, ...legacyFiles].sort((a, b) => a.name.localeCompare(b.name));
    }
    return stored;
  }

  async createFolder(name: string, folderId: string | null, uploadedBy?: string) {
    const clean = name.trim();
    if (!clean) throw new BadRequestException("Folder name is required.");
    const now = new Date();
    const document: DocumentRecord = { _id: randomUUID(), name: clean, type: "folder", mimeType: null, size: 0, folderId: folderId || null, public: false, uploadedBy: uploadedBy ?? null, source: "documents", createdAt: now, updatedAt: now };
    await this.prisma.$runCommandRaw({ insert: this.collection, documents: [document] });
    return { ...document, content: undefined };
  }

  async createFile(file: UploadedFile, folderId?: string | null, publicFile?: boolean, uploadedBy?: string, source?: string) {
    const name = file.originalname.trim();
    if (!name) throw new BadRequestException("File name is required.");
    if (!file.mimetype || !file.mimetype.includes("/")) throw new BadRequestException("A valid MIME type is required.");
    if (!Number.isFinite(file.size) || file.size < 0) throw new BadRequestException("Invalid file size.");
    if (file.size > MAX_FILE_SIZE) throw new BadRequestException("Files are limited to 100 MB.");
    await this.ensureStorage();
    const id = randomUUID();
    const extension = storageExtension(basename(name), file.mimetype);
    const relativePath = join(new Date().toISOString().slice(0, 7), `${id}${extension}`);
    const absolutePath = resolve(this.storageRoot, relativePath);
    if (!absolutePath.startsWith(`${this.storageRoot}${sep}`)) throw new BadRequestException("Invalid storage path.");
    await fs.mkdir(dirname(absolutePath), { recursive: true });
    try {
      await pipeline(createReadStream(file.path), createWriteStream(absolutePath, { flags: "wx" }));
      await fs.unlink(file.path).catch(() => undefined);
    } catch (error) {
      await fs.unlink(absolutePath).catch(() => undefined);
      throw error;
    }
    const now = new Date();
    const document: DocumentRecord = { _id: id, name, type: "file", mimeType: file.mimetype, size: file.size, folderId: folderId || null, public: Boolean(publicFile), uploadedBy: uploadedBy ?? null, source: source ?? "documents", createdAt: now, updatedAt: now, storage: "filesystem", storagePath: relativePath, url: `/documents/${id}/content` };
    try {
      await this.prisma.$runCommandRaw({ insert: this.collection, documents: [document] });
    } catch (error) {
      await fs.unlink(absolutePath).catch(() => undefined);
      throw error;
    }
    return { ...document, content: undefined, storagePath: undefined };
  }

  async createFileFromDataUrl(input: { name: string; mimeType: string; dataUrl: string; folderId?: string | null; public?: boolean; uploadedBy?: string; source?: string }) {
    if (!input.dataUrl.startsWith("data:")) throw new BadRequestException("File content must be a data URL.");
    const comma = input.dataUrl.indexOf(",");
    const base64 = comma >= 0 ? input.dataUrl.slice(comma + 1) : "";
    if (!base64) throw new BadRequestException("File content is empty.");
    const name = input.name.trim();
    if (!name) throw new BadRequestException("File name is required.");
    const expectedSize = estimateDataUrlBytes(input.dataUrl);
    if (expectedSize > MAX_FILE_SIZE) throw new BadRequestException("Files are limited to 100 MB.");
    await this.ensureStorage();
    const id = randomUUID();
    const extension = storageExtension(basename(name), input.mimeType);
    const relativePath = join(new Date().toISOString().slice(0, 7), `${id}${extension}`);
    const absolutePath = resolve(this.storageRoot, relativePath);
    const temporaryPath = join(this.storageRoot, ".tmp", `${id}.upload`);
    await fs.mkdir(dirname(absolutePath), { recursive: true });
    try {
      await pipeline(Readable.from(Buffer.from(base64, "base64")), createWriteStream(temporaryPath, { flags: "wx" }));
      const stat = await fs.stat(temporaryPath);
      if (stat.size > MAX_FILE_SIZE) throw new BadRequestException("Files are limited to 100 MB.");
      await fs.rename(temporaryPath, absolutePath);
      const now = new Date();
      const document: DocumentRecord = { _id: id, name, type: "file", mimeType: input.mimeType, size: stat.size, folderId: input.folderId || null, public: Boolean(input.public), uploadedBy: input.uploadedBy ?? null, source: input.source ?? "documents", createdAt: now, updatedAt: now, storage: "filesystem", storagePath: relativePath, url: `/documents/${id}/content` };
      try {
        await this.prisma.$runCommandRaw({ insert: this.collection, documents: [document] });
      } catch (error) {
        await fs.unlink(absolutePath).catch(() => undefined);
        throw error;
      }
      return { ...document, content: undefined, storagePath: undefined };
    } catch (error) {
      await fs.unlink(temporaryPath).catch(() => undefined);
      await fs.unlink(absolutePath).catch(() => undefined);
      throw error;
    }
  }

  async get(id: string) {
    if (id.startsWith("product-image:")) {
      const [, productId, indexValue] = id.split(":");
      const index = Number(indexValue);
      if (!Number.isInteger(index) || index < 0) throw new NotFoundException("Document not found.");
      const result = (await this.prisma.$runCommandRaw({ aggregate: "products", pipeline: [{ $match: { _id: productId } }, { $project: { name: 1, updatedAt: 1, selectedImage: { $cond: [{ $isArray: "$imageUrls" }, { $arrayElemAt: ["$imageUrls", index] }, { $cond: [{ $eq: [index, 0] }, "$imageUrl", null] }] } } }], cursor: {} })) as unknown as AggregateResult<ProductImage & { selectedImage?: string | null }>;
      const product = result.cursor?.firstBatch?.[0];
      const content = product?.selectedImage;
      if (!content) throw new NotFoundException("Document not found.");
      return { _id: id, name: `${product?.name ?? "Product"} · image ${index + 1}`, type: "file" as const, mimeType: content.match(/^data:([^;,]+)/)?.[1] ?? "image/*", size: estimateDataUrlBytes(content), folderId: null, content, public: true, source: "product-legacy", createdAt: product?.updatedAt ?? new Date(), updatedAt: product?.updatedAt ?? new Date(), storage: "legacy" as const } as DocumentRecord;
    }
    const result = (await this.prisma.$runCommandRaw({ find: this.collection, filter: { _id: id } as JsonObject, limit: 1 })) as unknown as MongoFindResult<DocumentRecord>;
    const item = result.cursor?.firstBatch?.[0];
    if (!item) throw new NotFoundException("Document not found.");
    if (item.type === "folder") return item;
    if (item.storage === "filesystem" && item.storagePath) return item;
    if (item.content) return { ...item, storage: "legacy" as const };
    const chunks = (await this.prisma.$runCommandRaw({ find: this.chunksCollection, filter: { documentId: id } as JsonObject, sort: { index: 1 }, limit: 1000, projection: { _id: 0, documentId: 1, index: 1, data: 1 } })) as unknown as MongoFindResult<DocumentChunk>;
    const base64 = (chunks.cursor?.firstBatch ?? []).map((chunk) => chunk.data).join("");
    if (!base64) throw new NotFoundException("File content not found.");
    return { ...item, content: `data:${item.mimeType || "application/octet-stream"};base64,${base64}`, storage: "chunks" as const };
  }

  async getFilesystemPath(item: DocumentRecord) {
    if (item.storage !== "filesystem" || !item.storagePath) return null;
    const absolutePath = resolve(this.storageRoot, item.storagePath);
    const rootPrefix = `${this.storageRoot}${sep}`;
    if (!absolutePath.startsWith(rootPrefix)) throw new NotFoundException("Document not found.");
    try { await fs.access(absolutePath); return absolutePath; } catch { throw new NotFoundException("File not found."); }
  }

  async remove(id: string) {
    if (id.startsWith("product-image:")) throw new BadRequestException("Product images are managed from Settings → Products.");
    const item = await this.get(id);
    const result = await this.prisma.$runCommandRaw({ delete: this.collection, deletes: [{ q: { _id: id } as JsonObject, limit: 1 }] }) as { deletedCount?: number; n?: number };
    if ((result.deletedCount ?? result.n ?? 0) === 0) throw new NotFoundException("Document not found.");
    if (item.storage === "filesystem" && item.storagePath) {
      const absolutePath = resolve(this.storageRoot, item.storagePath);
      const rootPrefix = `${this.storageRoot}${sep}`;
      if (absolutePath.startsWith(rootPrefix)) await fs.unlink(absolutePath).catch(() => undefined);
    }
    await this.prisma.$runCommandRaw({ delete: this.chunksCollection, deletes: [{ q: { documentId: id } as JsonObject, limit: 0 }] }).catch(() => undefined);
    return { ok: true };
  }
}
