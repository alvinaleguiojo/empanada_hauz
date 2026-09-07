import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import * as bcrypt from "bcryptjs";
import { UserRole } from "@prisma/client";
import { PrismaService } from "../../database/prisma.service";

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: ["dashboard.view", "orders.view", "orders.manage", "inbox.view", "inbox.manage", "expenses.view", "expenses.manage", "inventory.view", "inventory.manage", "kitchen.view", "kitchen.manage", "deliveries.view", "deliveries.manage", "analytics.view", "referrals.view", "referrals.manage", "settings.view", "users.manage", "roles.manage"],
  operations: ["dashboard.view", "orders.view", "orders.manage", "inbox.view", "inbox.manage", "expenses.view", "expenses.manage", "inventory.view", "deliveries.view", "deliveries.manage", "analytics.view", "referrals.view", "referrals.manage", "settings.view"],
  kitchen: ["dashboard.view", "orders.view", "kitchen.view", "kitchen.manage", "inventory.view", "batches.view", "batches.manage"],
  dispatcher: ["dashboard.view", "orders.view", "deliveries.view", "deliveries.manage", "delivery-network.view", "riders.manage"],
  rider: ["dashboard.view", "deliveries.view", "deliveries.manage"]
};

export const PERMISSION_LABELS: Record<string, string> = {
  "dashboard.view": "View dashboard",
  "orders.view": "View orders",
  "orders.manage": "Manage orders",
  "inbox.view": "View inbox",
  "inbox.manage": "Send/manage inbox messages",
  "expenses.view": "View expenses",
  "expenses.manage": "Manage expenses",
  "inventory.view": "View inventory",
  "inventory.manage": "Manage inventory",
  "kitchen.view": "View kitchen",
  "kitchen.manage": "Manage kitchen",
  "batches.view": "View batches",
  "batches.manage": "Manage batches",
  "deliveries.view": "View deliveries",
  "deliveries.manage": "Manage deliveries",
  "delivery-network.view": "View delivery network",
  "riders.manage": "Manage riders",
  "analytics.view": "View analytics",
  "referrals.view": "View referrals",
  "referrals.manage": "Manage referrals",
  "settings.view": "View settings",
  "users.manage": "Manage users",
  "roles.manage": "Manage roles and permissions"
};

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  listUsers() {
    return this.prisma.user.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true, riderProfile: { select: { status: true } } }
    });
  }

  async createUser(input: { email: string; name: string; password: string; role: UserRole }) {
    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ConflictException("A user with that email already exists.");
    const passwordHash = await bcrypt.hash(input.password, 12);
    return this.prisma.user.create({
      data: { email: input.email, name: input.name, passwordHash, role: input.role },
      select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true }
    });
  }

  async updateUser(id: string, input: { name?: string; email?: string; role?: UserRole; password?: string }) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("User not found.");
    if (input.email && input.email !== existing.email) {
      const duplicate = await this.prisma.user.findUnique({ where: { email: input.email } });
      if (duplicate) throw new ConflictException("A user with that email already exists.");
    }
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.email !== undefined ? { email: input.email } : {}),
        ...(input.role !== undefined ? { role: input.role } : {}),
        ...(input.password ? { passwordHash: await bcrypt.hash(input.password, 12) } : {})
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true, updatedAt: true }
    });
  }

  async removeUser(id: string) {
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException("User not found.");
    await this.prisma.user.delete({ where: { id } });
    return { success: true };
  }

  roles() {
    return Object.values(UserRole).map((role) => ({
      role,
      permissions: ROLE_PERMISSIONS[role].map((code) => ({ code, label: PERMISSION_LABELS[code] ?? code }))
    }));
  }

  permissions() {
    return Object.entries(PERMISSION_LABELS).map(([code, label]) => ({ code, label }));
  }
}
