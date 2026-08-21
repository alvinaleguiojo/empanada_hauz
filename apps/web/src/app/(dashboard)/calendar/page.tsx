import { OrdersCalendar } from "@/components/orders/orders-calendar";
import { apiFetch } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function CalendarPage() {
  const orders = await apiFetch<any[]>("/orders?upcoming=true").catch(() => []);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-foreground/45">A Google Calendar-style schedule for every upcoming order.</p>
        <h1 className="text-2xl font-semibold sm:text-3xl">Order Calendar</h1>
      </div>
      <OrdersCalendar orders={orders} />
    </div>
  );
}
