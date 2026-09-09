import { Body, Controller, Delete, Get, Param, Post, Query, Req, Res, UseGuards } from "@nestjs/common";
import type { Request, Response } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { DocumentsService } from "./documents.service";

class CreateDocumentDto {
  name!: string;
  mimeType!: string;
  size!: number;
  dataUrl!: string;
  folderId?: string | null;
  public?: boolean;
  source?: string;
}

class CreateFolderDto { name!: string; folderId?: string | null; }

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
  create(@Body() dto: CreateDocumentDto, @Req() request: Request) {
    const user = request.user as { id?: string } | undefined;
    return this.documentsService.createFile({ ...dto, uploadedBy: user?.id });
  }

  @Get(":id/content")
  async content(@Param("id") id: string, @Res() response: Response) {
    const document = await this.documentsService.get(id);
    if (document.type !== "file" || !document.content) {
      response.status(404).send("File not found");
      return;
    }
    if (!document.public) {
      response.status(403).send("File is private");
      return;
    }
    const comma = document.content.indexOf(",");
    const base64 = comma >= 0 ? document.content.slice(comma + 1) : "";
    response.setHeader("Content-Type", document.mimeType || "application/octet-stream");
    response.setHeader("Content-Length", String(Buffer.from(base64, "base64").byteLength));
    response.setHeader("Content-Disposition", `inline; filename="${document.name.replace(/[^a-zA-Z0-9._-]/g, "_")}"`);
    response.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    response.send(Buffer.from(base64, "base64"));
  }

  @UseGuards(JwtAuthGuard)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.documentsService.remove(id);
  }
}
