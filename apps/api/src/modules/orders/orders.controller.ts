import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AddOrderNoteDto, CreateOrderDto, ExportOrdersToDriveDto, ManualOrderEntryDto, PublicOrderEntryDto, UpdateOrderDto, UpdateOrderStatusDto } from "./dto";
import { OrdersService } from "./orders.service";

@Controller("orders")
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  list(@Query("date") date?: string) {
    return this.ordersService.list({ date });
  }

  @Get("public/queue")
  publicQueue(@Query("date") date?: string) {
    return this.ordersService.publicQueue({ date });
  }

  @Get("track/:id")
  track(@Param("id") id: string) {
    return this.ordersService.track(id);
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.ordersService.create(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post("manual")
  createManual(@Body() dto: ManualOrderEntryDto) {
    return this.ordersService.createManual(dto);
  }

  @Post("public")
  createPublic(@Body() dto: PublicOrderEntryDto) {
    return this.ordersService.createPublic(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post("export/google-drive")
  exportToGoogleDrive(@Body() dto: ExportOrdersToDriveDto) {
    return this.ordersService.exportToGoogleDrive(dto.orderIds);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(":id/status")
  updateStatus(@Param("id") id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.updateStatus(id, dto.status);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateOrderDto) {
    return this.ordersService.update(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/notes")
  addNote(@Param("id") id: string, @Body() dto: AddOrderNoteDto) {
    return this.ordersService.addNote(id, dto.body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.ordersService.remove(id);
  }
}
