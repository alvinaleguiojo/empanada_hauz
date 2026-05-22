import { createSign } from "crypto";
import { BadRequestException, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

type OrderForExport = {
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
  createdAt: Date | string;
  customer?: {
    name?: string | null;
    phoneNumber?: string | null;
  } | null;
  orderNotes?: Array<{
    body: string;
  }>;
};

type DriveUploadResponse = {
  id: string;
  name: string;
  webViewLink?: string;
};

@Injectable()
export class GoogleDriveOrderExportService {
  private accessToken?: { value: string; expiresAt: number };

  constructor(private readonly config: ConfigService) {}

  async uploadOrders(orders: OrderForExport[]) {
    if (!orders.length) {
      throw new BadRequestException("No orders selected for export");
    }

    const folderId = this.config.get<string>("GOOGLE_DRIVE_EXPORT_FOLDER_ID");
    if (!folderId || !this.isConfigured()) {
      throw new BadRequestException("Google Drive export is not configured");
    }

    const fileName = `orders-${this.formatFileStamp(new Date())}.xlsx`;
    const workbook = this.createWorkbook(orders);
    const token = await this.getAccessToken();
    const boundary = `empanada_${Date.now()}`;
    const metadata = {
      name: fileName,
      parents: [folderId],
      mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    };
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
          `--${boundary}\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`
      ),
      workbook,
      Buffer.from(`\r\n--${boundary}--\r\n`)
    ]);
    const response = await this.googleFetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink", {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": `multipart/related; boundary=${boundary}`,
        "content-length": String(body.length)
      },
      body
    });

    if (!response.ok) {
      const message = await response.text();
      if (response.status === 404) {
        throw new BadRequestException(
          `Google Drive folder was not found or is not shared with the service account. Share folder ${folderId} with ${this.config.getOrThrow<string>("GOOGLE_SERVICE_ACCOUNT_EMAIL")} as Editor. Google response: ${message}`
        );
      }
      if (response.status === 403 && message.includes("Service Accounts do not have storage quota")) {
        throw new BadRequestException(
          "Google Drive upload cannot use a service account with a normal My Drive folder because service accounts do not have storage quota. Use a Google Workspace shared drive folder, or switch this integration to user OAuth so files are uploaded under your Google account."
        );
      }
      throw new BadRequestException(`Google Drive upload failed: ${message}`);
    }

    return (await response.json()) as DriveUploadResponse;
  }

  private isConfigured() {
    return this.isOAuthConfigured() || this.isServiceAccountConfigured();
  }

  private async getAccessToken() {
    if (this.isOAuthConfigured()) {
      return this.getOAuthAccessToken();
    }
    return this.getServiceAccountAccessToken();
  }

  private isOAuthConfigured() {
    return Boolean(
      this.config.get<string>("GOOGLE_OAUTH_CLIENT_ID") &&
        this.config.get<string>("GOOGLE_OAUTH_CLIENT_SECRET") &&
        this.config.get<string>("GOOGLE_OAUTH_REFRESH_TOKEN")
    );
  }

  private isServiceAccountConfigured() {
    return Boolean(
      this.config.get<string>("GOOGLE_SERVICE_ACCOUNT_EMAIL") &&
        this.config.get<string>("GOOGLE_PRIVATE_KEY")
    );
  }

  private async getOAuthAccessToken() {
    const response = await this.googleFetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: this.config.getOrThrow<string>("GOOGLE_OAUTH_CLIENT_ID"),
        client_secret: this.config.getOrThrow<string>("GOOGLE_OAUTH_CLIENT_SECRET"),
        refresh_token: this.config.getOrThrow<string>("GOOGLE_OAUTH_REFRESH_TOKEN"),
        grant_type: "refresh_token"
      })
    });

    if (!response.ok) {
      throw new BadRequestException(`Google OAuth refresh failed: ${await response.text()}`);
    }

    const body = (await response.json()) as { access_token: string };
    return body.access_token;
  }

  private async getServiceAccountAccessToken() {
    const now = Math.floor(Date.now() / 1000);
    if (this.accessToken && this.accessToken.expiresAt - 60 > now) {
      return this.accessToken.value;
    }

    const response = await this.googleFetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion: this.createJwtAssertion(now)
      })
    });

    if (!response.ok) {
      throw new BadRequestException(`Google auth failed: ${await response.text()}`);
    }

    const body = (await response.json()) as { access_token: string; expires_in: number };
    this.accessToken = {
      value: body.access_token,
      expiresAt: now + body.expires_in
    };
    return body.access_token;
  }

  private async googleFetch(url: string, options: RequestInit) {
    try {
      return await fetch(url, options);
    } catch (error) {
      throw new BadRequestException(
        `Unable to connect to Google APIs. Check the internet connection, firewall, VPN, or retry in a moment. ${this.formatFetchError(error)}`
      );
    }
  }

  private createJwtAssertion(now: number) {
    const email = this.config.getOrThrow<string>("GOOGLE_SERVICE_ACCOUNT_EMAIL");
    const privateKey = this.config.getOrThrow<string>("GOOGLE_PRIVATE_KEY").replace(/\\n/g, "\n");
    const header = this.base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = this.base64Url(
      JSON.stringify({
        iss: email,
        scope: "https://www.googleapis.com/auth/drive.file",
        aud: "https://oauth2.googleapis.com/token",
        exp: now + 3600,
        iat: now
      })
    );
    const unsignedToken = `${header}.${payload}`;
    const signature = createSign("RSA-SHA256").update(unsignedToken).sign(privateKey);
    return `${unsignedToken}.${this.base64Url(signature)}`;
  }

  private createWorkbook(orders: OrderForExport[]) {
    const headers = [
      "Created At",
      "Order Number",
      "Customer Name",
      "Phone Number",
      "Quantity",
      "Unit Price",
      "Delivery Fee",
      "Total Amount",
      "Delivery Method",
      "Payment Method",
      "Location",
      "Address",
      "Preferred Schedule",
      "Status",
      "Notes",
      "Order ID"
    ];
    const rows = orders.map((order) => [
      this.formatDate(order.createdAt),
      order.orderNumber,
      order.customer?.name ?? "",
      order.customer?.phoneNumber ?? "",
      order.quantity,
      this.formatValue(order.unitPrice),
      this.formatValue(order.deliveryFee),
      this.formatValue(order.totalAmount),
      order.deliveryMethod,
      order.paymentMethod === "gcash" ? "GCash" : "COD",
      order.location ?? "",
      order.address ?? "",
      this.formatDate(order.preferredSchedule),
      order.status,
      this.getNotes(order),
      order.id
    ]);
    return this.createXlsx("Orders", [headers, ...rows]);
  }

  private createXlsx(sheetName: string, rows: Array<Array<unknown>>) {
    const files = new Map<string, string>([
      [
        "[Content_Types].xml",
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`
      ],
      [
        "_rels/.rels",
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`
      ],
      [
        "xl/workbook.xml",
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="${this.escapeXml(sheetName)}" sheetId="1" r:id="rId1"/></sheets></workbook>`
      ],
      [
        "xl/_rels/workbook.xml.rels",
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`
      ],
      [
        "xl/styles.xml",
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="1"><fill><patternFill patternType="none"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/></cellXfs></styleSheet>`
      ],
      ["xl/worksheets/sheet1.xml", this.createWorksheetXml(rows)]
    ]);

    return this.createZip(files);
  }

  private createWorksheetXml(rows: Array<Array<unknown>>) {
    const body = rows
      .map((row, rowIndex) => {
        const rowNumber = rowIndex + 1;
        const cells = row
          .map((value, columnIndex) => {
            const reference = `${this.columnName(columnIndex)}${rowNumber}`;
            return `<c r="${reference}" t="inlineStr"><is><t>${this.escapeXml(String(value ?? ""))}</t></is></c>`;
          })
          .join("");
        return `<row r="${rowNumber}">${cells}</row>`;
      })
      .join("");

    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${body}</sheetData></worksheet>`;
  }

  private createZip(files: Map<string, string>) {
    const localParts: Buffer[] = [];
    const centralParts: Buffer[] = [];
    let offset = 0;

    for (const [name, content] of files) {
      const nameBytes = Buffer.from(name);
      const contentBytes = Buffer.from(content);
      const crc = this.crc32(contentBytes);
      const localHeader = this.createZipHeader(0x04034b50, nameBytes, contentBytes, crc, offset);
      const centralHeader = this.createZipHeader(0x02014b50, nameBytes, contentBytes, crc, offset);
      localParts.push(localHeader, contentBytes);
      centralParts.push(centralHeader);
      offset += localHeader.length + contentBytes.length;
    }

    const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(files.size, 8);
    end.writeUInt16LE(files.size, 10);
    end.writeUInt32LE(centralSize, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...localParts, ...centralParts, end]);
  }

  private createZipHeader(signature: number, nameBytes: Buffer, contentBytes: Buffer, crc: number, localOffset: number) {
    const isCentral = signature === 0x02014b50;
    const header = Buffer.alloc(isCentral ? 46 + nameBytes.length : 30 + nameBytes.length);
    header.writeUInt32LE(signature, 0);
    if (isCentral) {
      header.writeUInt16LE(20, 4);
      header.writeUInt16LE(20, 6);
      header.writeUInt32LE(crc, 16);
      header.writeUInt32LE(contentBytes.length, 20);
      header.writeUInt32LE(contentBytes.length, 24);
      header.writeUInt16LE(nameBytes.length, 28);
      header.writeUInt32LE(localOffset, 42);
      nameBytes.copy(header, 46);
    } else {
      header.writeUInt16LE(20, 4);
      header.writeUInt32LE(crc, 14);
      header.writeUInt32LE(contentBytes.length, 18);
      header.writeUInt32LE(contentBytes.length, 22);
      header.writeUInt16LE(nameBytes.length, 26);
      nameBytes.copy(header, 30);
    }
    return header;
  }

  private crc32(bytes: Buffer) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
      crc ^= byte;
      for (let bit = 0; bit < 8; bit += 1) {
        crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
      }
    }
    return (crc ^ 0xffffffff) >>> 0;
  }

  private columnName(index: number) {
    let name = "";
    let value = index + 1;
    while (value > 0) {
      const remainder = (value - 1) % 26;
      name = String.fromCharCode(65 + remainder) + name;
      value = Math.floor((value - 1) / 26);
    }
    return name;
  }

  private formatDate(value?: Date | string | null) {
    return value ? new Date(value).toISOString() : "";
  }

  private formatValue(value: unknown) {
    return value === null || value === undefined ? "" : String(value);
  }

  private formatFileStamp(value: Date) {
    return value.toISOString().replace(/[:.]/g, "-").slice(0, 19);
  }

  private getNotes(order: OrderForExport) {
    if (order.orderNotes?.length) {
      return order.orderNotes.map((note) => note.body).join("\n\n");
    }
    return order.notes ?? "";
  }

  private escapeXml(value: string) {
    return value
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&apos;");
  }

  private base64Url(value: string | Buffer) {
    return Buffer.from(value).toString("base64url");
  }

  private formatFetchError(error: unknown) {
    if (error instanceof Error) {
      const cause = error.cause instanceof Error ? ` Cause: ${error.cause.message}` : "";
      return `${error.message}.${cause}`;
    }
    return String(error);
  }
}
