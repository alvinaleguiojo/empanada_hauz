import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { ProductsService } from "./products.service";
import { IsBoolean, IsNumber, IsOptional, IsString } from "class-validator";

class CreateProductDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() category?: string;
  @IsNumber() price!: number;
  @IsOptional() @IsBoolean() available?: boolean;
  @IsOptional() aliases?: string[];
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsNumber() sortOrder?: number;
}

class UpdateProductDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() category?: string;
  @IsOptional() @IsNumber() price?: number;
  @IsOptional() @IsBoolean() available?: boolean;
  @IsOptional() aliases?: string[];
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsNumber() sortOrder?: number;
}

@Controller()
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get("products")
  listPublic() {
    return this.productsService.list({ availableOnly: true });
  }

  @UseGuards(JwtAuthGuard)
  @Get("admin/products")
  listAdmin(@Query("all") all?: string) {
    return this.productsService.list({ availableOnly: all !== "true" ? false : false });
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
