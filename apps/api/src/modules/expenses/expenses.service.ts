import { BadRequestException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { CreateExpenseDto, ListExpensesDto } from "./dto";

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
