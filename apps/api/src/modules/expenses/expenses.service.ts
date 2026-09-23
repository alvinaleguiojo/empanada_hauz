import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";
import { CreateExpenseDto, ListExpensesDto, UpdateExpenseDto } from "./dto";

@Injectable()
export class ExpensesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListExpensesDto) {
    const range = getExpenseRange(query);
    const where = {
      expenseDate: {
        gte: range.start,
        lt: range.end
      }
    };

    const [expenses, categoryTotals, todayTotal, monthTotal] = await Promise.all([
      this.prisma.expense.findMany({
        where,
        orderBy: [{ expenseDate: "desc" }, { createdAt: "desc" }]
      }),
      this.prisma.expense.groupBy({
        by: ["category"],
        where,
        _sum: { amount: true },
        orderBy: { _sum: { amount: "desc" } }
      }),
      this.prisma.expense.aggregate({
        where: {
          expenseDate: {
            gte: getManilaDayRange(new Date()).start,
            lt: getManilaDayRange(new Date()).end
          }
        },
        _sum: { amount: true }
      }),
      this.prisma.expense.aggregate({
        where: {
          expenseDate: {
            gte: getManilaMonthRange(new Date()).start,
            lt: getManilaMonthRange(new Date()).end
          }
        },
        _sum: { amount: true }
      })
    ]);

    return {
      expenses,
      total: sumExpenses(expenses),
      todayTotal: Number(todayTotal._sum.amount ?? 0),
      monthTotal: Number(monthTotal._sum.amount ?? 0),
      categoryTotals: categoryTotals.map((item) => ({
        category: item.category,
        total: Number(item._sum.amount ?? 0)
      })),
      range: {
        startDate: toDateInputValue(range.start),
        endDate: toDateInputValue(addDays(range.end, -1))
      }
    };
  }

  async summary(query: ListExpensesDto) {
    const range = getExpenseRange(query);
    const where = {
      expenseDate: {
        gte: range.start,
        lt: range.end
      }
    };

    const [total, categoryTotals, transactionCount] = await Promise.all([
      this.prisma.expense.aggregate({ where, _sum: { amount: true } }),
      this.prisma.expense.groupBy({
        by: ["category"],
        where,
        _sum: { amount: true },
        _count: { _all: true },
        orderBy: { _sum: { amount: "desc" } }
      }),
      this.prisma.expense.count({ where })
    ]);

    return {
      total: Number(total._sum.amount ?? 0),
      transactionCount,
      categoryTotals: categoryTotals.map((item) => ({
        category: item.category,
        total: Number(item._sum.amount ?? 0),
        transactionCount: item._count._all
      })),
      range: {
        startDate: toDateInputValue(range.start),
        endDate: toDateInputValue(addDays(range.end, -1))
      }
    };
  }

  create(dto: CreateExpenseDto) {
    const category = dto.category.trim();
    const name = dto.name.trim();
    const expenseDate = new Date(`${dto.expenseDate}T00:00:00+08:00`);

    if (!category || !name) {
      throw new BadRequestException("Expense category and name are required");
    }

    if (Number.isNaN(expenseDate.getTime())) {
      throw new BadRequestException("Invalid expense date");
    }

    return this.prisma.expense.create({
      data: {
        category,
        description: name,
        amount: dto.amount,
        expenseDate
      }
    });
  }

  async update(id: string, dto: UpdateExpenseDto) {
    const existing = await this.prisma.expense.findUnique({
      where: { id }
    });

    if (!existing) {
      throw new NotFoundException("Expense not found");
    }

    const data: Prisma.ExpenseUpdateInput = {};

    if (dto.category !== undefined) {
      const category = dto.category.trim();
      if (!category) {
        throw new BadRequestException("Expense category cannot be empty");
      }
      data.category = category;
    }

    if (dto.name !== undefined) {
      const name = dto.name.trim();
      if (!name) {
        throw new BadRequestException("Expense name cannot be empty");
      }
      data.description = name;
    }

    if (dto.amount !== undefined) {
      if (!Number.isFinite(dto.amount) || dto.amount <= 0) {
        throw new BadRequestException("Expense amount must be greater than 0");
      }
      data.amount = dto.amount;
    }

    if (dto.expenseDate !== undefined) {
      const expenseDate = new Date(dto.expenseDate + "T00:00:00+08:00");
      if (Number.isNaN(expenseDate.getTime())) {
        throw new BadRequestException("Invalid expense date");
      }
      data.expenseDate = expenseDate;
    }

    if (Object.keys(data).length === 0) {
      throw new BadRequestException("At least one expense field must be provided");
    }

    return this.prisma.expense.update({
      where: { id },
      data
    });
  }

  async delete(id: string) {
    const existing = await this.prisma.expense.findUnique({
      where: { id }
    });

    if (!existing) {
      throw new NotFoundException("Expense not found");
    }

    return this.prisma.expense.delete({
      where: { id }
    });
  }
}

function getExpenseRange(query: ListExpensesDto) {
  if (query.startDate || query.endDate) {
    const start = parseDateInput(query.startDate, getManilaDayRange(new Date()).start);
    const inclusiveEnd = parseDateInput(query.endDate, start);
    const end = addDays(inclusiveEnd, 1);

    if (start >= end) {
      throw new BadRequestException("Expense start date must be before end date");
    }

    return { start, end };
  }

  return getManilaDayRange(new Date());
}

function parseDateInput(value: string | undefined, fallback: Date) {
  if (!value) {
    return fallback;
  }

  const parsed = new Date(`${value}T00:00:00+08:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new BadRequestException("Invalid expense date range");
  }

  return parsed;
}

function getManilaDayRange(date: Date) {
  const datePart = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);

  const start = new Date(`${datePart}T00:00:00+08:00`);
  return { start, end: addDays(start, 1) };
}

function getManilaMonthRange(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit"
  }).format(date);
  const start = new Date(`${parts}-01T00:00:00+08:00`);
  const end = new Date(start);
  end.setUTCMonth(end.getUTCMonth() + 1);
  return { start, end };
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toDateInputValue(date: Date) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Manila",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function sumExpenses(expenses: Array<{ amount: unknown }>) {
  return expenses.reduce((total, expense) => total + Number(expense.amount ?? 0), 0);
}
