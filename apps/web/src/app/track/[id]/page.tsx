import { notFound } from "next/navigation";
import { CheckCircle2, Clock3, ExternalLink, MapPin, PackageCheck, ReceiptText, Truck, UserRound } from "lucide-react";
import { API_URL } from "@/lib/config";
import { cn } from "@/lib/utils";
import { TrackingRiderMap } from "@/components/tracking-rider-map";

type TrackingDeliveryJob = {
  id: string;
  status: string;
  riderId?: string | null;
  pickupAddress: string;
  pickupLatitude?: number | null;
  pickupLongitude?: number | null;
  dropoffAddress: string;
  dropoffLatitude?: number | null;
  dropoffLongitude?: number | null;
  estimatedDurationMinutes?: number | null;
  estimatedArrivalAt?: string | null;
  updatedAt?: string | null;
  rider?: {
    name?: string | null;
    phoneNumber?: string | null;
    plateNumber?: string | null;
    vehicleType?: string | null;
    location?: {
      latitude: number;
      longitude: number;
      heading?: number | null;
      speed?: number | null;
      createdAt: string;
    } | null;
  } | null;
};

type TrackingOrder = {
  id: string;
  orderNumber: string;
  status: string;
  quantity: number;
  totalAmount: number;
  deliveryFee?: number | null;
  deliveryMethod: "pickup" | "maxim" | "own_delivery";
  paymentMethod: "cod" | "gcash";
  location?: string | null;
  address?: string | null;
  preferredSchedule?: string | null;
  items?: unknown;
  notes?: string | null;
  updatedAt?: string | null;
  customer?: {
    name?: string | null;
    phoneNumber?: string | null;
  } | null;
  delivery?: {
    status?: string | null;
    areaGroup?: string | null;
    scheduledAt?: string | null;
    eta?: string | null;
    trackingLink?: string | null;
    riderName?: string | null;
    riderPlate?: string | null;
    bookingNotes?: string | null;
    copyPayload?: string | null;
    updatedAt?: string | null;
  } | null;
  deliveryJob?: TrackingDeliveryJob | null;
  orderNotes?: Array<{
    id: string;
    body: string;
    createdAt?: string | null;
  }>;
};

type OrderLineItem = {
  name: string;
  quantity: number;
  price?: number;
  subtotal?: number;
};

const statusSteps = [
  { key: "queued", label: "Queued", description: "Your order is in the production queue." },
  { key: "preparing", label: "Preparing", description: "The kitchen is preparing your empanadas." },
  { key: "frying", label: "Frying", description: "Your order is being cooked." },
  { key: "packed", label: "Packed", description: "Your order is packed and almost ready." },
  { key: "ready", label: "Ready", description: "Your order is ready for pickup or booking." },
  { key: "completed", label: "Completed", description: "This order has been completed." }
];

const statusRank: Record<string, number> = {
  inquiry: 0,
  awaiting_confirmation: 0,
  confirmed: 0,
  queued: 1,
  preparing: 2,
  frying: 3,
  packed: 4,
  ready_for_pickup: 5,
  ready_for_booking: 5,
  booked: 5,
  completed: 6,
  cancelled: -1
};

const scheduleFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit"
});

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function TrackOrderPage({ params }: PageProps) {
  const { id } = await params;
  const order = await getTrackingOrder(id);
  if (!order) {
    notFound();
  }

  const lineItems = normalizeOrderItems(order.items);
  const note = getPublicNote(order);
  const progress = statusRank[order.status] ?? 0;
  const isCancelled = order.status === "cancelled";
  const showsMaximTracking = isMaximTrackingOrder(order);
  const showsOwnDeliveryTracking = order.deliveryMethod === "own_delivery" || Boolean(order.deliveryJob);

  return (
    <main className="min-h-screen bg-background px-4 py-6 text-foreground sm:px-6 lg:px-8">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-5">
        <header className="flex items-center justify-between gap-4 border-b border-line/80 pb-5">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src="/empanada hauz logo.jpg"
              alt="Empanada Hauz"
              className="h-12 w-12 shrink-0 rounded-lg border border-line/70 object-cover"
            />
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.2em] text-foreground/42">Order Tracking</p>
              <h1 className="truncate text-xl font-semibold sm:text-2xl">{order.customer?.name ?? "Empanada Hauz order"}</h1>
            </div>
          </div>
          <div className="rounded-lg border border-line/75 bg-panel px-3 py-2 text-right">
            <p className="text-[10px] uppercase tracking-[0.16em] text-foreground/35">Order No.</p>
            <p className="mt-1 text-sm font-semibold">{order.orderNumber}</p>
          </div>
        </header>

        <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
          <div className="rounded-lg border border-line/80 bg-panel p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.18em] text-foreground/35">Current Status</p>
                <h2 className="mt-2 text-2xl font-semibold capitalize">{order.status.replaceAll("_", " ")}</h2>
                <p className="mt-2 text-sm text-foreground/55">Updated {formatDate(order.updatedAt)}</p>
              </div>
              <span className={cn("inline-flex w-fit rounded-md px-3 py-1.5 text-sm font-semibold capitalize", isCancelled ? "bg-danger/15 text-danger" : "bg-accent/15 text-accent")}>
                {showsMaximTracking ? "maxim" : order.deliveryMethod}
              </span>
            </div>

            {isCancelled ? (
              <div className="mt-5 rounded-lg border border-danger/35 bg-danger/10 px-4 py-3 text-sm text-danger">
                This order was cancelled. Please contact Empanada Hauz if this looks incorrect.
              </div>
            ) : (
              <div className="mt-6 grid gap-3">
                {statusSteps.map((step, index) => {
                  const complete = progress >= index + 1;
                  const active = progress === index + 1;
                  return (
                    <div key={step.key} className="grid grid-cols-[32px_minmax(0,1fr)] gap-3">
                      <div className={cn("flex h-8 w-8 items-center justify-center rounded-full border", complete ? "border-accent bg-accent text-white" : "border-line bg-black/10 text-foreground/35")}>
                        {complete ? <CheckCircle2 size={16} /> : <span className="h-2 w-2 rounded-full bg-current" />}
                      </div>
                      <div className={cn("rounded-lg border px-3.5 py-3", active ? "border-accent/45 bg-accent/[0.08]" : "border-line/70 bg-black/[0.05]")}>
                        <p className="text-sm font-semibold">{step.label}</p>
                        <p className="mt-1 text-sm text-foreground/52">{step.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <aside className="grid gap-4">
            <InfoPanel icon={Clock3} label="Schedule" value={order.preferredSchedule ? formatDate(order.preferredSchedule) : "Not scheduled yet"} />
            <InfoPanel icon={MapPin} label={showsMaximTracking ? "Delivery Address" : "Pickup / Area"} value={order.address ?? order.location ?? "No address provided"} />
            <InfoPanel icon={ReceiptText} label="Total to Pay" value={`Php ${formatPeso(order.totalAmount)}`} />
          </aside>
        </section>

        {showsOwnDeliveryTracking && !isCancelled ? (
          <TrackingRiderMap orderId={order.id} initialJob={order.deliveryJob ?? null} />
        ) : null}

        <section className="grid gap-4 lg:grid-cols-2">
          <div className="rounded-lg border border-line/80 bg-panel p-4 sm:p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-foreground/35">Items Ordered</p>
            <div className="mt-4 space-y-2">
              {lineItems.length > 0 ? (
                lineItems.map((item) => (
                  <div key={`${item.name}-${item.quantity}`} className="flex items-start justify-between gap-3 rounded-lg border border-line/70 bg-black/[0.06] px-3.5 py-3">
                    <div className="min-w-0">
                      <p className="font-semibold">{item.name}</p>
                      <p className="mt-1 text-sm text-foreground/50">{item.quantity} pcs{item.price !== undefined ? ` x Php ${formatPeso(item.price)}` : ""}</p>
                    </div>
                    {item.subtotal !== undefined ? <p className="shrink-0 font-semibold">Php {formatPeso(item.subtotal)}</p> : null}
                  </div>
                ))
              ) : (
                <div className="rounded-lg border border-line/70 bg-black/[0.06] px-3.5 py-3">
                  <p className="font-semibold">Empanada</p>
                  <p className="mt-1 text-sm text-foreground/50">{order.quantity} pcs</p>
                </div>
              )}
            </div>
            {Number(order.deliveryFee ?? 0) > 0 ? (
              <div className="mt-4 flex items-center justify-between border-t border-line/70 pt-3 text-sm text-foreground/58">
                <span>Delivery fee</span>
                <span>Php {formatPeso(Number(order.deliveryFee ?? 0))}</span>
              </div>
            ) : null}
          </div>

          <div className="rounded-lg border border-line/80 bg-panel p-4 sm:p-5">
            <p className="text-xs uppercase tracking-[0.18em] text-foreground/35">Order Note</p>
            {note ? (
              <p className="mt-4 whitespace-pre-wrap rounded-lg border border-line/70 bg-black/[0.06] px-3.5 py-3 text-sm leading-6 text-foreground/75">{note}</p>
            ) : (
              <p className="mt-4 rounded-lg border border-dashed border-line/70 px-3.5 py-3 text-sm text-foreground/45">No note added.</p>
            )}
          </div>
        </section>

        {showsMaximTracking ? <MaximTrackingPanel order={order} /> : null}
      </div>
    </main>
  );
}

async function getTrackingOrder(id: string) {
  const response = await fetch(`${API_URL}/orders/track/${id}`, { cache: "no-store" });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(await response.text());
  return response.json() as Promise<TrackingOrder>;
}

function InfoPanel({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: string }) {
  return <div className="rounded-lg border border-line/80 bg-panel p-4"><div className="flex items-start gap-3"><Icon size={18} className="mt-0.5 shrink-0 text-accent" /><div className="min-w-0"><p className="text-xs uppercase tracking-[0.16em] text-foreground/35">{label}</p><p className="mt-2 text-sm font-semibold leading-6">{value}</p></div></div></div>;
}

function MaximTrackingPanel({ order }: { order: TrackingOrder }) {
  const steps = [
    { label: "Preparing for Booking", complete: ["ready_for_booking", "booked", "completed"].includes(order.status), description: "Your order is being prepared for Maxim booking." },
    { label: "Maxim Rider Booked", complete: order.status === "booked" || order.status === "completed" || order.delivery?.status === "booked", description: "A Maxim booking has been arranged by the store." },
    { label: "Delivered", complete: order.status === "completed" || order.delivery?.status === "completed", description: "The order has been marked completed." }
  ];

  return (
    <section className="rounded-lg border border-line/80 bg-panel p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><p className="text-xs uppercase tracking-[0.18em] text-foreground/35">Maxim Tracking</p><h2 className="mt-2 flex items-center gap-2 text-xl font-semibold"><Truck size={20} className="text-accent" />Delivery Status</h2></div><span className="w-fit rounded-md bg-accent/15 px-3 py-1.5 text-sm font-semibold capitalize text-accent">{order.delivery?.status ?? (order.status === "booked" ? "booked" : "pending")}</span></div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">{steps.map((step) => <div key={step.label} className={cn("rounded-lg border px-4 py-4", step.complete ? "border-accent/45 bg-accent/[0.08]" : "border-line/70 bg-black/[0.05]")}><div className={cn("flex h-9 w-9 items-center justify-center rounded-full", step.complete ? "bg-accent text-white" : "bg-black/15 text-foreground/38")}>{step.complete ? <CheckCircle2 size={18} /> : <PackageCheck size={18} />}</div><p className="mt-3 font-semibold">{step.label}</p><p className="mt-1 text-sm leading-6 text-foreground/52">{step.description}</p></div>)}</div>
      <div className="mt-5 grid gap-3 md:grid-cols-2"><InfoPanel icon={MapPin} label="Drop-off" value={order.address ?? order.location ?? "No address provided"} /><InfoPanel icon={Clock3} label="Booking Time" value={order.delivery?.scheduledAt ? formatDate(order.delivery.scheduledAt) : "Not booked yet"} /><InfoPanel icon={Clock3} label="ETA" value={order.delivery?.eta ? formatDate(order.delivery.eta) : "No ETA yet"} /><InfoPanel icon={UserRound} label="Rider" value={formatRider(order)} /></div>
      {order.delivery?.trackingLink ? <div className="mt-5 overflow-hidden rounded-lg border border-line/80 bg-black/[0.06]"><div className="flex flex-col gap-3 border-b border-line/75 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs uppercase tracking-[0.18em] text-foreground/35">Live Maxim Tracking</p><a href={order.delivery.trackingLink} target="_blank" rel="noreferrer" className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-accent/45 bg-accent/12 px-3 py-2 text-sm font-semibold text-accent transition hover:bg-accent/18 sm:w-auto"><ExternalLink size={16} />Open Maxim Tracking</a></div><iframe title="Maxim tracking" src={order.delivery.trackingLink} className="h-[620px] w-full border-0 bg-white" referrerPolicy="no-referrer-when-downgrade" /></div> : null}
      {order.delivery?.bookingNotes ? <div className="mt-4 rounded-lg border border-line/70 bg-black/[0.06] px-3.5 py-3"><p className="text-xs uppercase tracking-[0.16em] text-foreground/35">Booking Notes</p><p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-foreground/72">{order.delivery.bookingNotes}</p></div> : null}
    </section>
  );
}

function isMaximTrackingOrder(order: TrackingOrder) {
  return order.deliveryMethod === "maxim" || Boolean(order.delivery) || order.status === "ready_for_booking" || order.status === "booked";
}
function formatRider(order: TrackingOrder) { return [order.delivery?.riderName, order.delivery?.riderPlate].filter(Boolean).join(" - ") || "No rider details yet"; }
function normalizeOrderItems(value: unknown): OrderLineItem[] {
  if (!Array.isArray(value)) return [];
  return value.map((item): OrderLineItem | null => { if (!item || typeof item !== "object") return null; const candidate = item as Record<string, unknown>; const name = typeof candidate.name === "string" ? candidate.name : ""; const quantity = Number(candidate.quantity ?? 0); if (!name || quantity < 1) return null; const price = candidate.price !== undefined ? Number(candidate.price) : undefined; const subtotal = candidate.subtotal !== undefined ? Number(candidate.subtotal) : undefined; return { name, quantity, ...(price !== undefined && !Number.isNaN(price) ? { price } : {}), ...(subtotal !== undefined && !Number.isNaN(subtotal) ? { subtotal } : {}) }; }).filter((item): item is OrderLineItem => Boolean(item));
}
function getPublicNote(order: TrackingOrder) {
  const noteBodies = [order.notes, ...(order.orderNotes ?? []).map((note) => note.body)].filter((body): body is string => Boolean(body)).map(stripItemsBlock).map((body) => body.trim()).filter(Boolean);
  return Array.from(new Set(noteBodies)).join("\n\n");
}
function stripItemsBlock(value: string) {
  const lines = value.split(/\r?\n/); const result: string[] = []; let index = 0;
  while (index < lines.length) {
    if (lines[index].trim().toLowerCase() === "items:") { index += 1; while (index < lines.length && lines[index].trim().startsWith("- ")) index += 1; while (index < lines.length && lines[index].trim() === "") index += 1; continue; }
    result.push(lines[index]); index += 1;
  }
  return result.join("\n").trim();
}
function formatDate(value?: string | null) { return value ? scheduleFormatter.format(new Date(value)) : "Not available"; }
function formatPeso(value: number) { return Number.isInteger(value) ? String(value) : value.toFixed(2); }
