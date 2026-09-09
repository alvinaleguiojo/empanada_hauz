import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString } from "class-validator";
import type { Request } from "express";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { DocumentsService } from "../documents/documents.service";
import { ProductsService } from "./products.service";

class CreateProductDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() category?: string;
  @IsNumber() price!: number;
  @IsOptional() @IsBoolean() available?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) aliases?: string[];
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) imageUrls?: string[];
  @IsOptional() @IsNumber() sortOrder?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsBoolean() isFeatured?: boolean;
  @IsOptional() @IsBoolean() isNew?: boolean;
}

class UpdateProductDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsNumber() price?: number;
  @IsOptional() @IsBoolean() available?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) aliases?: string[];
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) imageUrls?: string[];
  @IsOptional() @IsNumber() sortOrder?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsBoolean() isFeatured?: boolean;
  @IsOptional() @IsBoolean() isNew?: boolean;
}

@Controller()
export class ProductsController {
  constructor(
    private readonly productsService: ProductsService,
    private readonly documentsService: DocumentsService
  ) {}

  @Get("products")
  listPublic() {
    return this.productsService.list({ availableOnly: false });
  }

  @UseGuards(JwtAuthGuard)
  @Get("admin/products")
  listAdmin() {
    return this.productsService.list({ availableOnly: false });
  }

  @UseGuards(JwtAuthGuard)
  @Post("admin/products")
  async create(@Body() dto: CreateProductDto, @Req() request: Request) {
    return this.productsService.create(await this.storeImageUploads(dto, request));
  }

  @UseGuards(JwtAuthGuard)
  @Patch("admin/products/:id")
  async update(@Param("id") id: string, @Body() dto: UpdateProductDto, @Req() request: Request) {
    return this.productsService.update(id, await this.storeImageUploads(dto, request));
  }

  @UseGuards(JwtAuthGuard)
  @Delete("admin/products/:id")
  remove(@Param("id") id: string) {
    return this.productsService.remove(id);
  }

  private async storeImageUploads<T extends CreateProductDto | UpdateProductDto>(dto: T, request: Request): Promise<T> {
    const urls = Array.isArray(dto.imageUrls) ? dto.imageUrls : dto.imageUrl ? [dto.imageUrl] : [];
    if (!urls.some((url) => url.startsWith("data:"))) return dto;

    const user = request.user as { id?: string } | undefined;
    const storedUrls = await Promise.all(urls.map(async (url, index) => {
      if (!url.startsWith("data:")) return url;
      const match = url.match(/^data:([^;,]+)(?:;base64)?,/);
      const mimeType = match?.[1] ?? "application/octet-stream";
      const base64 = url.slice(url.indexOf(",") + 1);
      const size = Buffer.from(base64, "base64").byteLength;
      const document = await this.documentsService.createFile({
        name: `${dto.name || "product"} image ${index + 1}`,
        mimeType,
        size,
        dataUrl: url,
        public: true,
        uploadedBy: user?.id,
        source: "product-upload"
      });
      return document.url;
    }));

    return { ...dto, imageUrls: storedUrls, imageUrl: storedUrls[0] ?? "" } as T;
  }
}
