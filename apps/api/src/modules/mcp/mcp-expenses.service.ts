import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { ExpensesService } from "../expenses/expenses.service";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

@Injectable()
export class McpExpensesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly expensesService: ExpensesService
  ) {}

  async listExpenses(params: {
    cursor?: string;
    limit?: number;
    category?: string;
    startDate?: string;
    endDate?: string;
  }) {
    const limit = Math.min(Math.max(params.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const range = this.getExpenseRange(params);
    const where = this.buildWhere(params, range);

    const [expenses, categoryTotals] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        take: limit + 1,
        ...(params.cursor ? { cursor: { id: params.cursor }, skip: 1 } : {})
      }),
      this.prisma.expense.groupBy({
        by: ["category"],
        where,
        _sum: { amount: true },
        orderBy: { _sum: { amount: "desc" } }
      })
    ]);

    const page = expenses.slice(0, limit);
    const nextExpense = expenses[limit];

    return {
      expenses: page.map((expense) => this.serializeExpense(expense)),
      count: page.length,
      total: this.sumExpenses(page),
      hasMore: Boolean(nextExpense),
      nextCursor: nextExpense?.id ?? null,
      categoryTotals: categoryTotals.map((item) => ({
        category: item.category,
        total: Number(item._sum.amount ?? 0)
      })),
      range: {
        startDate: this.toDateInputValue(range.start),
        endDate: this.toDateInputValue(this.addDays(range.end, -1))
      }
    };
  }

  async getExpense(params: { id: string }) {
    const expense = await this.prisma.expense.findUnique({
      where: { id: params.id }
    });

    if (!expense) {
      throw new NotFoundException("Expense not found");
    }

    return this.serializeExpense(expense);
  }

  async createExpense(params: {
    category: string;
    name: string;
    amount: number;
    expenseDate: string;
  }) {
    if (!params.category.trim() || !params.name.trim()) {
      throw new BadRequestException("Expense category and name are required");
    }

    if (!Number.isFinite(params.amount) || params.amount <= 0) {
      throw new BadRequestException("Expense amount must be greater than 0");
    }

    const expense = await this.expensesService.create({
      category: params.category,
      name: params.name,
      amount: params.amount,
      expenseDate: params.expenseDate
    });

    return this.serializeExpense(expense);
  }

  async updateExpense(params: {
    id: string;
    category?: string;
    name?: string;
    amount?: number;
    expenseDate?: string;
  }) {
    const expense = await this.expensesService.update(params.id, {
      category: params.category,
      name: params.name,
      amount: params.amount,
      expenseDate: params.expenseDate
    });

    return this.serializeExpense(expense);
  }

  async deleteExpense(params: { id: string }) {
    const expense = await this.expensesService.delete(params.id);
    return this.serializeExpense(expense);
  }

  private buildWhere(
    params: { category?: string },
    range: { start: Date; end: Date }
  ): Prisma.ExpenseWhereInput {
    return {
      expenseDate: {
        gte: range.start,
        lt: range.end
      },
      ...(params.category ? { category: { contains: params.category, mode: "insensitive" } } : {})
    };
  }

  private getExpenseRange(params: { startDate?: string; endDate?: string }) {
    if (params.startDate || params.endDate) {
      const start = this.parseDateInput(params.startDate, this.getManilaDayRange(new Date()).start);
      const inclusiveEnd = this.parseDateInput(params.endDate, start);
      const end = this.addDays(inclusiveEnd, 1);

      if (start >= end) {
        throw new BadRequestException("Expense start date must be before end date");
      }

      return { start, end };
    }

    return this.getManilaDayRange(new Date());
  }

  private parseDateInput(value: string | undefined, fallback: Date) {
    if (!value) {
      return fallback;
    }

    const parsed = new Date(`${value}T00:00:00+08:00`);
    if (Number.isNaN(parsed.getTime())) {
      throw new BadRequestException("Invalid expense date range");
    }

    return parsed;
  }

  private getManilaDayRange(date: Date) {
    const datePart = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(date);

    const start = new Date(`${datePart}T00:00:00+08:00`);
    return { start, end: this.addDays(start, 1) };
  }

  private addDays(date: Date, days: number) {
    const next = new Date(date);
    next.setUTCDate(next.getUTCDate() + days);
    return next;
  }

  private toDateInputValue(date: Date) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Manila",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(date);
  }

  private sumExpenses(expenses: Array<{ amount: unknown }>) {
    return expenses.reduce((total, expense) => total + Number(expense.amount ?? 0), 0);
  }

  private serializeExpense(expense: Prisma.ExpenseGetPayload<Record<string, never>>) {
    return {
      id: expense.id,
      category: expense.category,
      name: expense.description,
      amount: expense.amount,
      expenseDate: expense.expenseDate,
      createdAt: expense.createdAt
    };
  }
}
