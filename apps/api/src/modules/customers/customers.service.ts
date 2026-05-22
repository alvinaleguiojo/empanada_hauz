import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../database/prisma.service";

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.customer.findMany({
      orderBy: [{ isVip: "desc" }, { totalSpent: "desc" }],
      take: 100
    });
  }

  async findOrCreateByMessenger(psid: string, name = "Messenger Customer") {
    const existing = await this.prisma.customer.findFirst({
      where: { messengerPsid: psid }
    });

    if (existing) {
      return existing;
    }

    return this.prisma.customer.create({
      data: {
        messengerPsid: psid,
        name
      }
    });
  }
}
