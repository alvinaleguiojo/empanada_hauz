const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { PrismaClient } = require("@prisma/client");

const SOURCE_URL = process.env.SOURCE_DATABASE_URL ?? "postgresql://postgres:postgres@host.docker.internal:5432/empanada_ops";

const prisma = new PrismaClient();
const idMaps = new Map();

const tables = [
  "User",
  "Customer",
  "Delivery",
  "Batch",
  "Conversation",
  "Message",
  "Order",
  "OrderNote",
  "InventoryItem",
  "InventoryLog",
  "ProductionLog",
  "Expense",
  "AnalyticsSnapshot"
];

function sourceRows(table) {
  const sql = `SELECT COALESCE(json_agg(row_to_json(t)), '[]'::json) FROM (SELECT * FROM public."${table}") t;`;
  const output = execFileSync("docker", ["exec", "empanada-postgres", "psql", SOURCE_URL, "-At", "-c", sql], {
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 20
  });
  return JSON.parse(output.trim() || "[]");
}

function newObjectId() {
  return crypto.randomBytes(12).toString("hex");
}

function mapId(table, oldId) {
  if (!oldId) {
    return oldId;
  }

  const key = `${table}:${oldId}`;
  if (!idMaps.has(key)) {
    idMaps.set(key, newObjectId());
  }
  return idMaps.get(key);
}

function date(value) {
  return value ? new Date(value) : value;
}

function money(value) {
  return value === null || value === undefined ? value : Number(value);
}

function omit(row, fields) {
  const next = { ...row };
  for (const field of fields) {
    delete next[field];
  }
  return next;
}

async function createMany(label, rows, createRow) {
  let count = 0;
  for (const row of rows) {
    await createRow(row);
    count += 1;
  }
  console.log(`${label}: ${count}`);
}

async function main() {
  const data = Object.fromEntries(tables.map((table) => [table, sourceRows(table)]));

  console.log("Source counts:");
  for (const table of tables) {
    console.log(`${table}: ${data[table].length}`);
  }

  await prisma.orderNote.deleteMany();
  await prisma.message.deleteMany();
  await prisma.order.deleteMany();
  await prisma.productionLog.deleteMany();
  await prisma.inventoryLog.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.delivery.deleteMany();
  await prisma.batch.deleteMany();
  await prisma.inventoryItem.deleteMany();
  await prisma.expense.deleteMany();
  await prisma.analyticsSnapshot.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();

  console.log("Target cleared.");

  await createMany("User", data.User, (row) =>
    prisma.user.create({
      data: {
        ...omit(row, ["id", "createdAt", "updatedAt"]),
        id: mapId("User", row.id),
        createdAt: date(row.createdAt),
        updatedAt: date(row.updatedAt)
      }
    })
  );

  await createMany("Customer", data.Customer, (row) =>
    prisma.customer.create({
      data: {
        ...omit(row, ["id", "createdAt", "updatedAt", "lastOrderDate", "totalSpent", "messengerPsid"]),
        id: mapId("Customer", row.id),
        ...(row.messengerPsid ? { messengerPsid: row.messengerPsid } : {}),
        totalSpent: money(row.totalSpent),
        lastOrderDate: date(row.lastOrderDate),
        createdAt: date(row.createdAt),
        updatedAt: date(row.updatedAt)
      }
    })
  );

  await createMany("Delivery", data.Delivery, (row) =>
    prisma.delivery.create({
      data: {
        ...omit(row, ["id", "createdAt", "updatedAt", "scheduledAt"]),
        id: mapId("Delivery", row.id),
        scheduledAt: date(row.scheduledAt),
        createdAt: date(row.createdAt),
        updatedAt: date(row.updatedAt)
      }
    })
  );

  await createMany("Batch", data.Batch, (row) =>
    prisma.batch.create({
      data: {
        ...omit(row, ["id", "batchDate", "cutoffTime", "estimatedCompletionTime", "createdAt", "updatedAt"]),
        id: mapId("Batch", row.id),
        batchDate: date(row.batchDate),
        cutoffTime: date(row.cutoffTime),
        estimatedCompletionTime: date(row.estimatedCompletionTime),
        createdAt: date(row.createdAt),
        updatedAt: date(row.updatedAt)
      }
    })
  );

  await createMany("InventoryItem", data.InventoryItem, (row) =>
    prisma.inventoryItem.create({
      data: {
        ...omit(row, ["id", "createdAt", "updatedAt", "currentStock", "reorderLevel", "costPerUnit"]),
        id: mapId("InventoryItem", row.id),
        currentStock: money(row.currentStock),
        reorderLevel: money(row.reorderLevel),
        costPerUnit: money(row.costPerUnit),
        createdAt: date(row.createdAt),
        updatedAt: date(row.updatedAt)
      }
    })
  );

  await createMany("Conversation", data.Conversation, (row) =>
    prisma.conversation.create({
      data: {
        ...omit(row, ["id", "customerId", "createdAt", "updatedAt"]),
        id: mapId("Conversation", row.id),
        customerId: mapId("Customer", row.customerId),
        createdAt: date(row.createdAt),
        updatedAt: date(row.updatedAt)
      }
    })
  );

  await createMany("Message", data.Message, (row) =>
    prisma.message.create({
      data: {
        ...omit(row, ["id", "conversationId", "createdAt", "processedAt"]),
        id: mapId("Message", row.id),
        conversationId: mapId("Conversation", row.conversationId),
        processedAt: date(row.processedAt),
        createdAt: date(row.createdAt)
      }
    })
  );

  await createMany("Order", data.Order, (row) =>
    prisma.order.create({
      data: {
        ...omit(row, [
          "id",
          "customerId",
          "batchId",
          "deliveryId",
          "createdAt",
          "updatedAt",
          "preferredSchedule",
          "scheduleReminderSentAt",
          "unitPrice",
          "totalAmount",
          "deliveryFee"
        ]),
        id: mapId("Order", row.id),
        customerId: mapId("Customer", row.customerId),
        batchId: row.batchId ? mapId("Batch", row.batchId) : null,
        deliveryId: row.deliveryId ? mapId("Delivery", row.deliveryId) : null,
        unitPrice: money(row.unitPrice),
        totalAmount: money(row.totalAmount),
        deliveryFee: money(row.deliveryFee),
        preferredSchedule: date(row.preferredSchedule),
        scheduleReminderSentAt: date(row.scheduleReminderSentAt),
        createdAt: date(row.createdAt),
        updatedAt: date(row.updatedAt)
      }
    })
  );

  await createMany("OrderNote", data.OrderNote, (row) =>
    prisma.orderNote.create({
      data: {
        ...omit(row, ["id", "orderId", "createdAt"]),
        id: mapId("OrderNote", row.id),
        orderId: mapId("Order", row.orderId),
        createdAt: date(row.createdAt)
      }
    })
  );

  await createMany("InventoryLog", data.InventoryLog, (row) =>
    prisma.inventoryLog.create({
      data: {
        ...omit(row, ["id", "inventoryItemId", "createdAt", "changeAmount"]),
        id: mapId("InventoryLog", row.id),
        inventoryItemId: mapId("InventoryItem", row.inventoryItemId),
        changeAmount: money(row.changeAmount),
        createdAt: date(row.createdAt)
      }
    })
  );

  await createMany("ProductionLog", data.ProductionLog, (row) =>
    prisma.productionLog.create({
      data: {
        ...omit(row, ["id", "batchId", "createdAt"]),
        id: mapId("ProductionLog", row.id),
        batchId: mapId("Batch", row.batchId),
        createdAt: date(row.createdAt)
      }
    })
  );

  await createMany("Expense", data.Expense, (row) =>
    prisma.expense.create({
      data: {
        ...omit(row, ["id", "expenseDate", "createdAt", "amount"]),
        id: mapId("Expense", row.id),
        amount: money(row.amount),
        expenseDate: date(row.expenseDate),
        createdAt: date(row.createdAt)
      }
    })
  );

  await createMany("AnalyticsSnapshot", data.AnalyticsSnapshot, (row) =>
    prisma.analyticsSnapshot.create({
      data: {
        ...omit(row, ["id", "snapshotDate", "createdAt", "revenue"]),
        id: mapId("AnalyticsSnapshot", row.id),
        revenue: money(row.revenue),
        snapshotDate: date(row.snapshotDate),
        createdAt: date(row.createdAt)
      }
    })
  );

  console.log("Migration complete.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
