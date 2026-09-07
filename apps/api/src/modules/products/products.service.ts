import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { PrismaService } from "../../database/prisma.service";

export type ProductRecord = {
  _id: string;
  name: string;
  description?: string | null;
  category: string;
  price: number;
  available: boolean;
  aliases: string[];
  imageUrl?: string | null;
  sortOrder: number;
  createdAt: Date | string;
  updatedAt: Date | string;
};

type MongoFindResult<T> = { cursor?: { firstBatch?: T[] } };
type MongoWriteResult = { n?: number; deletedCount?: number };

const DEFAULT_PRODUCTS: Array<Omit<ProductRecord, "_id" | "createdAt" | "updatedAt">> = [
  { name: "Pork Regular", description: "Classic savory pork empanada.", category: "empanada", price: 20, available: true, aliases: ["pork", "regular pork"], imageUrl: null, sortOrder: 10 },
  { name: "Pork with Egg", description: "Savory pork with egg.", category: "empanada", price: 25, available: true, aliases: ["pork egg", "pork with egg", "pork regular with egg", "pork regular egg"], imageUrl: null, sortOrder: 20 },
  { name: "Pork Asado", description: "Sweet-savory pork asado filling.", category: "empanada", price: 30, available: true, aliases: ["asado", "pork asado"], imageUrl: null, sortOrder: 30 },
  { name: "Chicken", description: "Savory chicken empanada.", category: "empanada", price: 20, available: true, aliases: ["chicken empanada"], imageUrl: null, sortOrder: 40 },
  { name: "Chicken with Egg", description: "Chicken with egg.", category: "empanada", price: 25, available: true, aliases: ["chicken egg", "chicken with egg"], imageUrl: null, sortOrder: 50 },
  { name: "Ham & Cheese", description: "Ham and melted cheese.", category: "empanada", price: 25, available: true, aliases: ["ham", "ham cheese", "ham and cheese", "ham with cheese"], imageUrl: null, sortOrder: 60 },
  { name: "Beef", description: "Savory beef empanada.", category: "empanada", price: 35, available: true, aliases: ["beef empanada"], imageUrl: null, sortOrder: 70 },
  { name: "Beef with Egg", description: "Beef with egg.", category: "empanada", price: 40, available: true, aliases: ["beef egg", "beef with egg"], imageUrl: null, sortOrder: 80 },
  { name: "Bacon", description: "Bacon-filled empanada.", category: "empanada", price: 35, available: true, aliases: ["bacon empanada"], imageUrl: null, sortOrder: 90 },
  { name: "Ube with Cheese", description: "Sweet ube with cheese.", category: "empanada", price: 25, available: true, aliases: ["ube", "ube cheese", "ube empanada"], imageUrl: null, sortOrder: 100 },
  { name: "Choco Flavor", description: "Chocolate-filled empanada.", category: "empanada", price: 30, available: true, aliases: ["choco", "chocolate", "choco empanada"], imageUrl: null, sortOrder: 110 },
  { name: "Mango Flavor", description: "Sweet mango-filled empanada.", category: "empanada", price: 25, available: true, aliases: ["mango", "mango empanada"], imageUrl: null, sortOrder: 120 }
];

@Injectable()
export class ProductsService implements OnModuleInit {
  private readonly collection = "products";
  private cache: { expiresAt: number; available: ProductRecord[] } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    const result = (await this.prisma.$runCommandRaw({ find: this.collection, limit: 1 })) as unknown as MongoFindResult<ProductRecord>;
    if ((result.cursor?.firstBatch ?? []).length > 0) return;
    const now = new Date();
    await this.prisma.$runCommandRaw({ insert: this.collection, documents: DEFAULT_PRODUCTS.map((item) => ({ _id: randomUUID(), ...item, createdAt: now, updatedAt: now })) });
  }

  async list(options: { availableOnly?: boolean } = {}) {
    const availableOnly = options.availableOnly ?? false;
    if (availableOnly && this.cache && this.cache.expiresAt > Date.now()) return this.cache.available;
    const result = (await this.prisma.$runCommandRaw({
      find: this.collection,
      filter: availableOnly ? { available: true } : {},
      sort: { sortOrder: 1, name: 1 },
      limit: 500
    })) as unknown as MongoFindResult<ProductRecord>;
    const items = result.cursor?.firstBatch ?? [];
    if (availableOnly) this.cache = { expiresAt: Date.now() + 3000, available: items };
    return items;
  }

  async getById(id: string) {
    const result = (await this.prisma.$runCommandRaw({ find: this.collection, filter: { _id: id }, limit: 1 })) as unknown as MongoFindResult<ProductRecord>;
    return result.cursor?.firstBatch?.[0] ?? null;
  }

  async resolveByName(value: string, options: { requireAvailable?: boolean } = {}) {
    const normalized = value.trim().toLowerCase();
    if (!normalized) return null;
    const products = await this.list({ availableOnly: options.requireAvailable ?? false });
    return products.find((product) => product.name.toLowerCase() === normalized || product.aliases.some((alias) => alias.toLowerCase() === normalized)) ?? null;
  }

  async create(input: { name: string; description?: string; category?: string; price: number; available?: boolean; aliases?: string[]; imageUrl?: string; sortOrder?: number }) {
    const name = input.name.trim();
    const price = Number(input.price);
    if (!name) throw new BadRequestException("Product name is required.");
    if (!Number.isFinite(price) || price < 0) throw new BadRequestException("Product price must be a valid non-negative number.");
    if (await this.resolveByName(name)) throw new BadRequestException(`Product already exists: ${name}`);
    const now = new Date();
    const document: ProductRecord = {
      _id: randomUUID(), name, description: input.description?.trim() || null, category: input.category?.trim() || "empanada", price,
      available: input.available ?? true, aliases: this.normalizeAliases(input.aliases), imageUrl: input.imageUrl?.trim() || null,
      sortOrder: Number.isFinite(Number(input.sortOrder)) ? Number(input.sortOrder) : 100, createdAt: now, updatedAt: now
    };
    await this.prisma.$runCommandRaw({ insert: this.collection, documents: [document] });
    this.invalidate();
    return document;
  }

  async update(id: string, input: { name?: string; description?: string; category?: string; price?: number; available?: boolean; aliases?: string[]; imageUrl?: string; sortOrder?: number }) {
    const existing = await this.getById(id);
    if (!existing) throw new NotFoundException("Product not found");
    const $set: Record<string, unknown> = { updatedAt: new Date() };
    if (input.name !== undefined) {
      const name = input.name.trim();
      if (!name) throw new BadRequestException("Product name is required.");
      const conflict = await this.resolveByName(name);
      if (conflict && conflict._id !== id) throw new BadRequestException(`Product already exists: ${name}`);
      $set.name = name;
    }
    if (input.description !== undefined) $set.description = input.description.trim() || null;
    if (input.category !== undefined) $set.category = input.category.trim() || "empanada";
    if (input.price !== undefined) {
      const price = Number(input.price);
      if (!Number.isFinite(price) || price < 0) throw new BadRequestException("Product price must be a valid non-negative number.");
      $set.price = price;
    }
    if (input.available !== undefined) $set.available = Boolean(input.available);
    if (input.aliases !== undefined) $set.aliases = this.normalizeAliases(input.aliases);
    if (input.imageUrl !== undefined) $set.imageUrl = input.imageUrl.trim() || null;
    if (input.sortOrder !== undefined) $set.sortOrder = Number(input.sortOrder);
    await this.prisma.$runCommandRaw({ update: this.collection, updates: [{ q: { _id: id }, u: { $set: $set as Prisma.InputJsonObject }, upsert: false, multi: false }] });
    this.invalidate();
    return this.getById(id);
  }

  async remove(id: string) {
    const result = (await this.prisma.$runCommandRaw({ delete: this.collection, deletes: [{ q: { _id: id }, limit: 1 }] })) as unknown as MongoWriteResult;
    if ((result.deletedCount ?? result.n ?? 0) === 0) throw new NotFoundException("Product not found");
    this.invalidate();
    return { ok: true };
  }

  private normalizeAliases(values?: string[]) { return [...new Set((values ?? []).map((value) => String(value).trim()).filter(Boolean))]; }
  private invalidate() { this.cache = null; }
}
