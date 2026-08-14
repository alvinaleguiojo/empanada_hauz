import { BadRequestException, Injectable, NotFoundException, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import * as bcrypt from "bcryptjs";
import { PrismaService } from "../../database/prisma.service";

const CODE_PREFIX = "EH";

type ReferralRecord = {
  id: string;
  referrerUserId: string | null;
  referralPartnerId: string | null;
  referralCode: string;
  customerId: string | null;
  orderId: string | null;
  customerName: string;
  phoneNumber: string | null;
  orderNumber: string | null;
  orderTotal: number;
  status: string;
  commissionPercentage: number;
  commissionAmount: number;
  commissionPaidAt: Date | null;
  commissionPaidById: string | null;
  createdAt: Date;
};

type ReferralUser = {
  id: string;
  name: string;
  email: string;
  role?: string;
  referralCode: string | null;
};

type ReferralPartner = {
  id: string;
  name: string;
  email: string;
  phoneNumber: string | null;
  passwordHash: string;
  referralCode: string;
  approvalStatus?: string | null;
  approvedAt?: Date | null;
  approvedById?: string | null;
  createdAt?: Date;
};

type ReferralPrisma = {
  referral: {
    findMany: (args: unknown) => Promise<ReferralRecord[]>;
    findUnique: (args: unknown) => Promise<ReferralRecord | null>;
    update: (args: unknown) => Promise<ReferralRecord>;
    upsert: (args: unknown) => Promise<ReferralRecord>;
  };
  user: {
    findFirst: (args: unknown) => Promise<ReferralUser | null>;
    findUnique: (args: unknown) => Promise<ReferralUser | null>;
    update: (args: unknown) => Promise<ReferralUser>;
  };
  referralPartner: {
    findMany: (args: unknown) => Promise<ReferralPartner[]>;
    findFirst: (args: unknown) => Promise<ReferralPartner | null>;
    findUnique: (args: unknown) => Promise<ReferralPartner | null>;
    create: (args: unknown) => Promise<ReferralPartner>;
    update: (args: unknown) => Promise<ReferralPartner>;
    count: (args: unknown) => Promise<number>;
  };
};

@Injectable()
export class ReferralsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService
  ) {}

  async getDashboard(userId: string) {
    const db = this.getDb();
    const user = await this.ensureReferralCode(userId);
    const referrals = await db.referral.findMany({
      where: { referrerUserId: user.id },
      orderBy: { createdAt: "desc" },
      take: 100
    });

    return this.toDashboard({
      owner: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role
      },
      referralCode: user.referralCode,
      referrals
    });
  }

  async signupPartner(params: { name: string; email: string; password: string; phoneNumber?: string }) {
    const db = this.getDb();
    const email = params.email.trim().toLowerCase();
    const name = params.name.trim();
    const phoneNumber = params.phoneNumber?.trim() || undefined;

    if (!name) {
      throw new BadRequestException("Name is required");
    }

    const existing = await db.referralPartner.findUnique({ where: { email } });
    if (existing) {
      throw new BadRequestException("A referral account already exists for this email");
    }

    const referralCode = await this.generateUniqueReferralCode(name, email);
    const partner = await db.referralPartner.create({
      data: {
        name,
        email,
        phoneNumber,
        passwordHash: await bcrypt.hash(params.password, 10),
        referralCode
      }
    });

    return this.signPartner(partner);
  }

  async loginPartner(params: { email: string; password: string }) {
    const db = this.getDb();
    const partner = await db.referralPartner.findUnique({
      where: { email: params.email.trim().toLowerCase() }
    });

    if (!partner || !(await bcrypt.compare(params.password, partner.passwordHash))) {
      throw new UnauthorizedException("Invalid referral partner credentials");
    }

    return this.signPartner(partner);
  }

  async getPartnerDashboard(partnerId: string) {
    const db = this.getDb();
    const partner = await this.findPartnerWithApproval(partnerId);

    if (!partner) {
      throw new NotFoundException("Referral partner not found");
    }

    if (this.getPartnerApprovalStatus(partner) !== "approved") {
      throw new UnauthorizedException("Referral account approval is pending");
    }

    const referrals = await db.referral.findMany({
      where: { referralPartnerId: partner.id },
      orderBy: { createdAt: "desc" },
      take: 100
    });

    return this.toDashboard({
      owner: {
        id: partner.id,
        name: partner.name,
        email: partner.email
      },
      referralCode: partner.referralCode,
      referrals
    });
  }

  async listPartners(params: { search?: string; page?: number; pageSize?: number } = {}) {
    const db = this.getDb();
    const requestedPage = Math.max(1, Math.floor(Number(params.page ?? 1)));
    const pageSize = Math.min(50, Math.max(1, Math.floor(Number(params.pageSize ?? 10))));
    const where = createPartnerSearchWhere(params.search);
    const [total, pendingCount] = await Promise.all([
      db.referralPartner.count({ where }),
      db.referralPartner.count({
        where: {
          ...where,
          approvalStatus: { not: "approved" }
        }
      })
    ]);
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const page = Math.min(requestedPage, totalPages);
    const partners = await db.referralPartner.findMany({
      where,
      orderBy: [
        { approvalStatus: "asc" },
        { createdAt: "desc" }
      ],
      skip: (page - 1) * pageSize,
      take: pageSize
    });

    return {
      items: partners.map((partner) => this.serializePartner(partner)),
      pagination: {
        page,
        pageSize,
        total,
        totalPages,
        pendingCount
      }
    };
  }

  async approvePartner(params: { id: string; approvedByUserId: string }) {
    const partner = await this.findPartnerWithApproval(params.id);

    if (!partner) {
      throw new NotFoundException("Referral partner not found");
    }

    return this.serializePartner(await this.updatePartner(partner.id, {
      approvalStatus: "approved",
      approvedAt: new Date(),
      approvedById: params.approvedByUserId
    }));
  }

  async getPartnerStatus(partnerId: string) {
    const partner = await this.findPartnerWithApproval(partnerId);

    if (!partner) {
      throw new NotFoundException("Referral partner not found");
    }

    return {
      partner: this.serializePartner(partner),
      approved: this.getPartnerApprovalStatus(partner) === "approved"
    };
  }

  async getPartnerDashboardOld(partnerId: string) {
    const db = this.getDb();
    const partner = await db.referralPartner.findUnique({
      where: { id: partnerId }
    });

    if (!partner) {
      throw new NotFoundException("Referral partner not found");
    }

    const referrals = await db.referral.findMany({
      where: { referralPartnerId: partner.id },
      orderBy: { createdAt: "desc" },
      take: 100
    });

    return this.toDashboard({
      owner: {
        id: partner.id,
        name: partner.name,
        email: partner.email
      },
      referralCode: partner.referralCode,
      referrals
    });
  }

  async recordOrderReferral(params: {
    referralCode?: string;
    customerId: string;
    customerName: string;
    phoneNumber?: string | null;
    orderId: string;
    orderNumber: string;
    orderTotal: number;
    status: string;
  }) {
    const referralCode = normalizeReferralCode(params.referralCode);
    if (!referralCode) {
      return null;
    }

    const db = this.getDb();
    const referrer = await db.user.findFirst({
      where: { referralCode }
    });
    const partner = referrer ? null : await db.referralPartner.findFirst({
      where: { referralCode }
    });

    if (!referrer && !partner) {
      return null;
    }

    if (partner) {
      const approvedPartner = await this.findPartnerWithApproval(partner.id);
      if (!approvedPartner || this.getPartnerApprovalStatus(approvedPartner) !== "approved") {
        return null;
      }
    }

    return db.referral.upsert({
      where: { orderId: params.orderId },
      create: {
        referrerUserId: referrer?.id,
        referralPartnerId: partner?.id,
        referralCode,
        customerId: params.customerId,
        orderId: params.orderId,
        customerName: params.customerName,
        phoneNumber: params.phoneNumber,
        orderNumber: params.orderNumber,
        orderTotal: params.orderTotal,
        status: params.status
      },
      update: {
        status: params.status,
        orderTotal: params.orderTotal
      }
    });
  }

  async updateCommission(params: { id: string; commissionPercentage: number }) {
    const db = this.getDb();
    const referral = await db.referral.findUnique({
      where: { id: params.id }
    });

    if (!referral) {
      throw new NotFoundException("Referral not found");
    }

    const commissionPercentage = Number(params.commissionPercentage);
    if (!Number.isFinite(commissionPercentage) || commissionPercentage < 0 || commissionPercentage > 100) {
      throw new BadRequestException("Commission percentage must be between 0 and 100");
    }

    const commissionAmount = roundMoney(Number(referral.orderTotal ?? 0) * (commissionPercentage / 100));
    return this.serializeReferral(await this.updateReferral(referral.id, {
      commissionPercentage,
      commissionAmount
    }));
  }

  async markCommissionPaid(params: { id: string; paidByUserId: string }) {
    const db = this.getDb();
    const referral = await db.referral.findUnique({
      where: { id: params.id }
    });

    if (!referral) {
      throw new NotFoundException("Referral not found");
    }

    return this.serializeReferral(await this.updateReferral(referral.id, {
      commissionPaidAt: new Date(),
      commissionPaidById: params.paidByUserId
    }));
  }

  private async ensureReferralCode(userId: string) {
    const db = this.getDb();
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true, referralCode: true }
    });

    if (!user) {
      throw new NotFoundException("User not found");
    }

    if (user.referralCode) {
      return { ...user, referralCode: user.referralCode };
    }

    const referralCode = await this.generateUniqueReferralCode(user.name, user.id);
    const updated = await db.user.update({
      where: { id: user.id },
      data: { referralCode },
      select: { id: true, name: true, email: true, role: true, referralCode: true }
    });

    return { ...updated, referralCode: updated.referralCode ?? referralCode };
  }

  private async signPartner(partner: ReferralPartner) {
    const partnerWithApproval = await this.findPartnerWithApproval(partner.id) ?? partner;
    const approvalStatus = this.getPartnerApprovalStatus(partnerWithApproval);
    const accessToken = await this.jwtService.signAsync({
      sub: partner.id,
      email: partner.email,
      type: "referral_partner",
      approvalStatus
    });

    return {
      accessToken,
      expiresIn: this.config.get<string>("JWT_EXPIRES_IN", "1d"),
      partner: {
        id: partner.id,
        name: partner.name,
        email: partner.email,
        phoneNumber: partner.phoneNumber,
        referralCode: partner.referralCode,
        referralPath: `/customer?ref=${encodeURIComponent(partner.referralCode)}`,
        approvalStatus,
        approvedAt: partnerWithApproval.approvedAt ?? null
      }
    };
  }

  private toDashboard(params: {
    owner: {
      id: string;
      name: string;
      email: string;
      role?: string;
    };
    referralCode: string;
    referrals: ReferralRecord[];
  }) {
    const totalRevenue = params.referrals.reduce((sum, referral) => sum + Number(referral.orderTotal ?? 0), 0);
    const uniqueCustomers = new Set(params.referrals.map((referral) => referral.customerId ?? normalizePhoneNumber(referral.phoneNumber) ?? referral.customerName)).size;

    return {
      user: params.owner,
      referralCode: params.referralCode,
      referralPath: `/customer?ref=${encodeURIComponent(params.referralCode)}`,
      totalReferrals: params.referrals.length,
      uniqueCustomers,
      totalRevenue,
      unpaidCommission: params.referrals.reduce((sum, referral) => sum + (referral.commissionPaidAt ? 0 : Number(referral.commissionAmount ?? 0)), 0),
      paidCommission: params.referrals.reduce((sum, referral) => sum + (referral.commissionPaidAt ? Number(referral.commissionAmount ?? 0) : 0), 0),
      referrals: params.referrals.map((referral) => this.serializeReferral(referral))
    };
  }

  private serializeReferral(referral: ReferralRecord, referrerName?: string) {
    return {
      id: referral.id,
      customerName: referral.customerName,
      phoneNumber: referral.phoneNumber,
      orderNumber: referral.orderNumber,
      orderTotal: referral.orderTotal,
      status: referral.status,
      commissionPercentage: Number(referral.commissionPercentage ?? 0),
      commissionAmount: Number(referral.commissionAmount ?? 0),
      commissionPaidAt: referral.commissionPaidAt ?? null,
      createdAt: referral.createdAt,
      referralCode: referral.referralCode,
      referrerName: referrerName ?? null
    };
  }

  async getAllReferrals() {
    const db = this.getDb();
    const referrals = await db.referral.findMany({
      orderBy: { createdAt: "desc" },
      take: 300
    });

    const userIds = [...new Set(referrals.map((referral) => referral.referrerUserId).filter((id): id is string => Boolean(id)))];
    const partnerIds = [...new Set(referrals.map((referral) => referral.referralPartnerId).filter((id): id is string => Boolean(id)))];

    const [users, partners] = await Promise.all([
      userIds.length ? db.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } }) : Promise.resolve([]),
      partnerIds.length ? db.referralPartner.findMany({ where: { id: { in: partnerIds } }, select: { id: true, name: true } }) : Promise.resolve([])
    ]);

    const userNameById = new Map(users.map((user) => [user.id, user.name]));
    const partnerNameById = new Map(partners.map((partner) => [partner.id, partner.name]));

    const totalRevenue = referrals.reduce((sum, referral) => sum + Number(referral.orderTotal ?? 0), 0);
    const uniqueCustomers = new Set(
      referrals.map((referral) => referral.customerId ?? normalizePhoneNumber(referral.phoneNumber) ?? referral.customerName)
    ).size;

    return {
      totalReferrals: referrals.length,
      uniqueCustomers,
      totalRevenue,
      unpaidCommission: referrals.reduce((sum, referral) => sum + (referral.commissionPaidAt ? 0 : Number(referral.commissionAmount ?? 0)), 0),
      paidCommission: referrals.reduce((sum, referral) => sum + (referral.commissionPaidAt ? Number(referral.commissionAmount ?? 0) : 0), 0),
      referrals: referrals.map((referral) =>
        this.serializeReferral(
          referral,
          (referral.referrerUserId && userNameById.get(referral.referrerUserId)) ||
            (referral.referralPartnerId && partnerNameById.get(referral.referralPartnerId)) ||
            undefined
        )
      )
    };
  }

  private async updateReferral(id: string, data: Record<string, unknown>) {
    const db = this.getDb();
    return db.referral.update({
      where: { id },
      data
    });
  }

  private async updatePartner(id: string, data: Record<string, unknown>) {
    const db = this.getDb();
    return db.referralPartner.update({
      where: { id },
      data
    });
  }

  private async findPartnerWithApproval(id: string) {
    const db = this.getDb();
    return db.referralPartner.findUnique({
      where: { id }
    });
  }

  private serializePartner(partner: ReferralPartner) {
    return {
      id: partner.id,
      name: partner.name,
      email: partner.email,
      phoneNumber: partner.phoneNumber,
      referralCode: partner.referralCode,
      approvalStatus: this.getPartnerApprovalStatus(partner),
      approvedAt: partner.approvedAt ?? null,
      createdAt: partner.createdAt ?? null
    };
  }

  private getPartnerApprovalStatus(partner: ReferralPartner) {
    return partner.approvalStatus === "approved" ? "approved" : "pending";
  }

  private async generateUniqueReferralCode(name: string, userId: string) {
    const db = this.getDb();
    const base = normalizeReferralCode(`${CODE_PREFIX}${name}`)?.slice(0, 12) || `${CODE_PREFIX}${userId.slice(-6).toUpperCase()}`;

    for (let attempt = 0; attempt < 20; attempt += 1) {
      const suffix = attempt === 0 ? userId.slice(-4) : `${userId.slice(-4)}${attempt}`;
      const candidate = normalizeReferralCode(`${base}${suffix}`) ?? `${CODE_PREFIX}${Date.now()}`;
      const [existingUser, existingPartner] = await Promise.all([
        db.user.findFirst({ where: { referralCode: candidate }, select: { id: true } }),
        db.referralPartner.findFirst({ where: { referralCode: candidate }, select: { id: true } })
      ]);
      if (!existingUser && !existingPartner) {
        return candidate;
      }
    }

    return `${CODE_PREFIX}${Date.now()}`;
  }

  private getDb() {
    return this.prisma as unknown as ReferralPrisma;
  }
}

export function normalizeReferralCode(value?: string | null) {
  const code = value?.toUpperCase().replace(/[^A-Z0-9]/g, "").trim();
  return code && code.length >= 3 ? code : undefined;
}

function normalizePhoneNumber(value?: string | null) {
  const phone = value?.replace(/\D/g, "");
  return phone || undefined;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function createPartnerSearchWhere(value?: string) {
  const search = value?.trim();
  if (!search) {
    return {};
  }

  return {
    OR: [
      { name: { contains: search, mode: "insensitive" } },
      { email: { contains: search.toLowerCase(), mode: "insensitive" } },
      { phoneNumber: { contains: search, mode: "insensitive" } },
      { referralCode: { contains: normalizeReferralCode(search) ?? search, mode: "insensitive" } },
      { approvalStatus: { contains: search.toLowerCase(), mode: "insensitive" } }
    ]
  };
}
