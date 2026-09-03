import {
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength
} from "class-validator";

export const DELIVERY_METHODS = ["pickup", "maxim", "own_delivery"] as const;
export const PAYMENT_METHODS = ["cod", "gcash"] as const;
export const ORDER_STATUSES = [
  "inquiry",
  "awaiting_confirmation",
  "confirmed",
  "queued",
  "preparing",
  "frying",
  "packed",
  "ready_for_pickup",
  "ready_for_booking",
  "booked",
  "completed",
  "cancelled"
] as const;

export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export type OrderLineItemDto = {
  name: string;
  quantity: number;
  price?: number;
  subtotal?: number;
};

export class CreateOrderDto {
  @IsString()
  customerId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsNumber()
  unitPrice!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deliveryFee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsIn(DELIVERY_METHODS)
  deliveryMethod!: DeliveryMethod;

  @IsOptional()
  @IsIn(PAYMENT_METHODS)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsDateString()
  preferredSchedule?: string;

  @IsOptional()
  @IsArray()
  items?: OrderLineItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  adLabel?: string;
}

export class UpdateOrderStatusDto {
  @IsIn(ORDER_STATUSES)
  status!: OrderStatus;
}

export class UpdateOrderDto {
  @IsOptional()
  @IsString()
  customerName?: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  quantity?: number;

  @IsOptional()
  @IsNumber()
  unitPrice?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deliveryFee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsOptional()
  @IsIn(DELIVERY_METHODS)
  deliveryMethod?: DeliveryMethod;

  @IsOptional()
  @IsIn(PAYMENT_METHODS)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsDateString()
  preferredSchedule?: string;

  @IsOptional()
  @IsArray()
  items?: OrderLineItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  adLabel?: string;
}

export class ManualOrderEntryDto {
  @IsString()
  customerName!: string;

  @IsOptional()
  @IsString()
  phoneNumber?: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsNumber()
  unitPrice!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deliveryFee?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  discountAmount?: number;

  @IsIn(DELIVERY_METHODS)
  deliveryMethod!: DeliveryMethod;

  @IsOptional()
  @IsIn(PAYMENT_METHODS)
  paymentMethod?: PaymentMethod;

  @IsOptional()
  @IsString()
  location?: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsDateString()
  preferredSchedule?: string;

  @IsOptional()
  @IsString()
  status?: OrderStatus;

  @IsOptional()
  @IsArray()
  items?: OrderLineItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  adLabel?: string;
}

export class PublicOrderEntryDto {
  @IsString()
  @MinLength(2)
  customerName!: string;

  @IsString()
  @MinLength(7)
  phoneNumber!: string;

  @IsString()
  @MinLength(2)
  address!: string;

  @IsString()
  @MinLength(2)
  landmark!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsNumber()
  unitPrice!: number;

  @IsIn(DELIVERY_METHODS)
  deliveryMethod!: DeliveryMethod;

  @IsIn(PAYMENT_METHODS)
  paymentMethod!: PaymentMethod;

  @IsOptional()
  @IsNumber()
  latitude?: number;

  @IsOptional()
  @IsNumber()
  longitude?: number;

  @IsOptional()
  @IsDateString()
  preferredSchedule?: string;

  @IsOptional()
  @IsArray()
  items?: OrderLineItemDto[];

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  referralCode?: string;

  @IsOptional()
  @IsString()
  adLabel?: string;
}

export class AddOrderNoteDto {
  @IsString()
  body!: string;
}

export class ExportOrdersToDriveDto {
  @IsArray()
  @IsString({ each: true })
  orderIds!: string[];
}
