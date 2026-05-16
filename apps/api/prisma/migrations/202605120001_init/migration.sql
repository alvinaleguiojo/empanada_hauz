CREATE TYPE "UserRole" AS ENUM ('admin', 'operations', 'kitchen', 'dispatcher');
CREATE TYPE "DeliveryMethod" AS ENUM ('pickup', 'maxim');
CREATE TYPE "OrderStatus" AS ENUM ('inquiry', 'awaiting_confirmation', 'confirmed', 'queued', 'preparing', 'frying', 'packed', 'ready_for_pickup', 'ready_for_booking', 'booked', 'completed', 'cancelled');
CREATE TYPE "BatchName" AS ENUM ('morning', 'afternoon');
CREATE TYPE "MessageDirection" AS ENUM ('inbound', 'outbound');
CREATE TYPE "MessageType" AS ENUM ('text', 'quick_reply', 'button', 'attachment', 'system');
CREATE TYPE "ConversationStatus" AS ENUM ('open', 'waiting_customer', 'waiting_staff', 'resolved');
CREATE TYPE "InventoryItemType" AS ENUM ('flour', 'pork', 'butter', 'oil', 'raisins', 'cheese', 'gas');
CREATE TYPE "DeliveryStatus" AS ENUM ('pending', 'grouped', 'ready_for_booking', 'booked', 'completed', 'cancelled');

CREATE TABLE "User" (
  "id" TEXT PRIMARY KEY,
  "email" TEXT NOT NULL UNIQUE,
  "passwordHash" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "role" "UserRole" NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "Customer" (
  "id" TEXT PRIMARY KEY,
  "messengerPsid" TEXT UNIQUE,
  "phoneNumber" TEXT,
  "name" TEXT NOT NULL,
  "defaultAddress" TEXT,
  "notes" TEXT,
  "totalOrders" INTEGER NOT NULL DEFAULT 0,
  "repeatCustomerCount" INTEGER NOT NULL DEFAULT 0,
  "totalSpent" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "favoriteOrderQuantity" INTEGER,
  "preferredDeliveryMethod" "DeliveryMethod",
  "lastOrderDate" TIMESTAMP,
  "isVip" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "Conversation" (
  "id" TEXT PRIMARY KEY,
  "customerId" TEXT NOT NULL REFERENCES "Customer"("id"),
  "channel" TEXT NOT NULL DEFAULT 'messenger',
  "status" "ConversationStatus" NOT NULL DEFAULT 'open',
  "lastMessage" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "Message" (
  "id" TEXT PRIMARY KEY,
  "conversationId" TEXT NOT NULL REFERENCES "Conversation"("id"),
  "metaMessageId" TEXT,
  "direction" "MessageDirection" NOT NULL,
  "type" "MessageType" NOT NULL DEFAULT 'text',
  "content" TEXT NOT NULL,
  "rawPayload" JSONB,
  "aiIntent" TEXT,
  "aiConfidence" DOUBLE PRECISION,
  "extractedOrder" JSONB,
  "processedAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "Batch" (
  "id" TEXT PRIMARY KEY,
  "name" "BatchName" NOT NULL,
  "batchDate" TIMESTAMP NOT NULL,
  "maxCapacity" INTEGER NOT NULL,
  "currentCapacity" INTEGER NOT NULL DEFAULT 0,
  "remainingCapacity" INTEGER NOT NULL,
  "cutoffTime" TIMESTAMP NOT NULL,
  "estimatedCompletionTime" TIMESTAMP NOT NULL,
  "isClosed" BOOLEAN NOT NULL DEFAULT FALSE,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE ("name", "batchDate")
);

CREATE TABLE "Delivery" (
  "id" TEXT PRIMARY KEY,
  "areaGroup" TEXT,
  "status" "DeliveryStatus" NOT NULL DEFAULT 'pending',
  "scheduledAt" TIMESTAMP,
  "bookingNotes" TEXT,
  "copyPayload" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "Order" (
  "id" TEXT PRIMARY KEY,
  "customerId" TEXT NOT NULL REFERENCES "Customer"("id"),
  "batchId" TEXT REFERENCES "Batch"("id"),
  "deliveryId" TEXT REFERENCES "Delivery"("id"),
  "conversationId" TEXT,
  "orderNumber" TEXT NOT NULL UNIQUE,
  "quantity" INTEGER NOT NULL,
  "unitPrice" DECIMAL(10,2) NOT NULL,
  "totalAmount" DECIMAL(10,2) NOT NULL,
  "deliveryFee" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "location" TEXT,
  "address" TEXT,
  "deliveryMethod" "DeliveryMethod" NOT NULL,
  "preferredSchedule" TIMESTAMP,
  "status" "OrderStatus" NOT NULL DEFAULT 'inquiry',
  "notes" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "InventoryItem" (
  "id" TEXT PRIMARY KEY,
  "itemType" "InventoryItemType" NOT NULL UNIQUE,
  "displayName" TEXT NOT NULL,
  "unit" TEXT NOT NULL,
  "currentStock" DECIMAL(10,2) NOT NULL,
  "reorderLevel" DECIMAL(10,2) NOT NULL,
  "estimatedDaysLeft" INTEGER,
  "costPerUnit" DECIMAL(10,2) NOT NULL,
  "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "InventoryLog" (
  "id" TEXT PRIMARY KEY,
  "inventoryItemId" TEXT NOT NULL REFERENCES "InventoryItem"("id"),
  "changeAmount" DECIMAL(10,2) NOT NULL,
  "reason" TEXT NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "ProductionLog" (
  "id" TEXT PRIMARY KEY,
  "batchId" TEXT NOT NULL REFERENCES "Batch"("id"),
  "stage" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "notes" TEXT,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "Expense" (
  "id" TEXT PRIMARY KEY,
  "category" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "amount" DECIMAL(10,2) NOT NULL,
  "expenseDate" TIMESTAMP NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE TABLE "AnalyticsSnapshot" (
  "id" TEXT PRIMARY KEY,
  "snapshotDate" TIMESTAMP NOT NULL UNIQUE,
  "revenue" DECIMAL(12,2) NOT NULL,
  "pcsSold" INTEGER NOT NULL,
  "averageOrderSize" DOUBLE PRECISION NOT NULL,
  "repeatCustomerRate" DOUBLE PRECISION NOT NULL,
  "busiestHours" JSONB NOT NULL,
  "topLocations" JSONB NOT NULL,
  "cancelledOrders" INTEGER NOT NULL,
  "productionEfficiency" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX "Customer_name_idx" ON "Customer"("name");
CREATE INDEX "Customer_phoneNumber_idx" ON "Customer"("phoneNumber");
CREATE INDEX "Conversation_customerId_updatedAt_idx" ON "Conversation"("customerId", "updatedAt");
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");
CREATE INDEX "Message_metaMessageId_idx" ON "Message"("metaMessageId");
CREATE INDEX "Batch_batchDate_isClosed_idx" ON "Batch"("batchDate", "isClosed");
CREATE INDEX "Order_status_createdAt_idx" ON "Order"("status", "createdAt");
CREATE INDEX "Order_batchId_status_idx" ON "Order"("batchId", "status");
CREATE INDEX "Order_customerId_createdAt_idx" ON "Order"("customerId", "createdAt");
CREATE INDEX "Delivery_status_scheduledAt_idx" ON "Delivery"("status", "scheduledAt");
CREATE INDEX "Delivery_areaGroup_idx" ON "Delivery"("areaGroup");
CREATE INDEX "InventoryLog_inventoryItemId_createdAt_idx" ON "InventoryLog"("inventoryItemId", "createdAt");
CREATE INDEX "ProductionLog_batchId_createdAt_idx" ON "ProductionLog"("batchId", "createdAt");
CREATE INDEX "Expense_expenseDate_category_idx" ON "Expense"("expenseDate", "category");
