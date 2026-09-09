import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
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
};

type MongoFindResult<T> = { cursor?: { firstBatch?: T[] } };

@Injectable()
export class DocumentsService {
  private readonly collection = "documents";

  constructor(private readonly prisma: PrismaService) {}

  async list(folderId?: string | null, search?: string) {
    const filter: Record<string, unknown> = { type: "file" };
    if (folderId) filter.folderId = folderId;
    else filter.folderId = null;
    if (search?.trim()) filter.name = { $regex: search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    const result = (await this.prisma.$runCommandRaw({ find: this.collection, filter, sort: { name: 1 }, limit: 500 })) as unknown as MongoFindResult<DocumentRecord>;
    const folders = (await this.prisma.$runCommandRaw({ find: this.collection, filter: { type: "folder", folderId: filter.folderId }, sort: { name: 1 }, limit: 500 })) as unknown as MongoFindResult<DocumentRecord>;
    return [...(folders.cursor?.firstBatch ?? []), ...(result.cursor?.firstBatch ?? [])].map((item) => ({ ...item, content: undefined, url: `/documents/${item._id}/content` }));
  }

  async createFolder(name: string, folderId: string | null, uploadedBy?: string) {
    const clean = name.trim();
    if (!clean) throw new BadRequestException("Folder name is required.");
    const now = new Date();
    const document: DocumentRecord = { _id: randomUUID(), name: clean, type: "folder", mimeType: null, size: 0, folderId: folderId || null, content: null, public: false, uploadedBy: uploadedBy ?? null, source: "documents", createdAt: now, updatedAt: now };
    await this.prisma.$runCommandRaw({ insert: this.collection, documents: [document] });
    return { ...document, content: undefined };
  }

  async createFile(input: { name: string; mimeType: string; size: number; dataUrl: string; folderId?: string | null; public?: boolean; uploadedBy?: string; source?: string }) {
    const name = input.name.trim();
    if (!name) throw new BadRequestException("File name is required.");
    if (!input.mimeType || !input.mimeType.includes("/")) throw new BadRequestException("A valid MIME type is required.");
    if (!Number.isFinite(input.size) || input.size < 0) throw new BadRequestException("Invalid file size.");
    if (!input.dataUrl.startsWith("data:")) throw new BadRequestException("File content must be a data URL.");
    const comma = input.dataUrl.indexOf(",");
    const base64 = comma >= 0 ? input.dataUrl.slice(comma + 1) : "";
    const decodedSize = Buffer.from(base64, "base64").byteLength;
    if (decodedSize > 10 * 1024 * 1024) throw new BadRequestException("Files are limited to 10 MB.");

    const now = new Date();
    const document: DocumentRecord = {
      _id: randomUUID(), name, type: "file", mimeType: input.mimeType, size: decodedSize, folderId: input.folderId || null,
      content: input.dataUrl, public: Boolean(input.public), uploadedBy: input.uploadedBy ?? null, source: input.source ?? "documents",
      createdAt: now, updatedAt: now
    };
    await this.prisma.$runCommandRaw({ insert: this.collection, documents: [document] });
    return { ...document, content: undefined, url: `/documents/${document._id}/content` };
  }

  async get(id: string) {
    const result = (await this.prisma.$runCommandRaw({ find: this.collection, filter: { _id: id }, limit: 1 })) as unknown as MongoFindResult<DocumentRecord>;
    const item = result.cursor?.firstBatch?.[0];
    if (!item) throw new NotFoundException("Document not found.");
    return item;
  }

  async remove(id: string) {
    const result = (await this.prisma.$runCommandRaw({ delete: this.collection, deletes: [{ q: { _id: id }, limit: 1 }] })) as { deletedCount?: number; n?: number };
    if ((result.deletedCount ?? result.n ?? 0) === 0) throw new NotFoundException("Document not found.");
    return { ok: true };
  }
}
