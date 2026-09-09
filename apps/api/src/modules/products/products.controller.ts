import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { IsArray, IsBoolean, IsNumber, IsOptional, IsString } from "class-validator";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ProductsService } from "./products.service";

class CreateProductDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() category?: string;
  @IsNumber() price!: number;
  @IsOptional() @IsBoolean() available?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) aliases?: string[];
  @IsOptional() @IsString() imageUrl?: string;
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
  @IsOptional() @IsNumber() sortOrder?: number;
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
  @IsOptional() @IsBoolean() isFeatured?: boolean;
  @IsOptional() @IsBoolean() isNew?: boolean;
}

@Controller()
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

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
  create(@Body() dto: CreateProductDto) {
    return this.productsService.create(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Patch("admin/products/:id")
  update(@Param("id") id: string, @Body() dto: UpdateProductDto) {
    return this.productsService.update(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Delete("admin/products/:id")
  remove(@Param("id") id: string) {
    return this.productsService.remove(id);
  }
}
