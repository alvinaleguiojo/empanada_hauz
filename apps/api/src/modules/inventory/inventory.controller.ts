import { Body, Controller, Get, Param, Patch, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { AdjustInventoryDto } from "./dto";
import { InventoryService } from "./inventory.service";

@UseGuards(JwtAuthGuard)
@Controller("inventory")
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  @Get()
  list() {
    return this.inventoryService.list();
  }

  @Patch(":id/adjust")
  adjust(@Param("id") id: string, @Body() dto: AdjustInventoryDto) {
    return this.inventoryService.adjust(id, dto);
  }
}
