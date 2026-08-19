import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";
import { JwtAuthGuard } from "../auth/jwt-auth.guard";
import { DeliveryNetworkService } from "../delivery-network/delivery-network.service";
import { AddOrderNoteDto, CreateOrderDto, ExportOrdersToDriveDto, ManualOrderEntryDto, PublicOrderEntryDto, UpdateOrderDto, UpdateOrderStatusDto } from "./dto";
import { OrdersService } from "./orders.service";

const DEFAULT_PICKUP_COORDINATES = { latitude: 10.2760457, longitude: 123.8466921 };

@Controller("orders")
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly deliveryNetworkService: DeliveryNetworkService
  ) {}

  @UseGuards(JwtAuthGuard)
  @Get()
  list(@Query("date") date?: string, @Query("search") search?: string) {
    return this.ordersService.list({ date, search });
  }

  @Get("track/:id")
  track(@Param("id") id: string) {
    return this.ordersService.track(id);
  }

  // Public - lets the customer ordering page show an estimated delivery
  // fee before checkout, using the same Google Maps + fee formula used by
  // the delivery network. The store coordinates are fixed and authoritative.
  @Get("delivery-quote")
  async deliveryQuote(
    @Query("address") address?: string,
    @Query("landmark") landmark?: string,
    @Query("latitude") latitude?: string,
    @Query("longitude") longitude?: string
  ) {
    const trimmedAddress = (address ?? "").trim().slice(0, 300);
    const trimmedLandmark = (landmark ?? "").trim().slice(0, 200);
    if (!trimmedAddress) {
      return { distanceKm: null, estimatedDurationMinutes: null, estimatedArrivalAt: null, estimatedFare: 0 };
    }

    const parsedLatitude = Number(latitude);
    const parsedLongitude = Number(longitude);
    const hasDropoffCoordinates = Number.isFinite(parsedLatitude) && Number.isFinite(parsedLongitude);

    // Prefer the actual selected delivery address for routing. A landmark is
    // only an additional geocoding hint and should never turn a valid address
    // into an invalid/ambiguous route request.
    const quote = await this.deliveryNetworkService.quoteJob({
      pickupAddress: "Empanada Hauz",
      pickupLatitude: DEFAULT_PICKUP_COORDINATES.latitude,
      pickupLongitude: DEFAULT_PICKUP_COORDINATES.longitude,
      dropoffAddress: trimmedAddress,
      ...(hasDropoffCoordinates
        ? {
            dropoffLatitude: parsedLatitude,
            dropoffLongitude: parsedLongitude
          }
        : {})
    });

    // If the address itself could not be geocoded, retry once with the
    // landmark appended. This keeps the landmark useful without making it the
    // primary route destination.
    if (quote.estimatedFare === 0 && trimmedLandmark) {
      return this.deliveryNetworkService.quoteJob({
        pickupAddress: "Empanada Hauz",
        pickupLatitude: DEFAULT_PICKUP_COORDINATES.latitude,
        pickupLongitude: DEFAULT_PICKUP_COORDINATES.longitude,
        dropoffAddress: `${trimmedLandmark}, ${trimmedAddress}`,
        ...(hasDropoffCoordinates
          ? {
              dropoffLatitude: parsedLatitude,
              dropoffLongitude: parsedLongitude
            }
          : {})
      });
    }

    return quote;
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
