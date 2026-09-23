import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { ProductReviewsController } from "./product-reviews.controller";
import { ProductReviewsService } from "./product-reviews.service";

@Module({
  imports: [DatabaseModule],
  controllers: [ProductReviewsController],
  providers: [ProductReviewsService],
  exports: [ProductReviewsService]
})
export class ProductReviewsModule {}
