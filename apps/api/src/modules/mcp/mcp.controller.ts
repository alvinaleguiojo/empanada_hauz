import { All, Controller, Logger, Req, Res, UseInterceptors } from "@nestjs/common";
import { NoCacheInterceptor } from "./no-cache.interceptor";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Request, Response } from "express";
import { z } from "zod";
import { DeliveryMethod, OrderStatus, PaymentMethod } from "../orders/dto";
import { MessengerService } from "../messenger/messenger.service";
import { McpExpensesService } from "./mcp-expenses.service";
import { McpAuthService } from "./mcp-auth.service";
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
    securitySchemes: { type: "oauth2"; scopes: string[] }[];
    annotations: {
      readOnlyHint: boolean;
      destructiveHint?: boolean;
      idempotentHint?: boolean;
      openWorldHint: boolean;
    };
  },
  callback: (args: Record<string, unknown>) => Promise<ToolResult>
) => void;

@UseInterceptors(NoCacheInterceptor)
@Controller("mcp")
export class McpController {
  private readonly logger = new Logger(McpController.name);

  constructor(
    private readonly orders: McpOrdersService,
    private readonly expenses: McpExpensesService,
    private readonly messenger: MessengerService,
    private readonly mcpAuth: McpAuthService
  ) {}

  @All()
  async handle(@Req() req: Request, @Res() res: Response) {
    res.setHeader("Cache-Control", "no-store");

    const server = this.createServer(req);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      // ChatGPT/remote MCP verification may send JSON-RPC POSTs without an
      // Accept header or with a narrow Accept value. JSON responses are enough
      // for our stateless endpoint, so allow application/json negotiation.
      enableJsonResponse: true
    });

    res.on("close", () => {
      void server.close();
    });

    try {
      const mcpBody = this.normalizeMcpRequest(req);

      // Some remote MCP clients/proxies omit Accept or send a narrow value
      // during JSON-RPC verification. Normalize POST negotiation before the
      // SDK validates it. This is limited to the MCP endpoint.
      if (req.method === "POST") {
        const accept = (req.headers.accept ?? "").toString().toLowerCase();
        if (!accept.includes("application/json") && !accept.includes("text/event-stream") && !accept.includes("*/*")) {
          req.headers.accept = "application/json";
        } else if (!accept.includes("application/json") && accept.includes("text/event-stream")) {
          req.headers.accept = "application/json, text/event-stream";
        }
      }

      // Some remote MCP clients/proxies send JSON-RPC as application/octet-stream.
      // Decode it before passing the request to the transport.
      if (this.isOctetStreamRequest(req)) {
        req.headers["content-type"] = "application/json";
      }

      await server.connect(transport);
      await transport.handleRequest(req, res, mcpBody);
    } catch (error) {
      this.logger.error(`MCP transport failed: ${this.errorMessage(error)}`);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: { code: -32603, message: "MCP transport failed" },
          id: null
        });
      }
    }
  }

  private createServer(req: Request) {
    const server = new McpServer({
      name: "empanada-hauz-orders",
      version: "1.0.0"
    });
    const registerMcpTool = server.registerTool.bind(server) as any;
    const registerTool = ((name: string, config: Parameters<ToolRegistrar>[1], callback: Parameters<ToolRegistrar>[2]) => {
      registerMcpTool(name, config, async (args: Record<string, unknown>) => {
        try {
          await this.mcpAuth.authenticateAuthorizationHeader(req.header("authorization"), req);
          this.logger.log(`MCP tool auth accepted: ${name}`);
          return callback(args);
        } catch (error) {
          const reason = error instanceof Error ? error.message : String(error);
          this.logger.warn(`MCP tool auth rejected: ${name}: ${reason}`);
          const baseUrl = this.baseUrl(req);
          return {
            isError: true,
            content: [{ type: "text", text: "Authentication required: please sign in to use this MCP tool." }],
            _meta: {
              "mcp/www_authenticate": [
                `Bearer resource_metadata="${baseUrl}/.well-known/oauth-protected-resource", error="invalid_token", error_description="Authentication required"`
              ]
            }
          };
        }
      });
    }) as ToolRegistrar;

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
        securitySchemes: [{ type: "oauth2", scopes: ["mcp"] }],
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
        securitySchemes: [{ type: "oauth2", scopes: ["mcp"] }],
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
          "Create a new Empanada Hauz manual order. Known menu item prices and subtotals are computed by the server. Defaults to Pork Regular unit price, deliveryMethod pickup, paymentMethod cod, and deliveryFee 0 when omitted.",
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
        securitySchemes: [{ type: "oauth2", scopes: ["mcp"] }],
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
      "edit_order",
      {
        title: "Edit order",
        description:
          "Edit an existing Empanada Hauz order by database ID or order number. Only provided fields are changed.",
        inputSchema: {
          id: z.string().optional(),
          orderNumber: z.string().optional(),
          customerName: z.string().optional(),
          phoneNumber: z.string().optional(),
          quantity: z.number().int().min(1).optional(),
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
        securitySchemes: [{ type: "oauth2", scopes: ["mcp"] }],
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false
        }
      },
      async (args) => {
        const updateArgs = this.toUpdateOrderArgs(args);
        if (!updateArgs.id && !updateArgs.orderNumber) {
          return {
            isError: true,
            content: [{ type: "text", text: "Provide either id or orderNumber." }]
          };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(await this.orders.updateOrder(updateArgs), null, 2) }]
        };
      }
    );

    registerTool(
      "delete_order",
      {
        title: "Delete order",
        description: "Delete an Empanada Hauz order by database ID or order number.",
        inputSchema: {
          id: z.string().optional(),
          orderNumber: z.string().optional()
        },
        securitySchemes: [{ type: "oauth2", scopes: ["mcp"] }],
        annotations: {
          readOnlyHint: false,
          destructiveHint: true,
          idempotentHint: false,
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
          content: [{ type: "text", text: JSON.stringify(await this.orders.deleteOrder({ id, orderNumber }), null, 2) }]
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
        securitySchemes: [{ type: "oauth2", scopes: ["mcp"] }],
        annotations: {
          readOnlyHint: true,
          openWorldHint: false
        }
      },
      async (args) => ({
        content: [{ type: "text", text: JSON.stringify(await this.orders.summarizeOrders(this.toDateRangeArgs(args)), null, 2) }]
      })
    );

    registerTool(
      "list_expenses",
      {
        title: "List expenses",
        description:
          "Read Empanada Hauz expenses for a Manila-date range. Dates use YYYY-MM-DD. Defaults to today's expenses when no dates are provided. Use nextCursor to fetch all pages.",
        inputSchema: {
          cursor: z.string().optional(),
          limit: z.number().int().min(1).max(500).optional(),
          category: z.string().optional(),
          startDate: z.string().optional(),
          endDate: z.string().optional()
        },
        securitySchemes: [{ type: "oauth2", scopes: ["mcp"] }],
        annotations: {
          readOnlyHint: true,
          openWorldHint: false
        }
      },
      async (args) => ({
        content: [
          {
            type: "text",
            text: JSON.stringify(await this.expenses.listExpenses(this.toListExpensesArgs(args)), null, 2)
          }
        ]
      })
    );

    registerTool(
      "get_expense",
      {
        title: "Get expense",
        description: "Read one Empanada Hauz expense by database ID.",
        inputSchema: {
          id: z.string().min(1)
        },
        securitySchemes: [{ type: "oauth2", scopes: ["mcp"] }],
        annotations: {
          readOnlyHint: true,
          openWorldHint: false
        }
      },
      async (args) => {
        const id = this.toOptionalString(args.id);
        if (!id) {
          return {
            isError: true,
            content: [{ type: "text", text: "id is required." }]
          };
        }

        return {
          content: [{ type: "text", text: JSON.stringify(await this.expenses.getExpense({ id }), null, 2) }]
        };
      }
    );

    registerTool(
      "create_expense",
      {
        title: "Create expense",
        description: "Create a new Empanada Hauz expense. expenseDate uses YYYY-MM-DD in Manila time.",
        inputSchema: {
          category: z.string().min(1),
          name: z.string().min(1),
          amount: z.number().min(0.01),
          expenseDate: z.string().min(1)
        },
        securitySchemes: [{ type: "oauth2", scopes: ["mcp"] }],
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: false
        }
      },
      async (args) => {
        const createArgs = this.toCreateExpenseArgs(args);
        if (!createArgs.category || !createArgs.name || createArgs.amount === undefined || !createArgs.expenseDate) {
          return {
            isError: true,
            content: [{ type: "text", text: "category, name, amount, and expenseDate are required." }]
          };
        }

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                await this.expenses.createExpense({
                  category: createArgs.category,
                  name: createArgs.name,
                  amount: createArgs.amount,
                  expenseDate: createArgs.expenseDate
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
      "list_messenger_conversations",
      {
        title: "List Messenger conversations",
        description: "Read the latest Empanada Hauz Facebook Messenger conversations, including customer details and the latest message.",
        inputSchema: {},
        securitySchemes: [{ type: "oauth2", scopes: ["mcp"] }],
        annotations: { readOnlyHint: true, openWorldHint: false }
      },
      async () => ({
        content: [{ type: "text", text: JSON.stringify(await this.messenger.listConversations(), null, 2) }]
      })
    );

    registerTool(
      "get_messenger_messages",
      {
        title: "Get Messenger messages",
        description: "Read all stored messages for one Empanada Hauz Messenger conversation in chronological order.",
        inputSchema: { conversationId: z.string().min(1) },
        securitySchemes: [{ type: "oauth2", scopes: ["mcp"] }],
        annotations: { readOnlyHint: true, openWorldHint: false }
      },
      async (args) => {
        const conversationId = this.toOptionalString(args.conversationId);
        if (!conversationId) return this.mcpError("conversationId is required.");
        return {
          content: [{ type: "text", text: JSON.stringify(await this.messenger.getConversationMessages(conversationId), null, 2) }]
        };
      }
    );

    registerTool(
      "get_messenger_profile",
      {
        title: "Get Messenger profile",
        description: "Read the public Messenger profile name available for a customer PSID through Meta Graph API.",
        inputSchema: { psid: z.string().min(1) },
        securitySchemes: [{ type: "oauth2", scopes: ["mcp"] }],
        annotations: { readOnlyHint: true, openWorldHint: true }
      },
      async (args) => {
        const psid = this.toOptionalString(args.psid);
        if (!psid) return this.mcpError("psid is required.");
        return {
          content: [{ type: "text", text: JSON.stringify({ psid, name: await this.messenger.getMessengerProfileName(psid) }, null, 2) }]
        };
      }
    );

    registerTool(
      "send_messenger_message",
      {
        title: "Send Messenger message",
        description: "Send a text message to a Facebook Messenger customer by PSID and persist the outbound message in Empanada Hauz.",
        inputSchema: { psid: z.string().min(1), text: z.string().min(1).max(2000) },
        securitySchemes: [{ type: "oauth2", scopes: ["mcp"] }],
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
      },
      async (args) => {
        const psid = this.toOptionalString(args.psid);
        const text = this.toOptionalString(args.text);
        if (!psid || !text) return this.mcpError("psid and text are required.");
        return {
          content: [{ type: "text", text: JSON.stringify(await this.messenger.sendText(psid, text), null, 2) }]
        };
      }
    );

    registerTool(
      "sync_messenger",
      {
        title: "Sync Messenger",
        description: "Synchronize Messenger conversations and message history from the configured Facebook Page into Empanada Hauz.",
        inputSchema: {
          maxConversations: z.number().int().min(1).max(500).optional(),
          maxMessagesPerConversation: z.number().int().min(1).max(5000).optional()
        },
        securitySchemes: [{ type: "oauth2", scopes: ["mcp"] }],
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true }
      },
      async (args) => ({
        content: [{
          type: "text",
          text: JSON.stringify(await this.messenger.syncFromMeta({
            maxConversations: this.toOptionalNumber(args.maxConversations),
            maxMessagesPerConversation: this.toOptionalNumber(args.maxMessagesPerConversation)
          }), null, 2)
        }]
      })
    );

    registerTool(
      "request_messenger_thread_control",
      {
        title: "Request Messenger thread control",
        description: "Request control of a Messenger conversation from another app or Page inbox integration using Meta thread handover.",
        inputSchema: { psid: z.string().min(1), metadata: z.string().max(1000).optional() },
        securitySchemes: [{ type: "oauth2", scopes: ["mcp"] }],
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
      },
      async (args) => {
        const psid = this.toOptionalString(args.psid);
        if (!psid) return this.mcpError("psid is required.");
        const result = await this.messenger.requestThreadControl(psid, this.toOptionalString(args.metadata));
        return {
          isError: !result,
          content: [{ type: "text", text: JSON.stringify({ success: result, psid }, null, 2) }]
        };
      }
    );

    return server;
  }

  private isOctetStreamRequest(req: Request) {
    return (req.headers["content-type"] ?? "")
      .toString()
      .toLowerCase()
      .split(";")[0]
      .trim() === "application/octet-stream";
  }

  private normalizeMcpRequest(req: Request) {
    if (!this.isOctetStreamRequest(req)) {
      return req.body;
    }

    const body = req.body;
    if (body && typeof body === "object" && !Buffer.isBuffer(body)) {
      return body;
    }

    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody;
    const payload = Buffer.isBuffer(body)
      ? body
      : Buffer.isBuffer(rawBody)
        ? rawBody
        : undefined;

    if (!payload || payload.length === 0) {
      return req.body;
    }

    try {
      return JSON.parse(payload.toString("utf8"));
    } catch {
      return req.body;
    }
  }

  private baseUrl(req: Request) {
    const proto = req.header("x-forwarded-proto")?.split(",")[0]?.trim() || req.protocol;
    const host = req.header("x-forwarded-host")?.split(",")[0]?.trim() || req.get("host");
    return `${proto}://${host}`;
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error);
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

  private toListExpensesArgs(args: Record<string, unknown>) {
    return {
      cursor: this.toOptionalString(args.cursor),
      limit: typeof args.limit === "number" ? args.limit : undefined,
      category: this.toOptionalString(args.category),
      startDate: this.toOptionalString(args.startDate),
      endDate: this.toOptionalString(args.endDate)
    };
  }

  private toCreateExpenseArgs(args: Record<string, unknown>) {
    return {
      category: this.toOptionalString(args.category),
      name: this.toOptionalString(args.name),
      amount: typeof args.amount === "number" ? args.amount : undefined,
      expenseDate: this.toOptionalString(args.expenseDate)
    };
  }

  private toUpdateOrderArgs(args: Record<string, unknown>) {
    return {
      id: this.toOptionalString(args.id),
      orderNumber: this.toOptionalString(args.orderNumber),
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

  private toOptionalNumber(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  }

  private mcpError(message: string): ToolResult {
    return {
      isError: true,
      content: [{ type: "text", text: message }]
    };
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
