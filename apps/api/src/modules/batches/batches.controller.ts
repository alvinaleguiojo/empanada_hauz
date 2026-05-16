import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { BatchesService } from "./batches.service";
import { CreateBatchDto } from "./dto";

@UseGuards(JwtAuthGuard)
@Controller("batches")
export class BatchesController {
  constructor(private readonly batchesService: BatchesService) {}

  @Get()
  list() {
    return this.batchesService.list();
  }

  @Post()
  create(@Body() dto: CreateBatchDto) {
    return this.batchesService.create(dto);
  }
}
