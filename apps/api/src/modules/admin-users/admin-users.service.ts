import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import { UserRole } from "@prisma/client";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../database/prisma.service";
import { PERMISSION_LABELS, ROLE_PERMISSIONS } from "../auth/permissions";

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
      permissions: ROLE_PERMISSIONS[role]
        .filter((code) => code !== "admin.only")
        .map((code) => ({ code, label: PERMISSION_LABELS[code] ?? code }))
    }));
  }

  permissions() {
    return Object.entries(PERMISSION_LABELS)
      .filter(([code]) => code !== "admin.only")
      .map(([code, label]) => ({ code, label }));
  }
}
