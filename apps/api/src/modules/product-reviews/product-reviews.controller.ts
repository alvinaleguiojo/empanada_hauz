import { Body, Controller, Get, Header, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { IsIn, IsNumber, IsOptional, IsString, Max, Min } from "class-validator";
import type { Request } from "express";
import { AdminGuard } from "../ai-instructions/admin.guard";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { RateLimit } from "../../common/rate-limit/rate-limit.decorator";
import { ProductReviewsService } from "./product-reviews.service";

class CreateProductReviewDto {
  @IsString()
  productName!: string;

  @IsNumber()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  comment?: string;
}

class UpdateProductReviewStatusDto {
  @IsIn(["pending", "approved", "rejected"])
  status!: "pending" | "approved" | "rejected";
}

@Controller()
export class ProductReviewsController {
  constructor(private readonly service: ProductReviewsService) {}

  @Get("products/:productKey/reviews")
  @Header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
  async listApproved(@Param("productKey") productKey: string) {
    return this.service.listApproved(productKey);
  }

  @RateLimit({ limit: 5, windowSeconds: 15 * 60, key: "ip" })
  @Post("orders/:id/reviews")
  createReview(@Param("id") id: string, @Body() dto: CreateProductReviewDto) {
    return this.service.createForOrder(id, dto);
  }

  @Get("products/reviews/summary")
  @Header("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate")
  listApprovedSummaries() {
    return this.service.listApprovedSummaries();
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Get("admin/product-reviews")
  listForAdmin(@Query("status") status?: "pending" | "approved" | "rejected") {
    return this.service.listForAdmin(status);
  }

  @UseGuards(JwtAuthGuard, AdminGuard)
  @Patch("admin/product-reviews/:id")
  updateStatus(
    @Param("id") id: string,
    @Body() dto: UpdateProductReviewStatusDto,
    @Req() request: Request
  ) {
    const user = request.user as { id?: string } | undefined;
    if (!user?.id) {
      throw new Error("Authenticated admin user is missing.");
    }
    return this.service.updateStatus(id, dto.status, user.id);
  }
}
