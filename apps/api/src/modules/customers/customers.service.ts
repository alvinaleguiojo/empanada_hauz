import { BadRequestException, Injectable } from "@nestjs/common";
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

  async search(query: string, limit = 10) {
    const normalized = query.trim();
    if (!normalized) return [];
    const safeLimit = Math.min(Math.max(Math.trunc(Number(limit)) || 10, 1), 25);
    return this.prisma.customer.findMany({
      where: {
        OR: [
          { name: { contains: normalized, mode: Prisma.QueryMode.insensitive } },
          { phoneNumber: { contains: normalized, mode: Prisma.QueryMode.insensitive } },
          { messengerPsid: { contains: normalized, mode: Prisma.QueryMode.insensitive } }
        ]
      },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        defaultAddress: true,
        totalOrders: true,
        repeatCustomerCount: true,
        totalSpent: true,
        lastOrderDate: true,
        isVip: true
      },
      orderBy: [{ isVip: "desc" }, { totalSpent: "desc" }, { name: "asc" }],
      take: safeLimit
    });
  }

  async createCustomer(input: { name?: string; phoneNumber?: string; defaultAddress?: string }) {
    const name = input.name?.trim();
    const phoneNumber = input.phoneNumber?.trim() || undefined;
    const defaultAddress = input.defaultAddress?.trim() || undefined;

    if (!name) throw new BadRequestException("Customer name is required.");
    if (name.length > 120) throw new BadRequestException("Customer name is too long.");
    if (phoneNumber && phoneNumber.length > 30) throw new BadRequestException("Customer phone number is too long.");
    if (defaultAddress && defaultAddress.length > 500) throw new BadRequestException("Customer address is too long.");

    if (phoneNumber) {
      const existingByPhone = await this.prisma.customer.findFirst({
        where: { phoneNumber },
        select: { id: true, name: true, phoneNumber: true }
      });
      if (existingByPhone) throw new BadRequestException(`A customer already exists with phone number ${phoneNumber}.`);
    }

    return this.prisma.customer.create({
      data: {
        name,
        ...(phoneNumber ? { phoneNumber } : {}),
        ...(defaultAddress ? { defaultAddress } : {})
      },
      select: {
        id: true,
        name: true,
        phoneNumber: true,
        defaultAddress: true,
        totalOrders: true,
        totalSpent: true,
        isVip: true
      }
    });
  }

  async findOrCreateByMessenger(psid: string, name = "Messenger Customer") {
    const existing = await this.prisma.customer.findFirst({
      where: { messengerPsid: psid }
    });

    const profileName = name?.trim();

    if (existing) {
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
