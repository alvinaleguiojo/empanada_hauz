import { createSign } from "crypto";
import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

type OrderForSheet = {
  id: string;
  orderNumber: string;
  quantity: number;
  unitPrice: unknown;
  totalAmount: unknown;
  deliveryFee: unknown;
  deliveryMethod: string;
  paymentMethod: string;
  location?: string | null;
  address?: string | null;
  preferredSchedule?: Date | string | null;
  status: string;
  notes?: string | null;
  adLabel?: string | null;
  createdAt: Date | string;
  customer?: {
    name?: string | null;
    phoneNumber?: string | null;
  } | null;
};

@Injectable()
export class GoogleSheetsOrderSyncService {
  private readonly logger = new Logger(GoogleSheetsOrderSyncService.name);
  private accessToken?: { value: string; expiresAt: number };

  constructor(private readonly config: ConfigService) {}

  async appendOrder(order: OrderForSheet) {
    if (!this.isConfigured()) {
      return;
    }

    try {
      const spreadsheetId = this.config.getOrThrow<string>("GOOGLE_SHEETS_SPREADSHEET_ID");
      const sheetName = this.config.get<string>("GOOGLE_SHEETS_ORDERS_SHEET_NAME") ?? "Orders";
      const token = await this.getAccessToken();
      const range = encodeURIComponent(`${sheetName}!A:Q`);
      const url = new URL(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}/values/${range}:append`);
      url.searchParams.set("valueInputOption", "USER_ENTERED");
      url.searchParams.set("insertDataOption", "INSERT_ROWS");

      const response = await fetch(url, {
        method: "POST",
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json"
        },
        body: JSON.stringify({
          values: [this.toRow(order)]
        })
      });

      if (!response.ok) {
        throw new Error(await response.text());
      }
    } catch (error) {
      this.logger.warn(`Unable to append order ${order.orderNumber} to Google Sheets: ${this.formatError(error)}`);
    }
  }

  private isConfigured() {
    return Boolean(
      this.config.get<string>("GOOGLE_SHEETS_SPREADSHEET_ID") &&
        this.config.get<string>("GOOGLE_SERVICE_ACCOUNT_EMAIL") &&
        this.config.get<string>("GOOGLE_PRIVATE_KEY")
    );
  }

  private async getAccessToken() {
    const now = Math.floor(Date.now() / 1000);
    if (this.accessToken && this.accessToken.expiresAt - 60 > now) {
      return this.accessToken.value;
    }

    const assertion = this.createJwtAssertion(now);
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion
      })
    });

    if (!response.ok) {
      throw new Error(await response.text());
    }

    const body = (await response.json()) as { access_token: string; expires_in: number };
    this.accessToken = {
      value: body.access_token,
      expiresAt: now + body.expires_in
    };
    return body.access_token;
  }

  private createJwtAssertion(now: number) {
    const email = this.config.getOrThrow<string>("GOOGLE_SERVICE_ACCOUNT_EMAIL");
    const privateKey = this.config.getOrThrow<string>("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n");
    const header = this.base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = this.base64Url(
      JSON.stringify({
        iss: email,
        scope: "https://www.googleapis.com/auth/spreadsheets",
        aud: "https://oauth2.googleapis.com/token",
        exp: now + 3600,
        iat: now
      })
    );
    const unsignedToken = `${header}.${payload}`;
    const signature = createSign("RSA-SHA256").update(unsignedToken).sign(privateKey);
    return `${unsignedToken}.${this.base64Url(signature)}`;
  }

  private toRow(order: OrderForSheet) {
    return [
      this.formatDate(order.createdAt),
      order.orderNumber,
      order.customer?.name ?? "",
      order.customer?.phoneNumber ?? "",
      order.quantity,
      this.formatValue(order.unitPrice),
      this.formatValue(order.deliveryFee),
      this.formatValue(order.totalAmount),
      order.deliveryMethod,
      order.paymentMethod,
      order.location ?? "",
      order.address ?? "",
      this.formatDate(order.preferredSchedule),
      order.status,
      order.notes ?? "",
      order.id,
      order.adLabel ?? ""
    ];
  }

  private formatDate(value?: Date | string | null) {
    return value ? new Date(value).toISOString() : "";
  }

  private formatValue(value: unknown) {
    return value === null || value === undefined ? "" : String(value);
  }

  private base64Url(value: string | Buffer) {
    return Buffer.from(value).toString("base64url");
  }

  private formatError(error: unknown) {
    return error instanceof Error ? error.message : String(error);
  }
}
