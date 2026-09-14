import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { randomUUID } from "crypto";
import { PrismaService } from "../../database/prisma.service";

export const FRAUD_ENTITY_TYPES = ["customer", "rider"] as const;
export const FRAUD_CASE_STATUSES = ["open", "reviewed", "cleared"] as const;
export const FRAUD_SEVERITIES = ["low", "medium", "high", "critical"] as const;

export type FraudEntityType = (typeof FRAUD_ENTITY_TYPES)[number];
export type FraudCaseStatus = (typeof FRAUD_CASE_STATUSES)[number];
export type FraudSeverity = (typeof FRAUD_SEVERITIES)[number];

type FraudCaseDocument = {
  _id: string;
  entityType: FraudEntityType;
  status: FraudCaseStatus;
  severity: FraudSeverity;
  name?: string | null;
  phoneNumber?: string | null;
  email?: string | null;
  plateNumber?: string | null;
  messengerPsid?: string | null;
  address?: string | null;
  subjectId?: string | null;
  reason: string;
  notes?: string | null;
  createdByUserId?: string | null;
  updatedByUserId?: string | null;
  resolvedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

type FraudLogDocument = {
  _id: string;
  entityType: FraudEntityType;
  caseId: string;
  orderId?: string | null;
  deliveryJobId?: string | null;
  riderId?: string | null;
  matchedOn: string[];
  score: number;
  severity: FraudSeverity;
  createdAt: Date;
};

type MongoFindResult<T> = { cursor?: { firstBatch?: T[]; id?: unknown } };

const CASES_COLLECTION = "fraud_cases";
const LOGS_COLLECTION = "fraud_detection_logs";

@Injectable()
export class FraudService {
  private readonly logger = new Logger(FraudService.name);

  constructor(private readonly prisma: PrismaService) {}

  async listCases(filters: { entityType?: FraudEntityType; status?: FraudCaseStatus } = {}) {
    const query: Record<string, unknown> = {};
    if (filters.entityType) query.entityType = filters.entityType;
    if (filters.status) query.status = filters.status;
    const result = (await this.prisma.$runCommandRaw({
      find: CASES_COLLECTION,
      filter: query,
      sort: { updatedAt: -1 },
      limit: 500
    })) as unknown as MongoFindResult<FraudCaseDocument>;
    return result.cursor?.firstBatch ?? [];
  }

  async listLogs(limit = 200) {
    const result = (await this.prisma.$runCommandRaw({
      find: LOGS_COLLECTION,
      filter: {},
      sort: { createdAt: -1 },
      limit: Math.min(Math.max(limit, 1), 500)
    })) as unknown as MongoFindResult<FraudLogDocument>;
    return result.cursor?.firstBatch ?? [];
  }

  async stats() {
    const [openCustomers, openRiders, critical, recentLogs] = await Promise.all([
      this.countCases({ entityType: "customer", status: "open" }),
      this.countCases({ entityType: "rider", status: "open" }),
      this.countCases({ status: "open", severity: "critical" }),
      this.listLogs(20)
    ]);
    return {
      openCustomers,
      openRiders,
      critical,
      recentMatches: recentLogs.length
    };
  }

  async createCase(input: {
    entityType: FraudEntityType;
    severity: FraudSeverity;
    name?: string;
    phoneNumber?: string;
    email?: string;
    plateNumber?: string;
    messengerPsid?: string;
    address?: string;
    subjectId?: string;
    reason: string;
    notes?: string;
    userId?: string;
  }) {
    const now = new Date();
    const document: FraudCaseDocument = {
      _id: randomUUID(),
      entityType: input.entityType,
      status: "open",
      severity: input.severity,
      name: input.name?.trim() || null,
      phoneNumber: input.phoneNumber?.trim() || null,
      email: input.email?.trim().toLowerCase() || null,
      plateNumber: input.plateNumber?.trim() || null,
      messengerPsid: input.messengerPsid?.trim() || null,
      address: input.address?.trim() || null,
      subjectId: input.subjectId?.trim() || null,
      reason: input.reason.trim(),
      notes: input.notes?.trim() || null,
      createdByUserId: input.userId ?? null,
      updatedByUserId: input.userId ?? null,
      resolvedAt: null,
      createdAt: now,
      updatedAt: now
    };
    await this.prisma.$runCommandRaw({ insert: CASES_COLLECTION, documents: [document] });
    return document;
  }

  async updateCase(id: string, input: {
    status?: FraudCaseStatus;
    severity?: FraudSeverity;
    reason?: string;
    notes?: string;
    userId?: string;
  }) {
    const existing = await this.findCase(id);
    if (!existing) throw new NotFoundException("Fraud case not found");
    const now = new Date();
    const set: Record<string, unknown> = { updatedAt: now };
    if (input.status) {
      set.status = input.status;
      set.resolvedAt = input.status === "cleared" || input.status === "reviewed" ? now : null;
    }
    if (input.severity) set.severity = input.severity;
    if (input.reason != null) set.reason = input.reason.trim();
    if (input.notes != null) set.notes = input.notes.trim() || null;
    if (input.userId) set.updatedByUserId = input.userId;
    await this.prisma.$runCommandRaw({ update: CASES_COLLECTION, updates: [{ q: { _id: id }, u: { $set: set } }] });
    return this.findCase(id);
  }

  async deleteCase(id: string) {
    const existing = await this.findCase(id);
    if (!existing) throw new NotFoundException("Fraud case not found");
    await this.prisma.$runCommandRaw({ delete: CASES_COLLECTION, deletes: [{ q: { _id: id }, limit: 1 }] });
    return { deleted: true, id };
  }

  async detectCustomerOrder(order: {
    id: string;
    customer?: {
      id?: string | null;
      name?: string | null;
      phoneNumber?: string | null;
      defaultAddress?: string | null;
      messengerPsid?: string | null;
    } | null;
    address?: string | null;
    location?: string | null;
  }) {
    const customer = order.customer;
    if (!customer) return { matched: false, matches: [] };
    const cases = await this.listCases({ entityType: "customer", status: "open" });
    const matches = cases.map((fraudCase) => this.matchCustomerCase(fraudCase, customer, order)).filter(Boolean) as Array<{
      caseId: string;
      severity: FraudSeverity;
      score: number;
      matchedOn: string[];
      reason: string;
      name?: string | null;
    }>;

    for (const match of matches) {
      await this.writeLog({ entityType: "customer", caseId: match.caseId, orderId: order.id, matchedOn: match.matchedOn, score: match.score, severity: match.severity });
    }

    return {
      matched: matches.length > 0,
      highestSeverity: this.highestSeverity(matches.map((match) => match.severity)),
      matches
    };
  }

  async detectRiderAssignment(input: {
    deliveryJobId: string;
    riderId: string;
    rider?: {
      phoneNumber?: string | null;
      user?: { id?: string | null; name?: string | null; email?: string | null } | null;
      vehicles?: Array<{ plateNumber?: string | null }>;
    } | null;
  }) {
    const rider = input.rider;
    if (!rider) return { matched: false, matches: [] };
    const cases = await this.listCases({ entityType: "rider", status: "open" });
    const plateNumber = rider.vehicles?.[0]?.plateNumber ?? null;
    const matches = cases.map((fraudCase) => this.matchRiderCase(fraudCase, rider, plateNumber)).filter(Boolean) as Array<{
      caseId: string;
      severity: FraudSeverity;
      score: number;
      matchedOn: string[];
      reason: string;
      name?: string | null;
    }>;

    for (const match of matches) {
      await this.writeLog({ entityType: "rider", caseId: match.caseId, riderId: input.riderId, deliveryJobId: input.deliveryJobId, matchedOn: match.matchedOn, score: match.score, severity: match.severity });
    }

    return {
      matched: matches.length > 0,
      highestSeverity: this.highestSeverity(matches.map((match) => match.severity)),
      matches
    };
  }

  private matchCustomerCase(
    fraudCase: FraudCaseDocument,
    customer: { id?: string | null; name?: string | null; phoneNumber?: string | null; defaultAddress?: string | null; messengerPsid?: string | null },
    order: { address?: string | null; location?: string | null }
  ) {
    const matchedOn: string[] = [];
    if (fraudCase.subjectId && customer.id && fraudCase.subjectId === customer.id) matchedOn.push("customerId");
    if (this.samePhone(fraudCase.phoneNumber, customer.phoneNumber)) matchedOn.push("phone");
    if (this.sameText(fraudCase.name, customer.name)) matchedOn.push("name");
    if (this.sameText(fraudCase.messengerPsid, customer.messengerPsid)) matchedOn.push("messenger");
    const orderAddress = order.address || order.location || customer.defaultAddress;
    if (this.sameAddress(fraudCase.address, orderAddress)) matchedOn.push("address");
    if (!matchedOn.length) return null;
    const score = this.score(matchedOn);
    return { caseId: fraudCase._id, severity: fraudCase.severity, score, matchedOn, reason: fraudCase.reason, name: fraudCase.name };
  }

  private matchRiderCase(
    fraudCase: FraudCaseDocument,
    rider: { phoneNumber?: string | null; user?: { id?: string | null; name?: string | null; email?: string | null } | null },
    plateNumber: string | null
  ) {
    const matchedOn: string[] = [];
    if (fraudCase.subjectId && rider.user?.id && fraudCase.subjectId === rider.user.id) matchedOn.push("userId");
    if (this.samePhone(fraudCase.phoneNumber, rider.phoneNumber)) matchedOn.push("phone");
    if (this.sameText(fraudCase.name, rider.user?.name)) matchedOn.push("name");
    if (this.sameEmail(fraudCase.email, rider.user?.email)) matchedOn.push("email");
    if (this.sameText(fraudCase.plateNumber, plateNumber)) matchedOn.push("plate");
    if (!matchedOn.length) return null;
    const score = this.score(matchedOn);
    return { caseId: fraudCase._id, severity: fraudCase.severity, score, matchedOn, reason: fraudCase.reason, name: fraudCase.name };
  }

  private score(fields: string[]) {
    if (fields.some((field) => ["customerId", "userId", "phone", "email", "messenger", "plate"].includes(field))) return 100;
    if (fields.includes("name") && fields.includes("address")) return 90;
    if (fields.includes("name")) return 70;
    if (fields.includes("address")) return 60;
    return 50;
  }

  private highestSeverity(values: FraudSeverity[]) {
    return values.sort((a, b) => this.severityRank(b) - this.severityRank(a))[0] ?? null;
  }

  private severityRank(value: FraudSeverity) {
    return { low: 1, medium: 2, high: 3, critical: 4 }[value];
  }

  private samePhone(a?: string | null, b?: string | null) {
    const normalize = (value?: string | null) => {
      const digits = (value ?? "").replace(/\D/g, "");
      if (digits.startsWith("63") && digits.length === 12) return `0${digits.slice(2)}`;
      return digits;
    };
    const left = normalize(a);
    const right = normalize(b);
    return left.length >= 7 && left === right;
  }

  private sameEmail(a?: string | null, b?: string | null) {
    return Boolean(a && b && a.trim().toLowerCase() === b.trim().toLowerCase());
  }

  private sameText(a?: string | null, b?: string | null) {
    return Boolean(a && b && this.normalizeText(a) === this.normalizeText(b));
  }

  private sameAddress(a?: string | null, b?: string | null) {
    if (!a || !b) return false;
    return this.normalizeText(a).replace(/[^a-z0-9]/g, "") === this.normalizeText(b).replace(/[^a-z0-9]/g, "");
  }

  private normalizeText(value: string) {
    return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
  }

  private async writeLog(input: Omit<FraudLogDocument, "_id" | "createdAt">) {
    try {
      await this.prisma.$runCommandRaw({ insert: LOGS_COLLECTION, documents: [{ ...input, _id: randomUUID(), createdAt: new Date() }] });
    } catch (error) {
      this.logger.warn(`Unable to persist fraud detection log: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async findCase(id: string) {
    const result = (await this.prisma.$runCommandRaw({ find: CASES_COLLECTION, filter: { _id: id }, limit: 1 })) as unknown as MongoFindResult<FraudCaseDocument>;
    return result.cursor?.firstBatch?.[0] ?? null;
  }

  private async countCases(filter: Record<string, unknown>) {
    const result = (await this.prisma.$runCommandRaw({ count: CASES_COLLECTION, query: filter })) as unknown as { n?: number };
    return Number(result.n ?? 0);
  }
}
