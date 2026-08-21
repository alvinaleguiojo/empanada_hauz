import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { DeliveryNetworkService } from "../delivery-network/delivery-network.service";
import { PrismaService } from "../../database/prisma.service";
import { AddOrderNoteDto, CreateOrderDto, ExportOrdersToDriveDto, ManualOrderEntryDto, PublicOrderEntryDto, UpdateOrderDto, UpdateOrderStatusDto } from "./dto";
import { OrdersService } from "./orders.service";

const DEFAULT_PICKUP_COORDINATES = { latitude: 10.2760457, longitude: 123.8466921 };

@Controller("orders")
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly deliveryNetworkService: DeliveryNetworkService,
    private readonly prisma: PrismaService
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  list(@Query("date") date?: string, @Query("search") search?: string, @Query("upcoming") upcoming?: string) {
    if (upcoming === "true") {
      return this.prisma.order.findMany({
        where: {
          preferredSchedule: { gte: new Date() },
          status: { notIn: ["completed", "cancelled"] }
        },
        include: {
          customer: true,
          batch: true,
          delivery: true,
          orderNotes: { orderBy: { createdAt: "desc" } },
          deliveryJobs: {
            where: { status: { notIn: ["cancelled"] } },
            orderBy: { requestedAt: "desc" },
            take: 1,
            include: { rider: { include: { user: { select: { id: true, name: true, email: true } } } } }
          }
        },
        orderBy: { preferredSchedule: "asc" },
        take: 500
      });
    }

    return this.ordersService.list({ date, search });
  }

  @Get("track/:id")
  track(@Param("id") id: string) {
    return this.ordersService.track(id);
  }

  // Public delivery-fee preview. The pickup point is always the Empanada Hauz
  // store coordinates; the customer address/landmark determine the drop-off.
  @Get("delivery-quote")
  async deliveryQuote(
    @Query("address") address?: string,
    @Query("landmark") landmark?: string,
    @Query("latitude") latitude?: string,
    @Query("longitude") longitude?: string
  ) {
    const trimmedAddress = (address ?? "").trim().slice(0, 300);
    const trimmedLandmark = (landmark ?? "").trim().slice(0, 200);
    if (!trimmedAddress && !trimmedLandmark) {
      return { distanceKm: null, estimatedDurationMinutes: null, estimatedArrivalAt: null, estimatedFare: 0 };
    }

    const parsedLatitude = Number(latitude);
    const parsedLongitude = Number(longitude);
    const hasDropoffCoordinates = Number.isFinite(parsedLatitude) && Number.isFinite(parsedLongitude);

    // When a landmark was selected from Places, it is usually the most precise
    // description of the delivery point (for example, "Gaisano Capital").
    // Combine it with the customer's address so geocoding can resolve the
    // actual place instead of routing to the center of a whole city.
    const dropoffAddress = [trimmedLandmark, trimmedAddress].filter(Boolean).join(", ");

    return this.deliveryNetworkService.quoteJob({
      pickupAddress: "Empanada Hauz",
      pickupLatitude: DEFAULT_PICKUP_COORDINATES.latitude,
      pickupLongitude: DEFAULT_PICKUP_COORDINATES.longitude,
      dropoffAddress,
      ...(hasDropoffCoordinates
        ? {
            dropoffLatitude: parsedLatitude,
            dropoffLongitude: parsedLongitude
          }
        : {})
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.ordersService.create(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post("manual")
  createManual(@Body() dto: ManualOrderEntryDto) {
    return this.ordersService.createManual(dto);
  }

  @Post("public")
  createPublic(@Body() dto: PublicOrderEntryDto) {
    return this.ordersService.createPublic(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post("export/google-drive")
  exportToGoogleDrive(@Body() dto: ExportOrdersToDriveDto) {
    return this.ordersService.exportToGoogleDrive(dto.orderIds);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(":id/status")
  updateStatus(@Param("id") id: string, @Body() dto: UpdateOrderStatusDto) {
    return this.ordersService.updateStatus(id, dto.status);
  }

  @UseGuards(JwtAuthGuard)
  @Patch(":id")
  update(@Param("id") id: string, @Body() dto: UpdateOrderDto) {
    return this.ordersService.update(id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post(":id/notes")
  addNote(@Param("id") id: string, @Body() dto: AddOrderNoteDto) {
    return this.ordersService.addNote(id, dto.body);
  }

  @UseGuards(JwtAuthGuard)
  @Delete(":id")
  remove(@Param("id") id: string) {
    return this.ordersService.remove(id);
  }
}
