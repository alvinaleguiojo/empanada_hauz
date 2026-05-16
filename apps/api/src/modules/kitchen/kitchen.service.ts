import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";

@Injectable()
export class KitchenService {
  constructor(private readonly prisma: PrismaService) {}

  async getBoard() {
    const [pending, active, frying, packed, completed, batches] = await Promise.all([
      this.prisma.order.findMany({ where: { status: "queued" }, include: { customer: true, batch: true } }),
      this.prisma.order.findMany({ where: { status: "preparing" }, include: { customer: true, batch: true } }),
      this.prisma.order.findMany({ where: { status: "frying" }, include: { customer: true, batch: true } }),
      this.prisma.order.findMany({ where: { status: "packed" }, include: { customer: true, batch: true } }),
      this.prisma.order.findMany({ where: { status: "completed" }, include: { customer: true, batch: true }, take: 25 }),
      this.prisma.batch.findMany({ orderBy: [{ batchDate: "desc" }, { name: "asc" }] })
    ]);

    return { pending, active, frying, packed, completed, batches };
  }
}
