import { UserRole } from "@prisma/client";

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: [
    "admin.only", "dashboard.view", "customers.view", "customers.manage", "orders.view", "orders.manage",
    "inbox.view", "inbox.manage", "expenses.view", "expenses.manage", "inventory.view", "inventory.manage",
    "kitchen.view", "kitchen.manage", "batches.view", "batches.manage", "deliveries.view", "deliveries.manage",
    "delivery-network.view", "delivery-network.manage", "riders.view", "riders.manage", "fraud.view", "fraud.manage", "analytics.view",
    "referrals.view", "referrals.manage", "chat.view", "chat.manage", "notifications.view", "settings.view",
    "users.manage", "roles.manage", "ai-instructions.manage", "products.view", "products.manage"
  ],
  operations: [
    "dashboard.view", "customers.view", "customers.manage", "orders.view", "orders.manage",
    "inbox.view", "inbox.manage", "expenses.view", "expenses.manage", "inventory.view",
    "deliveries.view", "deliveries.manage", "analytics.view", "referrals.view", "referrals.manage",
    "chat.view", "chat.manage", "notifications.view", "settings.view", "products.view", "fraud.view"
  ],
  kitchen: [
    "dashboard.view", "orders.view", "kitchen.view", "kitchen.manage", "inventory.view",
    "batches.view", "batches.manage", "chat.view", "chat.manage", "notifications.view"
  ],
  dispatcher: [
    "dashboard.view", "orders.view", "deliveries.view", "deliveries.manage", "delivery-network.view",
    "delivery-network.manage", "riders.view", "riders.manage", "fraud.view", "fraud.manage", "chat.view", "chat.manage", "notifications.view"
  ],
  rider: ["dashboard.view", "deliveries.view", "deliveries.manage", "chat.view", "chat.manage", "notifications.view"]
};

export const PERMISSION_LABELS: Record<string, string> = {
  "admin.only": "Admin-only fallback access", "dashboard.view": "View dashboard", "customers.view": "View customers", "customers.manage": "Manage customers",
  "orders.view": "View orders", "orders.manage": "Manage orders", "inbox.view": "View inbox", "inbox.manage": "Send/manage inbox messages",
  "expenses.view": "View expenses", "expenses.manage": "Manage expenses", "inventory.view": "View inventory", "inventory.manage": "Manage inventory",
  "kitchen.view": "View kitchen", "kitchen.manage": "Manage kitchen", "batches.view": "View batches", "batches.manage": "Manage batches",
  "deliveries.view": "View deliveries", "deliveries.manage": "Manage deliveries", "delivery-network.view": "View delivery network", "delivery-network.manage": "Manage delivery network",
  "riders.view": "View riders", "riders.manage": "Manage riders", "fraud.view": "View fraud detection", "fraud.manage": "Manage fraud cases",
  "analytics.view": "View analytics", "referrals.view": "View referrals", "referrals.manage": "Manage referrals",
  "chat.view": "View staff chat", "chat.manage": "Send staff chat messages", "notifications.view": "View notifications", "settings.view": "View settings",
  "users.manage": "Manage users", "roles.manage": "Manage roles and permissions", "ai-instructions.manage": "Manage AI instructions",
  "products.view": "View products", "products.manage": "Manage products"
};

export function hasPermission(role: UserRole, permission: string): boolean { return ROLE_PERMISSIONS[role]?.includes(permission) ?? false; }

export function permissionForRequest(method: string, path: string): string | null {
  const normalizedPath = path.split("?")[0].replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
  const upperMethod = method.toUpperCase();
  const view = upperMethod === "GET" || upperMethod === "HEAD";
  const manage = ["POST", "PUT", "PATCH", "DELETE"].includes(upperMethod);
  if (normalizedPath.startsWith("/admin/products")) return view ? "products.view" : manage ? "products.manage" : "admin.only";
  if (normalizedPath.startsWith("/customers")) return view ? "customers.view" : manage ? "customers.manage" : "admin.only";
  if (normalizedPath.startsWith("/orders")) return view ? "orders.view" : manage ? "orders.manage" : "admin.only";
  if (normalizedPath.startsWith("/chat")) return view ? "chat.view" : manage ? "chat.manage" : "admin.only";
  if (normalizedPath.startsWith("/expenses")) return view ? "expenses.view" : manage ? "expenses.manage" : "admin.only";
  if (normalizedPath.startsWith("/inventory")) return view ? "inventory.view" : manage ? "inventory.manage" : "admin.only";
  if (normalizedPath.startsWith("/kitchen")) return view ? "kitchen.view" : manage ? "kitchen.manage" : "admin.only";
  if (normalizedPath.startsWith("/batches")) return view ? "batches.view" : manage ? "batches.manage" : "admin.only";
  if (normalizedPath.startsWith("/deliveries")) return view ? "deliveries.view" : manage ? "deliveries.manage" : "admin.only";
  if (normalizedPath.startsWith("/delivery-network")) return view ? "delivery-network.view" : manage ? "delivery-network.manage" : "admin.only";
  if (normalizedPath.startsWith("/rider")) return view ? "riders.view" : manage ? "riders.manage" : "admin.only";
  if (normalizedPath.startsWith("/fraud")) return view ? "fraud.view" : manage ? "fraud.manage" : "admin.only";
  if (normalizedPath.startsWith("/analytics")) return "analytics.view";
  if (normalizedPath.startsWith("/referrals")) return view ? "referrals.view" : manage ? "referrals.manage" : "admin.only";
  if (normalizedPath.startsWith("/notifications")) return "notifications.view";
  if (normalizedPath.startsWith("/ai-instructions")) return "ai-instructions.manage";
  return "admin.only";
}
