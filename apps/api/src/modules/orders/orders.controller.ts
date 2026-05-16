import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AddOrderNoteDto, CreateOrderDto, ManualOrderEntryDto, UpdateOrderDto, UpdateOrderStatusDto } from "./dto";
import { OrdersService } from "./orders.service";

@UseGuards(JwtAuthGuard)
@Controller("orders")
export class OrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get()
  list() {
    return this.ordersService.list();
  }

  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.ordersService.create(dto);
  }

  @Post("manual")
  createManual(@Body() dto: ManualOrderEntryDto) {
    return this.ordersService.createManual(dto);
  }

  @Patch(":id/status")
  updateStatus(@Param("id") id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.updateStatus(id, dto.status);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateOrderDto) {
    return this.ordersService.update(id, dto);
  }

  @Post(":id/notes")
  addNote(@Param("id") id: string, @Body() dto: AddOrderNoteDto) {
    return this.ordersService.addNote(id, dto.body);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.ordersService.remove(id);
  }
}
