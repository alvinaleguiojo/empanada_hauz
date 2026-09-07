export type UserRole = "admin" | "operations" | "kitchen" | "dispatcher" | "rider";

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  admin: [
    "dashboard.view", "customers.view", "customers.manage", "orders.view", "orders.manage", "inbox.view", "inbox.manage",
    "expenses.view", "expenses.manage", "inventory.view", "inventory.manage", "kitchen.view", "kitchen.manage", "batches.view", "batches.manage",
    "deliveries.view", "deliveries.manage", "delivery-network.view", "delivery-network.manage", "riders.view", "riders.manage", "analytics.view",
    "referrals.view", "referrals.manage", "chat.view", "chat.manage", "notifications.view", "settings.view", "users.manage", "roles.manage",
    "ai-instructions.manage", "products.view", "products.manage"
  ],
  operations: [
    "dashboard.view", "customers.view", "customers.manage", "orders.view", "orders.manage", "inbox.view", "inbox.manage", "expenses.view", "expenses.manage",
    "inventory.view", "deliveries.view", "deliveries.manage", "analytics.view", "referrals.view", "referrals.manage", "chat.view", "chat.manage", "notifications.view", "settings.view", "products.view"
  ],
  kitchen: ["dashboard.view", "orders.view", "kitchen.view", "kitchen.manage", "inventory.view", "batches.view", "batches.manage", "chat.view", "chat.manage", "notifications.view"],
  dispatcher: ["dashboard.view", "orders.view", "deliveries.view", "deliveries.manage", "delivery-network.view", "delivery-network.manage", "riders.view", "riders.manage", "chat.view", "chat.manage", "notifications.view"],
  rider: ["dashboard.view", "deliveries.view", "deliveries.manage", "chat.view", "chat.manage", "notifications.view"]
};

export function decodeRole(token: string | null): UserRole | null {
  if (!token) return null;
  try {
    const part = token.split(".")[1]; if (!part) return null;
    const payload = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/"))) as { role?: string };
    return payload.role && payload.role in ROLE_PERMISSIONS ? payload.role as UserRole : null;
  } catch { return null; }
}

export function hasPermission(role: UserRole | null, permission: string): boolean { return role ? ROLE_PERMISSIONS[role]?.includes(permission) ?? false : false; }
