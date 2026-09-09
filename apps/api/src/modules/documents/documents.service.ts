import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";

export type DocumentRecord = {
  _id: string;
  name: string;
  type: "file" | "folder";
  mimeType: string | null;
  size: number;
  folderId: string | null;
  content?: string | null;
  public: boolean;
  uploadedBy?: string | null;
  source?: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  storage?: "chunks" | "legacy";
  url?: string;
};

type MongoFindResult<T> = { cursor?: { firstBatch?: T[] } };
type ProductImage = { _id: string; name: string; imageUrls?: string[]; imageUrl?: string | null; updatedAt?: Date | string };
type DocumentChunk = { documentId: string; index: number; data: string };
type JsonObject = Prisma.InputJsonObject;

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const CHUNK_SIZE = 256 * 1024;

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

  constructor(private readonly prisma: PrismaService) {}

  async list(folderId?: string | null, search?: string) {
    const selectedFolderId = folderId || null;
    const filter: JsonObject = search?.trim()
      ? {
          type: "file",
          folderId: selectedFolderId,
          name: {
            $regex: search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
            $options: "i",
          },
        }
      : { type: "file", folderId: selectedFolderId };

    const result = (await this.prisma.$runCommandRaw({
      find: this.collection,
      filter,
      sort: { name: 1 },
      limit: 500,
      projection: { content: 0 },
    })) as unknown as MongoFindResult<DocumentRecord>;

    const folders = (await this.prisma.$runCommandRaw({
      find: this.collection,
      filter: { type: "folder", folderId: selectedFolderId } as JsonObject,
      sort: { name: 1 },
      limit: 500,
      projection: { content: 0 },
    })) as unknown as MongoFindResult<DocumentRecord>;

    const stored = [...(folders.cursor?.firstBatch ?? []), ...(result.cursor?.firstBatch ?? [])].map((item) => ({
      ...item,
      content: undefined,
      storage: item.content ? "legacy" : "chunks",
      url: `/documents/${item._id}/content`,
    }));

    if (!folderId) {
      const products = (await this.prisma.$runCommandRaw({
        find: "products",
        limit: 500,
        projection: { _id: 1, name: 1, imageUrls: 1, imageUrl: 1, updatedAt: 1 },
      })) as unknown as MongoFindResult<ProductImage>;

      const legacyFiles = (products.cursor?.firstBatch ?? []).flatMap((product) => {
        const urls = Array.isArray(product.imageUrls) ? product.imageUrls : product.imageUrl ? [product.imageUrl] : [];
        return urls.filter((content) => content.startsWith("data:")).map((content, index) => {
          const id = `product-image:${product._id}:${index}`;
          return {
            _id: id,
            name: `${product.name} · image ${index + 1}`,
            type: "file" as const,
            mimeType: content.match(/^data:([^;,]+)/)?.[1] ?? "image/*",
            size: estimateDataUrlBytes(content),
            folderId: null,
            public: true,
            source: "product-legacy",
            createdAt: product.updatedAt ?? new Date(),
            updatedAt: product.updatedAt ?? new Date(),
            storage: "legacy" as const,
            url: `/documents/${id}/content`,
          };
        }).filter((item) => !search?.trim() || item.name.toLowerCase().includes(search.trim().toLowerCase()));
      });

      return [...stored, ...legacyFiles].sort((a, b) => a.name.localeCompare(b.name));
    }

    return stored;
  }

  async createFolder(name: string, folderId: string | null, uploadedBy?: string) {
    const clean = name.trim();
    if (!clean) throw new BadRequestException("Folder name is required.");
    const now = new Date();
    const document: DocumentRecord = {
      _id: randomUUID(),
      name: clean,
      type: "folder",
      mimeType: null,
      size: 0,
      folderId: folderId || null,
      content: null,
      public: false,
      uploadedBy: uploadedBy ?? null,
      source: "documents",
      createdAt: now,
      updatedAt: now,
    };
    await this.prisma.$runCommandRaw({ insert: this.collection, documents: [document] });
    return { ...document, content: undefined };
  }

  async createFile(input: {
    name: string;
    mimeType: string;
    size: number;
    dataUrl: string;
    folderId?: string | null;
    public?: boolean;
    uploadedBy?: string;
    source?: string;
  }) {
    const name = input.name.trim();
    if (!name) throw new BadRequestException("File name is required.");
    if (!input.mimeType || !input.mimeType.includes("/")) throw new BadRequestException("A valid MIME type is required.");
    if (!Number.isFinite(input.size) || input.size < 0) throw new BadRequestException("Invalid file size.");
    if (!input.dataUrl.startsWith("data:")) throw new BadRequestException("File content must be a data URL.");

    const decodedSize = estimateDataUrlBytes(input.dataUrl);
    if (decodedSize > MAX_FILE_SIZE) throw new BadRequestException("Files are limited to 10 MB.");

    const now = new Date();
    const document: DocumentRecord = {
      _id: randomUUID(),
      name,
      type: "file",
      mimeType: input.mimeType,
      size: decodedSize,
      folderId: input.folderId || null,
      content: null,
      public: Boolean(input.public),
      uploadedBy: input.uploadedBy ?? null,
      source: input.source ?? "documents",
      createdAt: now,
      updatedAt: now,
      storage: "chunks",
      url: "",
    };
    document.url = `/documents/${document._id}/content`;

    const comma = input.dataUrl.indexOf(",");
    const base64 = comma >= 0 ? input.dataUrl.slice(comma + 1) : "";
    const chunks: DocumentChunk[] = [];
    for (let offset = 0, index = 0; offset < base64.length; offset += CHUNK_SIZE, index += 1) {
      chunks.push({ documentId: document._id, index, data: base64.slice(offset, offset + CHUNK_SIZE) });
    }

    await this.prisma.$runCommandRaw({ insert: this.collection, documents: [document] });
    if (chunks.length) await this.prisma.$runCommandRaw({ insert: this.chunksCollection, documents: chunks });

    return { ...document, content: undefined };
  }

  async get(id: string) {
    if (id.startsWith("product-image:")) {
      const [, productId, indexValue] = id.split(":");
      const index = Number(indexValue);
      const result = (await this.prisma.$runCommandRaw({
        find: "products",
        filter: { _id: productId } as JsonObject,
        limit: 1,
        projection: { _id: 1, name: 1, imageUrls: 1, imageUrl: 1, updatedAt: 1 },
      })) as unknown as MongoFindResult<ProductImage>;
      const product = result.cursor?.firstBatch?.[0];
      const urls = Array.isArray(product?.imageUrls) ? product.imageUrls : product?.imageUrl ? [product.imageUrl] : [];
      const content = urls[index];
      if (!content) throw new NotFoundException("Document not found.");
      return {
        _id: id,
        name: `${product?.name ?? "Product"} · image ${index + 1}`,
        type: "file" as const,
        mimeType: content.match(/^data:([^;,]+)/)?.[1] ?? "image/*",
        size: estimateDataUrlBytes(content),
        folderId: null,
        content,
        public: true,
        source: "product-legacy",
        createdAt: product?.updatedAt ?? new Date(),
        updatedAt: product?.updatedAt ?? new Date(),
        storage: "legacy" as const,
      } as DocumentRecord;
    }

    const result = (await this.prisma.$runCommandRaw({
      find: this.collection,
      filter: { _id: id } as JsonObject,
      limit: 1,
      projection: { content: 0 },
    })) as unknown as MongoFindResult<DocumentRecord>;
    const item = result.cursor?.firstBatch?.[0];
    if (!item) throw new NotFoundException("Document not found.");
    if (item.type === "folder") return item;

    if (item.content) return item;

    const chunks = (await this.prisma.$runCommandRaw({
      find: this.chunksCollection,
      filter: { documentId: id } as JsonObject,
      sort: { index: 1 },
      limit: 1000,
      projection: { _id: 0, documentId: 1, index: 1, data: 1 },
    })) as unknown as MongoFindResult<DocumentChunk>;
    const base64 = (chunks.cursor?.firstBatch ?? []).map((chunk) => chunk.data).join("");
    if (!base64) throw new NotFoundException("File content not found.");
    return { ...item, content: `data:${item.mimeType || "application/octet-stream"};base64,${base64}` };
  }

  async remove(id: string) {
    if (id.startsWith("product-image:")) throw new BadRequestException("Product images are managed from Settings → Products.");
    const result = await this.prisma.$runCommandRaw({
      delete: this.collection,
      deletes: [{ q: { _id: id } as JsonObject, limit: 1 }],
    }) as { deletedCount?: number; n?: number };
    if ((result.deletedCount ?? result.n ?? 0) === 0) throw new NotFoundException("Document not found.");
    await this.prisma.$runCommandRaw({
      delete: this.chunksCollection,
      deletes: [{ q: { documentId: id } as JsonObject, limit: 0 }],
    }).catch(() => undefined);
    return { ok: true };
  }
}
