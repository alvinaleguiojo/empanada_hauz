import { All, Controller, ForbiddenException, Req, Res, UseInterceptors } from "@nestjs/common";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { Request, Response } from "express";
import { z } from "zod";
import { MessengerService } from "../messenger/messenger.service";
import { NoCacheInterceptor } from "./no-cache.interceptor";

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

@UseInterceptors(NoCacheInterceptor)
@Controller("mcp/messenger")
export class MessengerMcpController {
  constructor(private readonly messenger: MessengerService) {}

  @All()
  async handle(@Req() req: Request, @Res() res: Response) {
    this.assertAuthorized(req);
    res.setHeader("Cache-Control", "no-store");

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
      name: "empanada-hauz-messenger",
      version: "1.0.0"
    });
    const registerTool = server.registerTool.bind(server) as ToolRegistrar;

    registerTool(
      "list_messenger_conversations",
      {
        title: "List Messenger conversations",
        description: "Read the latest Empanada Hauz Facebook Messenger conversations, including customer details and the latest message.",
        inputSchema: {},
        annotations: {
          readOnlyHint: true,
          openWorldHint: false
        }
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
        inputSchema: {
          conversationId: z.string().min(1)
        },
        annotations: {
          readOnlyHint: true,
          openWorldHint: false
        }
      },
      async (args) => {
        const conversationId = this.toRequiredString(args.conversationId);
        if (!conversationId) return this.error("conversationId is required.");
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
        inputSchema: {
          psid: z.string().min(1)
        },
        annotations: {
          readOnlyHint: true,
          openWorldHint: true
        }
      },
      async (args) => {
        const psid = this.toRequiredString(args.psid);
        if (!psid) return this.error("psid is required.");
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
        inputSchema: {
          psid: z.string().min(1),
          text: z.string().min(1).max(2000)
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true
        }
      },
      async (args) => {
        const psid = this.toRequiredString(args.psid);
        const text = this.toRequiredString(args.text);
        if (!psid || !text) return this.error("psid and text are required.");
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
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: true,
          openWorldHint: true
        }
      },
      async (args) => ({
        content: [
          {
            type: "text",
            text: JSON.stringify(
              await this.messenger.syncFromMeta({
                maxConversations: this.toOptionalNumber(args.maxConversations),
                maxMessagesPerConversation: this.toOptionalNumber(args.maxMessagesPerConversation)
              }),
              null,
              2
            )
          }
        ]
      })
    );

    registerTool(
      "request_messenger_thread_control",
      {
        title: "Request Messenger thread control",
        description: "Request control of a Messenger conversation from another app or Page inbox integration using Meta thread handover.",
        inputSchema: {
          psid: z.string().min(1),
          metadata: z.string().max(1000).optional()
        },
        annotations: {
          readOnlyHint: false,
          destructiveHint: false,
          idempotentHint: false,
          openWorldHint: true
        }
      },
      async (args) => {
        const psid = this.toRequiredString(args.psid);
        if (!psid) return this.error("psid is required.");
        const result = await this.messenger.requestThreadControl(psid, this.toOptionalString(args.metadata));
        return {
          isError: !result,
          content: [{ type: "text", text: JSON.stringify({ success: result, psid }, null, 2) }]
        };
      }
    );

    return server;
  }

  private assertAuthorized(req: Request) {
    const token = process.env.MCP_BEARER_TOKEN;
    if (!token) return;

    const authorization = req.header("authorization");
    if (authorization !== `Bearer ${token}`) {
      throw new ForbiddenException("Invalid MCP bearer token");
    }
  }

  private toRequiredString(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }

  private toOptionalString(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }

  private toOptionalNumber(value: unknown) {
    return typeof value === "number" && Number.isFinite(value) ? value : undefined;
  }

  private error(message: string): ToolResult {
    return {
      isError: true,
      content: [{ type: "text", text: message }]
    };
  }
}
