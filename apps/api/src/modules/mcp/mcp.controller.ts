import { All, Controller, ForbiddenException, Req, Res } from "@nestjs/common";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Request, Response } from "express";
import { z } from "zod";
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

  private toOptionalString(value: unknown) {
    return typeof value === "string" && value.trim() ? value : undefined;
  }
}
