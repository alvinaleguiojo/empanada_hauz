import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import type { Request, Response } from "express";
import { createReadStream, mkdirSync } from "fs";
import { join } from "path";
import { randomUUID } from "crypto";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { DocumentsService, MAX_FILE_SIZE } from "./documents.service";

const { diskStorage } = require("multer") as {
  diskStorage: (options: {
    destination: (request: Request, file: { originalname: string }, callback: (error: Error | null, destination: string) => void) => void;
    filename: (request: Request, file: { originalname: string }, callback: (error: Error | null, filename: string) => void) => void;
  }) => unknown;
};

type UploadedDocumentFile = { originalname: string; mimetype: string; size: number; path: string };

const STORAGE_ROOT = process.env.DOCUMENTS_STORAGE_PATH || join(process.cwd(), "apps", "api", "storage", "documents");
const TEMP_UPLOAD_DIR = join(STORAGE_ROOT, ".tmp");
mkdirSync(TEMP_UPLOAD_DIR, { recursive: true });

class CreateFolderDto { name!: string; folderId?: string | null; }
class RenameDocumentDto { name!: string; }

@Controller("documents")
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  list(@Query("folderId") folderId?: string, @Query("search") search?: string) {
    return this.documentsService.list(folderId || null, search);
  }

  @UseGuards(JwtAuthGuard)
  @Post("folder")
  createFolder(@Body() dto: CreateFolderDto, @Req() request: Request) {
    const user = request.user as { id?: string } | undefined;
    return this.documentsService.createFolder(dto.name, dto.folderId || null, user?.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  @UseInterceptors(FileInterceptor("file", {
    storage: diskStorage({
      destination: (_request: Request, _file: { originalname: string }, callback: (error: Error | null, destination: string) => void) => callback(null, TEMP_UPLOAD_DIR),
      filename: (_request: Request, file: { originalname: string }, callback: (error: Error | null, filename: string) => void) => callback(null, `${randomUUID()}-${file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_")}`),
    }),
    limits: { fileSize: MAX_FILE_SIZE },
  }))
  async create(
    @UploadedFile() file: UploadedDocumentFile | undefined,
    @Body("folderId") folderId: string | undefined,
    @Body("public") publicFile: string | undefined,
    @Body("source") source: string | undefined,
    @Req() request: Request,
  ) {
    if (!file) throw new BadRequestException("A file is required.");
    const user = request.user as { id?: string } | undefined;
    return this.documentsService.createFile(file, folderId || null, publicFile === "true", user?.id, source);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(":id")
  rename(@Param("id") id: string, @Body() dto: RenameDocumentDto) {
    return this.documentsService.renameFile(id, dto.name);
  }

  @Get(":id/content")
  async content(@Param("id") id: string, @Req() request: Request, @Res() response: Response) {
    await this.sendDocument(id, request, response, false);
  }

  @UseGuards(JwtAuthGuard)
  @Get(":id/download")
  async download(@Param("id") id: string, @Req() request: Request, @Res() response: Response) {
    await this.sendDocument(id, request, response, true);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.documentsService.remove(id);
  }

  private async sendDocument(id: string, request: Request, response: Response, forceDownload: boolean) {
    const document = await this.documentsService.get(id);
    if (document.type !== "file") {
      response.status(404).send("File not found");
      return;
    }
    if (!forceDownload && !document.public) {
      response.status(403).send("File is private");
      return;
    }

    const filePath = await this.documentsService.getFilesystemPath(document);
    if (filePath) {
      await this.sendFilesystemFile(filePath, document, request, response, forceDownload);
      return;
    }

    if (!document.content) {
      response.status(404).send("File content not found");
      return;
    }
    const comma = document.content.indexOf(",");
    const base64 = comma >= 0 ? document.content.slice(comma + 1) : "";
    const bytes = Buffer.from(base64, "base64");
    response.setHeader("Content-Type", document.mimeType || "application/octet-stream");
    response.setHeader("Content-Length", String(bytes.byteLength));
    response.setHeader("Content-Disposition", `${forceDownload ? "attachment" : "inline"}; filename="${document.name.replace(/[^a-zA-Z0-9._-]/g, "_")}"`);
    if (document.public) response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    response.send(bytes);
  }

  private async sendFilesystemFile(filePath: string, document: { name: string; mimeType: string | null; public?: boolean }, request: Request, response: Response, forceDownload: boolean) {
    const { stat } = await import("fs/promises");
    const fileStat = await stat(filePath);
    const total = fileStat.size;
    const range = request.headers.range;
    const disposition = forceDownload ? "attachment" : "inline";

    response.setHeader("Accept-Ranges", "bytes");
    response.setHeader("Content-Type", document.mimeType || "application/octet-stream");
    response.setHeader("Content-Disposition", `${disposition}; filename="${document.name.replace(/[^a-zA-Z0-9._-]/g, "_")}"`);
    if (document.public) response.setHeader("Cache-Control", "public, max-age=31536000, immutable");

    if (!range) {
      response.setHeader("Content-Length", String(total));
      createReadStream(filePath).pipe(response);
      return;
    }

    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      response.status(416).setHeader("Content-Range", `bytes */${total}`).end();
      return;
    }
    const start = match[1] ? Number(match[1]) : Math.max(0, total - Number(match[2] || 0));
    const end = match[2] ? Number(match[2]) : total - 1;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || start >= total || end >= total) {
      response.status(416).setHeader("Content-Range", `bytes */${total}`).end();
      return;
    }

    response.status(206);
    response.setHeader("Content-Range", `bytes ${start}-${end}/${total}`);
    response.setHeader("Content-Length", String(end - start + 1));
    createReadStream(filePath, { start, end }).pipe(response);
  }
}
