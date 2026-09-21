import { BadRequestException, Injectable, NotFoundException, OnModuleInit } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { PrismaService } from "../../database/prisma.service";

type ReviewStatus = "pending" | "approved" | "rejected";

type StoredReview = {
  _id: string;
  orderId: string;
  orderNumber: string;
  customerId: string;
  productKey: string;
  productName: string;
  reviewerName: string;
  rating: number;
  comment: string | null;
  status: ReviewStatus;
  createdAt: Date;
  updatedAt: Date;
  reviewedAt?: Date | null;
  reviewedById?: string | null;
};

type FindResult<T> = { cursor?: { firstBatch?: T[] } };

const COLLECTION = "product_reviews";

@Injectable()
export class ProductReviewsService implements OnModuleInit {
  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    try {
      await this.prisma.$runCommandRaw({
        createIndexes: COLLECTION,
        indexes: [
          {
            key: { orderId: 1, productKey: 1 },
            name: "order_product_unique",
            unique: true
          },
          {
            key: { productKey: 1, status: 1, createdAt: -1 },
            name: "product_status_created"
          }
        ]
      });
    } catch {
      // The collection/index may already exist.
    }
  }

  async createForOrder(
    orderId: string,
    input: { productName: string; rating: number; comment?: string }
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { customer: true }
    });

    if (!order) throw new NotFoundException("Order not found.");
    if (order.status !== "completed") {
      throw new BadRequestException("Reviews are available after an order is completed.");
    }

    const productName = this.resolveOrderProduct(order.items, input.productName);
    const rating = Math.trunc(Number(input.rating));
    const comment = input.comment?.trim() || null;

    if (!productName) {
      throw new BadRequestException("That product was not part of this order.");
    }

    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      throw new BadRequestException("Rating must be between 1 and 5.");
    }

    if (comment && comment.length > 1000) {
      throw new BadRequestException("Review comment must be 1000 characters or less.");
    }

    const productKey = normalizeProductKey(productName);
    const existing = (await this.prisma.$runCommandRaw({
      find: COLLECTION,
      filter: { orderId, productKey },
      limit: 1
    })) as unknown as FindResult<StoredReview>;

    if ((existing.cursor?.firstBatch ?? []).length > 0) {
      throw new BadRequestException("You have already reviewed this product for this order.");
    }

    const now = new Date();
    const review: StoredReview = {
      _id: randomUUID(),
      orderId,
      orderNumber: order.orderNumber,
      customerId: order.customerId,
      productKey,
      productName,
      reviewerName: order.customer.name,
      rating,
      comment,
      status: "pending",
      createdAt: now,
      updatedAt: now,
      reviewedAt: null,
      reviewedById: null
    };

    await this.prisma.$runCommandRaw({
      insert: COLLECTION,
      documents: [review]
    });

    return {
      ok: true,
      status: "pending",
      message: "Thanks! Your review was submitted and is waiting for approval."
    };
  }

  async listApproved(productKey: string) {
    const normalizedKey = normalizeProductKey(productKey);
    if (!normalizedKey) {
      return { ratingValue: null, reviewCount: 0, reviews: [] };
    }

    const result = (await this.prisma.$runCommandRaw({
      find: COLLECTION,
      filter: { productKey: normalizedKey, status: "approved" },
      sort: { createdAt: -1 },
      limit: 100
    })) as unknown as FindResult<StoredReview>;

    const records = result.cursor?.firstBatch ?? [];
    const total = records.reduce((sum, review) => sum + Number(review.rating), 0);
    const reviewCount = records.length;

    return {
      ratingValue: reviewCount > 0 ? Number((total / reviewCount).toFixed(1)) : null,
      reviewCount,
      reviews: records.slice(0, 20).map((review) => ({
        id: review._id,
        reviewerName: formatReviewerName(review.reviewerName),
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt
      }))
    };
  }

  async listForAdmin(status?: ReviewStatus) {
    const filter = status ? { status } : {};
    const result = (await this.prisma.$runCommandRaw({
      find: COLLECTION,
      filter,
      sort: { createdAt: -1 },
      limit: 200
    })) as unknown as FindResult<StoredReview>;

    return (result.cursor?.firstBatch ?? []).map((review) => ({
      id: review._id,
      orderId: review.orderId,
      orderNumber: review.orderNumber,
      customerId: review.customerId,
      reviewerName: review.reviewerName,
      productName: review.productName,
      rating: review.rating,
      comment: review.comment,
      status: review.status,
      createdAt: review.createdAt,
      reviewedAt: review.reviewedAt ?? null,
      reviewedById: review.reviewedById ?? null
    }));
  }

  async updateStatus(id: string, status: ReviewStatus, reviewedById: string) {
    if (!["pending", "approved", "rejected"].includes(status)) {
      throw new BadRequestException("Invalid review status.");
    }

    const existing = (await this.prisma.$runCommandRaw({
      find: COLLECTION,
      filter: { _id: id },
      limit: 1
    })) as unknown as FindResult<StoredReview>;

    if (!existing.cursor?.firstBatch?.[0]) {
      throw new NotFoundException("Review not found.");
    }

    const reviewedAt = new Date();
    await this.prisma.$runCommandRaw({
      update: COLLECTION,
      updates: [
        {
          q: { _id: id },
          u: {
            $set: {
              status,
              reviewedAt,
              reviewedById,
              updatedAt: reviewedAt
            }
          },
          upsert: false,
          multi: false
        }
      ]
    });

    return {
      ok: true,
      id,
      status,
      reviewedAt
    };
  }

  private resolveOrderProduct(items: unknown, requestedName: string) {
    if (!Array.isArray(items)) return null;
    const requested = normalizeProductKey(requestedName);
    if (!requested) return null;

    const match = items.find((item) => {
      if (!item || typeof item !== "object") return false;
      const name = (item as Record<string, unknown>).name;
      return typeof name === "string" && normalizeProductKey(name) === requested;
    });

    return match && typeof (match as Record<string, unknown>).name === "string"
      ? String((match as Record<string, unknown>).name)
      : null;
  }
}

export function normalizeProductKey(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function formatReviewerName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] || "Verified customer";
  return `${parts[0]} ${parts[parts.length - 1].charAt(0).toUpperCase()}.`;
}
