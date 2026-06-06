import { All, Controller, ForbiddenException, Req, Res } from "@nestjs/common";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Request, Response } from "express";
import { z } from "zod";
import { DeliveryMethod, OrderStatus, PaymentMethod } from "../orders/dto";
import { McpOrdersService } from "./mcp-orders.service";

type ToolResult = {
  isError?: boolean;
  content: { type: "text"; text: string }[];
};

type ToolRegistrar = (
  name: string,
  config: {
    title: string;
    description: string;
    inputSchema: Record<string, z.ZodTypeAny>;
    annotations: {
      readOnlyHint: boolean;
      destructiveHint?: boolean;
      idempotentHint?: boolean;
      openWorldHint: boolean;
    };
  },
  callback: (args: Record<string, unknown>) => Promise<ToolResult>
) => void;

@Controller("mcp")
export class McpController {
  constructor(private readonly orders: McpOrdersService) {}

  @All()
  async handle(@Req() req: Request, @Res() res: Response) {
    this.assertAuthorized(req);

    const server = this.createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined
    });

    res.on("close", () => {
      void server.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  }

  private createServer() {
    const server = new McpServer({
      name: "empanada-hauz-orders",
      version: "1.0.0"
    });
    const registerTool = server.registerTool.bind(server) as ToolRegistrar;

    registerTool(
      "list_orders",
      {
        title: "List orders",
        description:
          "Read Empanada Hauz orders with customer, batch, delivery, and note details. Use nextCursor to fetch all pages.",
        inputSchema: {
          cursor: z.string().optional(),
          limit: z.number().int().min(1).max(500).optional(),
          status: z.string().optional(),
          customerName: z.string().optional(),
          fromDate: z.string().datetime().optional(),
          toDate: z.string().datetime().optional()
        },
        annotations: {
          readOnlyHint: true,
          openWorldHint: false
        }
      },
      async (args) => ({
        content: [{ type: "text", text: JSON.stringify(await this.orders.listOrders(this.toListOrdersArgs(args)), null, 2) }]
      })
    );

    registerTool(
      "get_order",
      {
        title: "Get order",
        description: "Read one Empanada Hauz order by database ID or order number.",
        inputSchema: {
          id: z.string().optional(),
          orderNumber: z.string().optional()
        },
        annotations: {
          readOnlyHint: true,
          openWorldHint: false
        }
      },
      async (args) => {
        const id = this.toOptionalString(args.id);
        const orderNumber = this.toOptionalString(args.orderNumber);

        if (!id && !orderNumber) {
          return {
            isError: true,
            content: [{ type: "text", text: "Provide either id or orderNumber." }]
          };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(await this.orders.getOrder({ id, orderNumber }), null, 2) }]
        };
      }
    );

    registerTool(
      "create_order",
      {
        title: "Create order",
        description:
          "Create a new Empanada Hauz manual order. Defaults to unitPrice 18, deliveryMethod pickup, paymentMethod cod, and deliveryFee 0 when omitted.",
        inputSchema: {
          customerName: z.string().min(1),
          phoneNumber: z.string().optional(),
          quantity: z.number().int().min(1),
          unitPrice: z.number().min(0).optional(),
          deliveryFee: z.number().min(0).optional(),
          deliveryMethod: z.enum(["pickup", "maxim", "own_delivery"]).optional(),
          paymentMethod: z.enum(["cod", "gcash"]).optional(),
          location: z.string().optional(),
          address: z.string().optional(),
          preferredSchedule: z.string().datetime().optional(),
          status: z
            .enum([
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
            ])
            .optional(),
          items: z
            .array(
              z.object({
                name: z.string(),
                quantity: z.number(),
                price: z.number().optional(),
                subtotal: z.number().optional()
              })
            )
            .optional(),
          notes: z.string().optional()
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false
        }
      },
      async (args) => {
        const createArgs = this.toCreateOrderArgs(args);
        if (!createArgs.customerName || !createArgs.quantity) {
          return {
            isError: true,
            content: [{ type: "text", text: "customerName and quantity are required." }]
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await this.orders.createOrder({
                  ...createArgs,
                  customerName: createArgs.customerName,
                  quantity: createArgs.quantity
                }),
                null,
                2
              )
            }
          ]
        };
      }
    );

    registerTool(
      "summarize_orders",
      {
        title: "Summarize orders",
        description: "Read aggregate order totals by status, delivery method, and payment method.",
        inputSchema: {
          fromDate: z.string().datetime().optional(),
          toDate: z.string().datetime().optional()
        },
        annotations: {
          readOnlyHint: true,
          openWorldHint: false
        }
      },
      async (args) => ({
        content: [{ type: "text", text: JSON.stringify(await this.orders.summarizeOrders(this.toDateRangeArgs(args)), null, 2) }]
      })
    );

    return server;
  }

  private assertAuthorized(req: Request) {
    const token = process.env.MCP_BEARER_TOKEN;
    if (!token) {
      return;
    }

    const authorization = req.header("authorization");
    if (authorization !== `Bearer ${token}`) {
      throw new ForbiddenException("Invalid MCP bearer token");
    }
  }

  private toListOrdersArgs(args: Record<string, unknown>) {
    return {
      cursor: this.toOptionalString(args.cursor),
      limit: typeof args.limit === "number" ? args.limit : undefined,
      status: this.toOptionalString(args.status),
      customerName: this.toOptionalString(args.customerName),
      ...this.toDateRangeArgs(args)
    };
  }

  private toDateRangeArgs(args: Record<string, unknown>) {
    return {
      fromDate: this.toOptionalString(args.fromDate),
      toDate: this.toOptionalString(args.toDate)
    };
  }

  private toCreateOrderArgs(args: Record<string, unknown>) {
    return {
      customerName: this.toOptionalString(args.customerName),
      phoneNumber: this.toOptionalString(args.phoneNumber),
      quantity: typeof args.quantity === "number" ? args.quantity : undefined,
      unitPrice: typeof args.unitPrice === "number" ? args.unitPrice : undefined,
      deliveryFee: typeof args.deliveryFee === "number" ? args.deliveryFee : undefined,
      deliveryMethod: this.toDeliveryMethod(args.deliveryMethod),
      paymentMethod: this.toPaymentMethod(args.paymentMethod),
      location: this.toOptionalString(args.location),
      address: this.toOptionalString(args.address),
      preferredSchedule: this.toOptionalString(args.preferredSchedule),
      status: this.toOrderStatus(args.status),
      items: Array.isArray(args.items) ? args.items : undefined,
      notes: this.toOptionalString(args.notes)
    };
  }

  private toOptionalString(value: unknown) {
    return typeof value === "string" && value.trim() ? value : undefined;
  }

  private toDeliveryMethod(value: unknown): DeliveryMethod | undefined {
    return value === "pickup" || value === "maxim" || value === "own_delivery" ? value : undefined;
  }

  private toPaymentMethod(value: unknown): PaymentMethod | undefined {
    return value === "cod" || value === "gcash" ? value : undefined;
  }

  private toOrderStatus(value: unknown): OrderStatus | undefined {
    return value === "inquiry" ||
      value === "awaiting_confirmation" ||
      value === "confirmed" ||
      value === "queued" ||
      value === "preparing" ||
      value === "frying" ||
      value === "packed" ||
      value === "ready_for_pickup" ||
      value === "ready_for_booking" ||
      value === "booked" ||
      value === "completed" ||
      value === "cancelled"
      ? value
      : undefined;
  }
}
