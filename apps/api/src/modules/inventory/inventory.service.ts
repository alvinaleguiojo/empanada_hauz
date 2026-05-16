import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";
import { AdjustInventoryDto } from "./dto";

@Injectable()
export class InventoryService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.inventoryItem.findMany({
      include: { logs: { orderBy: { createdAt: "desc" }, take: 5 } },
      orderBy: { displayName: "asc" }
    });
  }

  async adjust(id: string, dto: AdjustInventoryDto) {
    const item = await this.prisma.inventoryItem.findUnique({ where: { id } });
    if (!item) {
      throw new NotFoundException("Inventory item not found");
    }

    return this.prisma.inventoryItem.update({
      where: { id },
      data: {
        currentStock: { increment: dto.changeAmount },
        ...(dto.costPerUnit !== undefined ? { costPerUnit: dto.costPerUnit } : {}),
        logs: {
          create: {
            changeAmount: dto.changeAmount,
            reason: dto.reason
          }
        }
      },
      include: {
        logs: { orderBy: { createdAt: "desc" }, take: 5 }
      }
    });
  }
}
