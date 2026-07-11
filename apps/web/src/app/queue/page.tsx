import { Clock3, ExternalLink, ListOrdered, PackageCheck, RefreshCw } from "lucide-react";
import { API_URL } from "@/lib/config";

type QueueOrder = {
  queueNumber: number;
  id: string;
  orderNumber: string;
  status: string;
  quantity: number;
  deliveryMethod: string;
  preferredSchedule?: string | null;
  createdAt: string;
  updatedAt: string;
  trackingPath: string;
};

type QueueResponse = {
  date: string;
  orders: QueueOrder[];
};

const statusTone: Record<string, string> = {
  inquiry: "border-slate-500/30 bg-slate-500/10 text-slate-200",
  awaiting_confirmation: "border-amber-300/30 bg-amber-300/10 text-amber-100",
  confirmed: "border-sky-300/30 bg-sky-300/10 text-sky-100",
  queued: "border-orange-300/35 bg-orange-300/10 text-orange-100",
  preparing: "border-fuchsia-300/30 bg-fuchsia-300/10 text-fuchsia-100",
  frying: "border-rose-300/30 bg-rose-300/10 text-rose-100",
  packed: "border-cyan-300/30 bg-cyan-300/10 text-cyan-100",
  ready_for_pickup: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
  ready_for_booking: "border-emerald-300/30 bg-emerald-300/10 text-emerald-100",
  booked: "border-teal-300/30 bg-teal-300/10 text-teal-100"
};

const dateFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Manila",
  month: "long",
  day: "numeric",
  year: "numeric"
});

const timeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Manila",
  hour: "numeric",
  minute: "2-digit"
});

export const dynamic = "force-dynamic";

export default async function PublicQueuePage() {
  const data = await getQueue();
  const activeCount = data.orders.length;
  const totalPieces = data.orders.reduce((sum, order) => sum + Number(order.quantity ?? 0), 0);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(255,166,77,0.2),_transparent_34%),linear-gradient(135deg,_#050816,_#101827_58%,_#0b2530)] px-4 py-6 text-white sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
        <header className="overflow-hidden rounded-[28px] border border-white/10 bg-white/10 shadow-2xl shadow-black/25 backdrop-blur-xl">
          <div className="grid gap-6 px-5 py-6 sm:px-7 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-end">
            <div>
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.28em] text-orange-200">
                <ListOrdered size={16} /> Empanada Hauz Queue
              </p>
              <h1 className="mt-4 text-3xl font-semibold tracking-tight sm:text-5xl">Live order queue</h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-200 sm:text-base">
                Follow active orders for {dateFormatter.format(new Date(`${data.date}T00:00:00+08:00`))}. Queue numbers update as orders are completed.
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Metric label="Active Orders" value={String(activeCount)} />
              <Metric label="Pieces Pending" value={String(totalPieces)} />
            </div>
          </div>
        </header>

        <section className="rounded-[28px] border border-white/10 bg-slate-950/35 p-3 shadow-2xl shadow-black/20 backdrop-blur-xl sm:p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3 px-2 py-2">
            <div>
              <p className="text-sm font-semibold text-white">Now serving</p>
              <p className="mt-1 text-xs text-slate-400">Public status board. Customer names and phone numbers are hidden.</p>
            </div>
            <a href="/queue" className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/10 px-3 py-2 text-sm font-semibold text-slate-100 transition hover:bg-white/15">
              <RefreshCw size={15} /> Refresh
            </a>
          </div>

          {data.orders.length > 0 ? (
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {data.orders.map((order) => (
                <article key={order.id} className="rounded-3xl border border-white/10 bg-white/[0.06] p-4 transition hover:border-orange-300/35 hover:bg-white/[0.08]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-orange-400 text-xl font-black text-slate-950">
                        {order.queueNumber}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{order.orderNumber}</p>
                        <p className="mt-1 text-xs text-slate-400">{order.quantity} pcs - {formatMethod(order.deliveryMethod)}</p>
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-semibold capitalize ${statusTone[order.status] ?? statusTone.queued}`}>
                      {order.status.replaceAll("_", " ")}
                    </span>
                  </div>

                  <div className="mt-4 grid gap-2 text-sm text-slate-300">
                    <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/30 px-3 py-2">
                      <Clock3 size={15} className="text-orange-200" />
                      <span>{formatSchedule(order.preferredSchedule ?? order.createdAt)}</span>
                    </div>
                  </div>

                  <a href={order.trackingPath} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-3 py-2.5 text-sm font-bold text-slate-950 transition hover:bg-orange-100">
                    Track order <ExternalLink size={15} />
                  </a>
                </article>
              ))}
            </div>
          ) : (
            <div className="flex min-h-[260px] flex-col items-center justify-center rounded-3xl border border-dashed border-white/12 px-6 py-10 text-center">
              <PackageCheck size={34} className="text-emerald-300" />
              <h2 className="mt-4 text-2xl font-semibold">No active queue right now</h2>
              <p className="mt-2 max-w-md text-sm leading-6 text-slate-300">New orders will appear here once they are confirmed and queued.</p>
              <a href="/customer" className="mt-5 rounded-2xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-orange-400">
                Place an order
              </a>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

async function getQueue() {
  const response = await fetch(`${API_URL}/orders/public/queue`, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(await response.text());
  }

  return response.json() as Promise<QueueResponse>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-white/10 bg-slate-950/35 px-4 py-4">
      <p className="text-xs uppercase tracking-[0.18em] text-slate-400">{label}</p>
      <p className="mt-2 text-3xl font-semibold">{value}</p>
    </div>
  );
}

function formatMethod(value: string) {
  return value === "maxim" ? "Delivery" : "Pickup";
}

function formatSchedule(value?: string | null) {
  if (!value) {
    return "No schedule yet";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "No schedule yet";
  }

  return timeFormatter.format(date);
}
