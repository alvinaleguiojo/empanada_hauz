import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { CreateExpenseDto, ListExpensesDto } from "./dto";
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
}
