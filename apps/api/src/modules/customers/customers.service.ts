import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
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
      if (name && name !== "Messenger Customer" && existing.name === "Messenger Customer") {
        return this.prisma.customer.update({
          where: { id: existing.id },
          data: { name }
        });
      }
      return existing;
    }

    // Messenger PSIDs are not present on older/manual customer records. If Meta
    // gives us a real profile name, safely attach the PSID to an existing
    // customer when that name identifies exactly one customer. This preserves
    // the customer's existing order history instead of creating a duplicate
    // "Messenger Customer" record.
    const profileName = name?.trim();
    if (profileName && profileName !== "Messenger Customer") {
      const matches = await this.prisma.customer.findMany({
        where: {
          name: {
            equals: profileName,
            mode: Prisma.QueryMode.insensitive
          }
        },
        orderBy: { updatedAt: "desc" },
        take: 2
      });

      if (matches.length === 1) {
        return this.prisma.customer.update({
          where: { id: matches[0].id },
          data: { messengerPsid: psid }
        });
      }
    }

    return this.prisma.customer.create({
      data: {
        messengerPsid: psid,
        name
      }
    });
  }
}
