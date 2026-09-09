import { Module } from "@nestjs/common";
import { DatabaseModule } from "../../database/database.module";
import { DocumentsModule } from "../documents/documents.module";
import { ProductsController } from "./products.controller";
import { ProductsService } from "./products.service";

@Module({
  imports: [DatabaseModule, DocumentsModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService]
})
export class ProductsModule {}
