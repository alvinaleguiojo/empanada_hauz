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

    const profileName = name?.trim();

    if (existing) {
      // A previous buggy summary request could have created a placeholder
      // "Messenger Customer" record with the PSID before the real customer
      // was linked. If Meta now gives us a real name and the PSID record has
      // no order history, move the PSID to the uniquely matching customer
      // that actually owns orders.
      if (profileName && profileName !== "Messenger Customer") {
        const namedMatches = await this.prisma.customer.findMany({
          where: {
            name: {
              equals: profileName,
              mode: Prisma.QueryMode.insensitive
            }
          },
          orderBy: { updatedAt: "desc" },
          take: 3
        });

        const candidatesWithOrders = [];
        for (const candidate of namedMatches) {
          const order = await this.prisma.order.findFirst({
            where: { customerId: candidate.id },
            select: { id: true }
          });
          if (order) candidatesWithOrders.push(candidate);
        }

        if (candidatesWithOrders.length === 1 && candidatesWithOrders[0].id !== existing.id) {
          await this.prisma.customer.update({
            where: { id: existing.id },
            data: { messengerPsid: null }
          });
          return this.prisma.customer.update({
            where: { id: candidatesWithOrders[0].id },
            data: { messengerPsid: psid }
          });
        }

        if (existing.name === "Messenger Customer") {
          const uniqueMatch = namedMatches.length === 1 ? namedMatches[0] : undefined;
          if (uniqueMatch) {
            await this.prisma.customer.update({
              where: { id: existing.id },
              data: { messengerPsid: null }
            });
            return this.prisma.customer.update({
              where: { id: uniqueMatch.id },
              data: { messengerPsid: psid }
            });
          }
        }

        if (existing.name === "Messenger Customer") {
          return this.prisma.customer.update({
            where: { id: existing.id },
            data: { name: profileName }
          });
        }
      }

      return existing;
    }

    // Messenger PSIDs are not present on older/manual customer records. If
    // Meta gives us a real profile name, safely attach the PSID to an
    // existing customer when that name identifies exactly one customer.
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
