import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CreateExpenseDto, ListExpensesDto, UpdateExpenseDto } from "./dto";
import { ExpensesService } from "./expenses.service";

@UseGuards(JwtAuthGuard)
@Controller("expenses")
export class ExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Get()
  list(@Query() query: ListExpensesDto) {
    return this.expensesService.list(query);
  }

  @Post()
  create(@Body() dto: CreateExpenseDto) {
    return this.expensesService.create(dto);
  }

  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateExpenseDto) {
    return this.expensesService.update(id, dto);
  }

  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.expensesService.delete(id);
  }
}
