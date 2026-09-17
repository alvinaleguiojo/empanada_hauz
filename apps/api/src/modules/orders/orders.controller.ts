import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards, UseInterceptors } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { DeliveryNetworkService } from "../delivery-network/delivery-network.service";
import { PrismaService } from "../../database/prisma.service";
import { FraudOrderInterceptor } from "../fraud/fraud-order.interceptor";
import { GoogleWorkspaceService } from "../google-workspace/google-workspace.service";
import { AddOrderNoteDto, CreateOrderDto, ExportOrdersToDriveDto, ManualOrderEntryDto, PublicOrderEntryDto, UpdateOrderDto, UpdateOrderStatusDto } from "./dto";
import { OrdersService } from "./orders.service";

const DEFAULT_PICKUP_COORDINATES = { latitude: 10.2760457, longitude: 123.8466921 };
const FRAUD_SEVERITY_RANK: Record<string, number> = { low: 1, medium: 2, high: 3, critical: 4 };

@UseInterceptors(FraudOrderInterceptor)
@Controller("orders")
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly deliveryNetworkService: DeliveryNetworkService,
    private readonly prisma: PrismaService,
    private readonly googleWorkspace: GoogleWorkspaceService
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  async list(@Query("date") date?: string, @Query("search") search?: string, @Query("upcoming") upcoming?: string) {
    let orders: any[];

    if (upcoming === "true") {
      orders = await this.prisma.order.findMany({
        where: { preferredSchedule: { gte: new Date() }, status: { notIn: ["completed", "cancelled"] } },
        include: { customer: true, batch: true, delivery: true, orderNotes: { orderBy: { createdAt: "desc" } }, deliveryJobs: { where: { status: { notIn: ["cancelled"] } }, orderBy: { requestedAt: "desc" }, take: 1, include: { rider: { include: { user: { select: { id: true, name: true, email: true } } } } } } },
        orderBy: { preferredSchedule: "asc" }, take: 500
      });
    } else {
      orders = await this.ordersService.list({ date, search });
    }

    return this.attachFraudFlags(orders);
  }

  @Get("track/:id") track(@Param("id") id: string) { return this.ordersService.track(id); }

  @Get("delivery-quote")
  async deliveryQuote(@Query("address") address?: string, @Query("landmark") landmark?: string, @Query("latitude") latitude?: string, @Query("longitude") longitude?: string) {
    const trimmedAddress = (address ?? "").trim().slice(0, 300);
    const trimmedLandmark = (landmark ?? "").trim().slice(0, 200);
    if (!trimmedAddress && !trimmedLandmark) return { distanceKm: null, estimatedDurationMinutes: null, estimatedArrivalAt: null, estimatedFare: 0 };
    const parsedLatitude = Number(latitude); const parsedLongitude = Number(longitude);
    const hasDropoffCoordinates = Number.isFinite(parsedLatitude) && Number.isFinite(parsedLongitude);
    const dropoffAddress = [trimmedLandmark, trimmedAddress].filter(Boolean).join(", ");
    return this.deliveryNetworkService.quoteJob({ pickupAddress: "Empanada Hauz", pickupLatitude: DEFAULT_PICKUP_COORDINATES.latitude, pickupLongitude: DEFAULT_PICKUP_COORDINATES.longitude, dropoffAddress, ...(hasDropoffCoordinates ? { dropoffLatitude: parsedLatitude, dropoffLongitude: parsedLongitude } : {}) });
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() dto: CreateOrderDto) { return this.ordersService.create(dto); }

  @UseGuards(JwtAuthGuard)
  @Post("manual")
  createManual(@Body() dto: ManualOrderEntryDto) { return this.ordersService.createManual(dto); }

  @Post("public")
  createPublic(@Body() dto: PublicOrderEntryDto) { return this.ordersService.createPublic(dto); }

  @UseGuards(JwtAuthGuard)
  @Post("export/google-drive")
  exportToGoogleDrive(@Body() dto: ExportOrdersToDriveDto) { return this.ordersService.exportToGoogleDrive(dto.orderIds); }

  @UseGuards(JwtAuthGuard)
  @Post(":id/google-calendar/sync")
  syncGoogleCalendar(@Param("id") id: string) { return this.googleWorkspace.syncOrder(id); }

  @UseGuards(JwtAuthGuard)
  @Delete(":id/google-calendar/event")
  deleteGoogleCalendarEvent(@Param("id") id: string) { return this.googleWorkspace.deleteOrderEvent(id); }

  @UseGuards(JwtAuthGuard)
  @Patch(":id/status")
  updateStatus(@Param("id") id: string, @Body() dto: UpdateOrderStatusDto) { return this.ordersService.updateStatus(id, dto.status); }

  @UseGuards(JwtAuthGuard)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateOrderDto) { return this.ordersService.update(id, dto); }

  @UseGuards(JwtAuthGuard)
  @Post(":id/notes")
  addNote(@Param("id") id: string, @Body() dto: AddOrderNoteDto) { return this.ordersService.addNote(id, dto.body); }

  @UseGuards(JwtAuthGuard)
  @Delete(":id")
  remove(@Param("id") id: string) { return this.ordersService.remove(id); }

  private async attachFraudFlags(orders: any[]) {
    if (!Array.isArray(orders) || orders.length === 0) return orders;
    const cases = await this.prisma.fraudCase.findMany({ where: { entityType: "customer", status: "open" }, take: 500 });
    if (cases.length === 0) return orders;
    return orders.map((order) => order?.customer ? this.attachCustomerFraudFlag(order, order.customer, cases) : order);
  }

  private attachCustomerFraudFlag(order: any, customer: any, cases: any[]) {
    const matches = cases.map((fraudCase: any) => {
      if (!this.samePhone(fraudCase.phoneNumber, customer.phoneNumber)) return null;
      const matchedOn: string[] = ["phone"];
      if (fraudCase.subjectId && customer.id && fraudCase.subjectId === customer.id) matchedOn.push("customerId");
      if (this.sameText(fraudCase.name, customer.name)) matchedOn.push("name");
      if (this.sameText(fraudCase.messengerPsid, customer.messengerPsid)) matchedOn.push("messenger");
      const orderAddress = order.address || order.location || customer.defaultAddress;
      if (this.sameAddress(fraudCase.address, orderAddress)) matchedOn.push("address");
      if (matchedOn.length < 2) return null;
      return { caseId: fraudCase.id, severity: fraudCase.severity, score: 100, matchedOn, reason: fraudCase.reason };
    }).filter(Boolean) as Array<{ caseId: string; severity: string; score: number; matchedOn: string[]; reason: string }>;
    if (matches.length === 0) return order;
    const highest = matches.reduce((current, match) => (FRAUD_SEVERITY_RANK[match.severity] ?? 0) > (FRAUD_SEVERITY_RANK[current] ?? 0) ? match.severity : current, matches[0].severity);
    return { ...order, fraud: { matched: true, severity: highest, matches } };
  }

  private samePhone(a?: string | null, b?: string | null) {
    const normalize = (value?: string | null) => { const digits = (value ?? "").replace(/\D/g, ""); return digits.startsWith("63") && digits.length === 12 ? `0${digits.slice(2)}` : digits; };
    const left = normalize(a); const right = normalize(b); return left.length >= 7 && left === right;
  }

  private sameText(a?: string | null, b?: string | null) { return Boolean(a && b && this.normalizeText(a) === this.normalizeText(b)); }
  private sameAddress(a?: string | null, b?: string | null) { return Boolean(a && b && this.normalizeText(a).replace(/[^a-z0-9]/g, "") === this.normalizeText(b).replace(/[^a-z0-9]/g, "")); }
  private normalizeText(value: string) { return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " "); }
}
