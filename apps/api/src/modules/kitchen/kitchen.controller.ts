import { Controller, Get, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { KitchenService } from "./kitchen.service";

@UseGuards(JwtAuthGuard)
@Controller("kitchen")
export class KitchenController {
  constructor(private readonly kitchenService: KitchenService) {}

  @Get("board")
  getBoard() {
    return this.kitchenService.getBoard();
  }
}
