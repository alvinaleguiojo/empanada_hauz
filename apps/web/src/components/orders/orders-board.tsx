"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import {
  ArrowRight,
  Check,
  ChevronRight,
  Clock3,
  Copy,
  Link2,
  MapPin,
  Minus,
  Plus,
  Search,
  Trash2,
  UploadCloud,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { cn } from "@/lib/utils";

const columns = [
  "inquiry",
  "awaiting_confirmation",
  "confirmed",
  "queued",
  "preparing",
  "frying",
  "packed",
  "ready_for_pickup",
  "ready_for_booking",
  "booked",
  "completed",
  "cancelled",
] as const;

const statusOptions = [
  "inquiry",
  "awaiting_confirmation",
  "confirmed",
  "queued",
  "preparing",
  "frying",
  "packed",
  "ready_for_pickup",
  "ready_for_booking",
  "booked",
  "completed",
  "cancelled",
] as const;

const deliveryOptions = ["pickup", "maxim", "own_delivery"] as const;

const deliveryMethodLabels: Record<string, string> = {
  pickup: "Pickup",
  maxim: "Maxim",
  own_delivery: "Own Rider",
};

const deliverySelectOptions = deliveryOptions.map((option) => ({
  label: deliveryMethodLabels[option] ?? option,
  value: option,
}));

const paymentOptions = ["cod", "gcash"] as const;

const paymentSelectOptions = paymentOptions.map((option) => ({
  label: option === "cod" ? "COD" : "GCash",
  value: option,
}));

const statusSelectOptions = statusOptions.map((status) => ({
  label: status
    .replaceAll("_", " ")
    .replace(/\b\w/g, (char) => char.toUpperCase()),
  value: status,
}));

const statusFilterOptions = [
  { label: "All Statuses", value: "all" },
  ...statusSelectOptions,
];

type ProductCatalogItem = {
  name: string;
  price: number;
  available: boolean;
  sortOrder?: number;
};

type ProductOption = {
  label: string;
  value: string;
  price: number;
  available: boolean;
};

type OrderNoteView = {
  id: string;
  body: string;
  createdAt?: string | null;
};

type OrderLineItemView = {
  name: string;
  quantity: number;
  price?: number;
  subtotal?: number;
};

type EditableOrderLineItem = {
  productName: string;
  quantity: string;
  price: number;
};

type OrdersBoardProps = {
  orders: Array<any>;
  initialSelectedId?: string | null;
  initialDetailOpen?: boolean;
  openOrderId?: string | null;
  openInEdit?: boolean;
};

const statusTone: Record<string, string> = {
  inquiry: "bg-white/[0.08] text-foreground/75",
  awaiting_confirmation: "bg-amber-500/15 text-amber-200",
  confirmed: "bg-sky-500/15 text-sky-200",
  queued: "bg-violet-500/15 text-violet-200",
  preparing: "bg-fuchsia-500/15 text-fuchsia-200",
  frying: "bg-orange-500/15 text-orange-200",
  packed: "bg-cyan-500/15 text-cyan-200",
  ready_for_pickup: "bg-teal-500/15 text-teal-200",
  ready_for_booking: "bg-lime-500/15 text-lime-200",
  booked: "bg-emerald-500/15 text-emerald-200",
  completed: "bg-green-500/15 text-green-200",
  cancelled: "bg-rose-500/15 text-rose-200",
};

const statusDot: Record<string, string> = {
  inquiry: "bg-white/40",
  awaiting_confirmation: "bg-amber-400",
  confirmed: "bg-sky-400",
  queued: "bg-violet-400",
  preparing: "bg-fuchsia-400",
  frying: "bg-orange-400",
  packed: "bg-cyan-400",
  ready_for_pickup: "bg-teal-400",
  ready_for_booking: "bg-lime-400",
  booked: "bg-emerald-400",
  completed: "bg-green-400",
  cancelled: "bg-rose-400",
};

const deliveryBadgeTone: Record<string, string> = {
  pickup: "bg-white/[0.08] text-foreground/70",
  maxim: "bg-sky-500/18 text-sky-200",
  own_delivery: "bg-violet-500/18 text-violet-200",
};

const scheduleFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Manila",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const noteTimeFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Asia/Manila",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

export function OrdersBoard({
  orders,
  initialSelectedId = null,
  initialDetailOpen = false,
  openOrderId = null,
  openInEdit = false,
}: OrdersBoardProps) {
  const initialOrder =
    orders.find((order) => order.id === initialSelectedId) ??
    orders[0] ??
    null;

  const [items, setItems] = useState(orders);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialOrder?.id ?? null,
  );
  const [selectedStatus, setSelectedStatus] = useState<string>(
    initialOrder?.status ?? "queued",
  );
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState(getTodayDateInputValue);
  const [isDateChanging, setIsDateChanging] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [editMode, setEditMode] = useState(false);
  const [copiedDetails, setCopiedDetails] = useState(false);
  const [copiedTracking, setCopiedTracking] = useState(false);
  const [copiedNotes, setCopiedNotes] = useState(false);
  const [noteDraft, setNoteDraft] = useState("");
  const [detailOpen, setDetailOpen] = useState(initialDetailOpen);
  const [pending, startTransition] = useTransition();
  const [deletePending, startDeleteTransition] = useTransition();
  const [exportPending, startExportTransition] = useTransition();
  const [exportResult, setExportResult] = useState<{
    name: string;
    webViewLink?: string;
  } | null>(null);

  const lastSelectedOrderIdRef = useRef<string | null>(null);
  const lastExternalOpenIdRef = useRef<string | null>(null);
  const latestRefreshIdRef = useRef(0);
  const selectedDateRef = useRef(selectedDate);
  const searchRef = useRef(search);

  const [form, setForm] = useState({
    customerName: "",
    phoneNumber: "",
    deliveryFee: "0",
    discountAmount: "0",
    deliveryMethod: "pickup",
    paymentMethod: "cod",
    location: "",
    address: "",
    preferredSchedule: "",
    maximStatus: "booked",
    maximScheduledAt: "",
    maximEta: "",
    maximTrackingLink: "",
    maximRiderName: "",
    maximRiderPlate: "",
    maximBookingNotes: "",
    notes: "",
  });

  const [lineItems, setLineItems] = useState<EditableOrderLineItem[]>([]);
  const [catalogProducts, setCatalogProducts] = useState<
    ProductCatalogItem[]
  >([]);

  const productOptions = useMemo<ProductOption[]>(
    () =>
      catalogProducts
        .slice()
        .sort(
          (a, b) =>
            Number(a.sortOrder ?? 0) - Number(b.sortOrder ?? 0) ||
            a.name.localeCompare(b.name),
        )
        .map((product) => ({
          label: `${product.name} - Php ${Number(product.price)}${
            product.available ? "" : " — SOLD OUT"
          }`,
          value: product.name,
          price: Number(product.price),
          available: product.available !== false,
        })),
    [catalogProducts],
  );

  useEffect(() => {
    let active = true;

    void apiFetch<ProductCatalogItem[]>("/products")
      .then((result) => {
        if (active) {
          setCatalogProducts(Array.isArray(result) ? result : []);
        }
      })
      .catch(() => {
        if (active) {
          setCatalogProducts([]);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const refreshOrders = useCallback(
    async (
      dateValue = selectedDateRef.current,
      searchValue = searchRef.current,
    ) => {
      const refreshId = latestRefreshIdRef.current + 1;
      latestRefreshIdRef.current = refreshId;

      const normalizedSearch = searchValue.trim();
      const queryParams = new URLSearchParams();

      if (normalizedSearch) {
        queryParams.set("search", normalizedSearch);
      } else if (dateValue) {
        queryParams.set("date", dateValue);
      }

      const query = queryParams.toString()
        ? `?${queryParams.toString()}`
        : "";

      const refreshed = await apiFetch<any[]>(`/orders${query}`);

      if (
        refreshId !== latestRefreshIdRef.current ||
        dateValue !== selectedDateRef.current ||
        searchValue !== searchRef.current
      ) {
        return;
      }

      const nextItems = Array.isArray(refreshed) ? refreshed : [];

      setItems(nextItems);

      setSelectedId((current) =>
        !current
          ? (nextItems[0]?.id ?? null)
          : nextItems.some((order) => order.id === current)
            ? current
            : (nextItems[0]?.id ?? null),
      );
    },
    [],
  );

  useEffect(() => {
    selectedDateRef.current = selectedDate;
  }, [selectedDate]);

  useEffect(() => {
    searchRef.current = search;
  }, [search]);

  useEffect(() => {
    if (search.trim()) return;

    setItems(orders);

    setSelectedId((current) => current ?? orders[0]?.id ?? null);
  }, [orders, search]);

  useEffect(() => {
    let cancelled = false;
    const searchValue = search;

    setIsDateChanging(true);

    const timeout = window.setTimeout(
      () => {
        refreshOrders(selectedDate, searchValue)
          .catch((err) => {
            if (!cancelled) {
              setError(
                err instanceof Error
                  ? err.message
                  : "Unable to refresh orders",
              );
            }
          })
          .finally(() => {
            if (!cancelled) {
              setIsDateChanging(false);
            }
          });
      },
      searchValue.trim() ? 250 : 0,
    );

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [refreshOrders, search, selectedDate]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (!editMode) {
        refreshOrders(
          selectedDateRef.current,
          searchRef.current,
        ).catch((err) =>
          setError(
            err instanceof Error
              ? err.message
              : "Unable to refresh orders",
          ),
        );
      }
    }, 3000);

    return () => window.clearInterval(interval);
  }, [editMode, refreshOrders]);

  const filteredItems = useMemo(() => {
    const query = search.trim().toLowerCase();

    return items
      .filter((item) => {
        const matchesSearch =
          !query ||
          [
            item.customer?.name,
            item.customer?.phoneNumber,
            item.orderNumber,
            item.deliveryMethod,
            item.paymentMethod,
            item.status,
            item.location,
            item.address,
            item.notes,
            item.delivery?.areaGroup,
            item.delivery?.riderName,
            item.delivery?.riderPlate,
            ...(item.orderNotes ?? []).map(
              (note: any) => note.body,
            ),
          ]
            .filter(Boolean)
            .some((value) =>
              String(value)
                .toLowerCase()
                .includes(query),
            );

        return (
          matchesSearch &&
          (statusFilter === "all" ||
            item.status === statusFilter)
        );
      })
      .sort(compareOrdersBySchedule);
  }, [items, search, statusFilter]);

  const selectedOrder = useMemo(
    () =>
      filteredItems.find(
        (item) => item.id === selectedId,
      ) ??
      filteredItems[0] ??
      null,
    [filteredItems, selectedId],
  );

  useEffect(() => {
    if (selectedOrder?.id !== selectedId) {
      setSelectedId(selectedOrder?.id ?? null);
    }
  }, [selectedId, selectedOrder]);

  useEffect(() => {
    if (
      !openInEdit ||
      !openOrderId ||
      lastExternalOpenIdRef.current === openOrderId
    ) {
      return;
    }

    const target = items.find(
      (item) => item.id === openOrderId,
    );

    if (!target) return;

    lastExternalOpenIdRef.current = openOrderId;

    setSelectedId(target.id);
    setSelectedStatus(target.status);
    setDetailOpen(true);
    setEditMode(true);
  }, [items, openInEdit, openOrderId]);

  useEffect(() => {
    if (!selectedOrder) return;

    const isNewSelection =
      lastSelectedOrderIdRef.current !== selectedOrder.id;

    lastSelectedOrderIdRef.current = selectedOrder.id;

    setSelectedStatus((current) =>
      current === selectedOrder.status
        ? current
        : selectedOrder.status,
    );

    if (isNewSelection) {
      setForm({
        customerName:
          selectedOrder.customer?.name ?? "",
        phoneNumber:
          selectedOrder.customer?.phoneNumber ?? "",
        deliveryFee: String(
          selectedOrder.deliveryFee ?? 0,
        ),
        discountAmount: String(
          selectedOrder.discountAmount ?? 0,
        ),
        deliveryMethod:
          selectedOrder.deliveryMethod ?? "pickup",
        paymentMethod:
          selectedOrder.paymentMethod ?? "cod",
        location: selectedOrder.location ?? "",
        address: selectedOrder.address ?? "",
        preferredSchedule:
          selectedOrder.preferredSchedule
            ? toInputDate(
                selectedOrder.preferredSchedule,
              )
            : getLocalDateTimeInputValue(),
        maximStatus: [
          "booked",
          "completed",
          "cancelled",
        ].includes(
          selectedOrder.delivery?.status,
        )
          ? selectedOrder.delivery.status
          : "booked",
        maximScheduledAt:
          selectedOrder.delivery?.scheduledAt
            ? toInputDate(
                selectedOrder.delivery.scheduledAt,
              )
            : getLocalDateTimeInputValue(),
        maximEta: selectedOrder.delivery?.eta
          ? toInputDate(
              selectedOrder.delivery.eta,
            )
          : "",
        maximTrackingLink:
          selectedOrder.delivery?.trackingLink ?? "",
        maximRiderName:
          selectedOrder.delivery?.riderName ?? "",
        maximRiderPlate:
          selectedOrder.delivery?.riderPlate ?? "",
        maximBookingNotes:
          selectedOrder.delivery?.bookingNotes ?? "",
        notes: stripItemsBlock(
          selectedOrder.notes ?? "",
        ),
      });

      setLineItems(
        createEditableLineItems(
          selectedOrder,
          productOptions,
        ),
      );

      setError(null);
      setCopiedDetails(false);
      setCopiedTracking(false);
      setCopiedNotes(false);
      setNoteDraft("");

      return;
    }

    if (editMode) return;

    setForm((currentForm) =>
      currentForm.customerName &&
      currentForm.phoneNumber &&
      currentForm.address &&
      currentForm.location
        ? currentForm
        : {
            customerName:
              selectedOrder.customer?.name ?? "",
            phoneNumber:
              selectedOrder.customer?.phoneNumber ?? "",
            deliveryFee: String(
              selectedOrder.deliveryFee ?? 0,
            ),
            discountAmount: String(
              selectedOrder.discountAmount ?? 0,
            ),
            deliveryMethod:
              selectedOrder.deliveryMethod ?? "pickup",
            paymentMethod:
              selectedOrder.paymentMethod ?? "cod",
            location:
              selectedOrder.location ?? "",
            address:
              selectedOrder.address ?? "",
            preferredSchedule:
              selectedOrder.preferredSchedule
                ? toInputDate(
                    selectedOrder.preferredSchedule,
                  )
                : getLocalDateTimeInputValue(),
            maximStatus: [
              "booked",
              "completed",
              "cancelled",
            ].includes(
              selectedOrder.delivery?.status,
            )
              ? selectedOrder.delivery.status
              : "booked",
            maximScheduledAt:
              selectedOrder.delivery?.scheduledAt
                ? toInputDate(
                    selectedOrder.delivery.scheduledAt,
                  )
                : getLocalDateTimeInputValue(),
            maximEta:
              selectedOrder.delivery?.eta
                ? toInputDate(
                    selectedOrder.delivery.eta,
                  )
                : "",
            maximTrackingLink:
              selectedOrder.delivery
                ?.trackingLink ?? "",
            maximRiderName:
              selectedOrder.delivery
                ?.riderName ?? "",
            maximRiderPlate:
              selectedOrder.delivery
                ?.riderPlate ?? "",
            maximBookingNotes:
              selectedOrder.delivery
                ?.bookingNotes ?? "",
            notes: stripItemsBlock(
              selectedOrder.notes ?? "",
            ),
          },
    );
  }, [
    editMode,
    productOptions,
    selectedOrder,
  ]);

  useEffect(() => {
    if (
      !selectedOrder ||
      productOptions.length === 0
    ) {
      return;
    }

    setLineItems((current) => {
      if (current.length > 0) {
        return current;
      }

      return createEditableLineItems(
        selectedOrder,
        productOptions,
      );
    });
  }, [productOptions, selectedOrder?.id]);

  const totals = useMemo(
    () => ({
      totalOrders: items.length,
      visibleOrders: filteredItems.length,
    }),
    [filteredItems.length, items.length],
  );

  const visibleColumns = useMemo(() => {
    if (filteredItems.length === 0) return [];

    const active = columns.filter(
      (status) =>
        filteredItems.some(
          (item) => item.status === status,
        ) ||
        selectedOrder?.status === status,
    );

    return active.length > 0
      ? active
      : ["queued", "ready_for_booking", "booked"];
  }, [filteredItems, selectedOrder]);

  const countLabel = useMemo(
    () =>
      search.trim() ||
      statusFilter !== "all" ||
      selectedDate
        ? `${totals.visibleOrders} of ${totals.totalOrders}`
        : `${totals.totalOrders} orders`,
    [
      search,
      selectedDate,
      statusFilter,
      totals.totalOrders,
      totals.visibleOrders,
    ],
  );

  const queuedFlavorTotals = useMemo(() => {
    const totalsByFlavor = new Map<string, number>();

    filteredItems
      .filter(
        (order) => order.status === "queued",
      )
      .forEach((order) => {
        const lineItems =
          getOrderLineItems(order);

        const displayItems =
          lineItems.length > 0
            ? lineItems
            : [
                {
                  name: "Empanada",
                  quantity: Number(
                    order.quantity ?? 0,
                  ),
                },
              ];

        displayItems.forEach((item) => {
          const quantity = Number(
            item.quantity ?? 0,
          );

          if (
            item.name &&
            quantity >= 1
          ) {
            totalsByFlavor.set(
              item.name,
              (totalsByFlavor.get(
                item.name,
              ) ?? 0) + quantity,
            );
          }
        });
      });

    return [...totalsByFlavor.entries()]
      .map(([name, quantity]) => ({
        name,
        quantity,
      }))
      .sort(
        (a, b) =>
          b.quantity - a.quantity ||
          a.name.localeCompare(b.name),
      );
  }, [filteredItems]);

  const queuedFlavorQuantity =
    queuedFlavorTotals.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );

  const orderItemSummary = useMemo(() => {
    const items = lineItems
      .map((item) => {
        const quantity = Number(
          item.quantity || 0,
        );

        return quantity > 0
          ? {
              name: item.productName,
              quantity,
              price: item.price,
              subtotal:
                quantity * item.price,
            }
          : null;
      })
      .filter(
        (
          item,
        ): item is NonNullable<typeof item> =>
          Boolean(item),
      );

    const quantity = items.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );

    const subtotal = items.reduce(
      (sum, item) => sum + item.subtotal,
      0,
    );

    const deliveryFee =
      form.deliveryMethod === "maxim"
        ? Number(form.deliveryFee || 0)
        : 0;

    const discountAmount = Number(
      form.discountAmount || 0,
    );

    return {
      items,
      quantity,
      subtotal,
      deliveryFee,
      discountAmount,
      total: Math.max(
        0,
        subtotal +
          deliveryFee -
          discountAmount,
      ),
      unitPrice:
        quantity > 0
          ? subtotal / quantity
          : 0,
    };
  }, [
    form.deliveryFee,
    form.deliveryMethod,
    form.discountAmount,
    lineItems,
  ]);

  function updateStatus() {
    if (!selectedOrder) return;

    setError(null);

    startTransition(async () => {
      try {
        const updated =
          await apiFetch<any>(
            `/orders/${selectedOrder.id}/status`,
            {
              method: "PATCH",
              body: JSON.stringify({
                status: selectedStatus,
              }),
            },
          );

        setItems((current) =>
          current.map((item) =>
            item.id === updated.id
              ? updated
              : item,
          ),
        );
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to update status",
        );
      }
    });
  }

  function saveDetails() {
    if (!selectedOrder) return;

    setError(null);

    startTransition(async () => {
      try {
        if (orderItemSummary.quantity < 1) {
          setError(
            "Add at least one item quantity before saving.",
          );
          return;
        }

        let updated =
          await apiFetch<any>(
            `/orders/${selectedOrder.id}`,
            {
              method: "PATCH",
              body: JSON.stringify({
                customerName:
                  form.customerName,
                phoneNumber:
                  form.phoneNumber || undefined,
                quantity:
                  orderItemSummary.quantity,
                unitPrice:
                  orderItemSummary.unitPrice,
                deliveryFee:
                  orderItemSummary.deliveryFee,
                discountAmount:
                  orderItemSummary.discountAmount,
                items:
                  orderItemSummary.items,
                deliveryMethod:
                  form.deliveryMethod,
                paymentMethod:
                  form.paymentMethod,
                location:
                  form.location || undefined,
                address:
                  form.address || undefined,
                preferredSchedule:
                  form.preferredSchedule
                    ? new Date(
                        form.preferredSchedule,
                      ).toISOString()
                    : undefined,
                notes:
                  form.notes.trim() ||
                  undefined,
              }),
            },
          );

        if (shouldSaveMaximTracking()) {
          updated =
            await apiFetch<any>(
              `/deliveries/orders/${selectedOrder.id}`,
              {
                method: "PATCH",
                body: JSON.stringify({
                  status:
                    form.maximStatus,
                  scheduledAt:
                    form.maximScheduledAt
                      ? new Date(
                          form.maximScheduledAt,
                        ).toISOString()
                      : undefined,
                  eta: form.maximEta
                    ? new Date(
                        form.maximEta,
                      ).toISOString()
                    : undefined,
                  trackingLink:
                    form.maximTrackingLink ||
                    undefined,
                  riderName:
                    form.maximRiderName ||
                    undefined,
                  riderPlate:
                    form.maximRiderPlate ||
                    undefined,
                  bookingNotes:
                    form.maximBookingNotes ||
                    undefined,
                }),
              },
            );
        }

        await refreshOrders();
        setSelectedId(updated.id);
        setEditMode(false);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to save order details",
        );
      }
    });
  }

  function shouldSaveMaximTracking() {
    return Boolean(
      selectedOrder?.delivery ||
        form.maximTrackingLink.trim() ||
        form.maximRiderName.trim() ||
        form.maximRiderPlate.trim() ||
        form.maximBookingNotes.trim() ||
        form.maximEta,
    );
  }

  function shouldShowMaximTrackingFields() {
    return Boolean(
      form.deliveryMethod === "maxim" ||
        selectedStatus === "ready_for_booking" ||
        selectedStatus === "booked" ||
        selectedOrder?.deliveryMethod ===
          "maxim" ||
        selectedOrder?.delivery,
    );
  }

  function updateLineItem(
    productName: string,
    quantity: string,
  ) {
    const normalized =
      quantity === ""
        ? ""
        : String(
            Math.max(
              0,
              Number(quantity),
            ),
          );

    setLineItems((current) =>
      current.map((item) =>
        item.productName === productName
          ? {
              ...item,
              quantity: normalized,
            }
          : item,
      ),
    );
  }

  function stepLineItem(
    productName: string,
    delta: number,
  ) {
    setLineItems((current) =>
      current.map((item) => {
        if (
          item.productName !== productName
        ) {
          return item;
        }

        const nextQuantity = Math.max(
          0,
          Number(item.quantity || 0) +
            delta,
        );

        return {
          ...item,
          quantity:
            nextQuantity > 0
              ? String(nextQuantity)
              : "",
        };
      }),
    );
  }

  function addNote() {
    if (!selectedOrder) return;

    setError(null);

    startTransition(async () => {
      try {
        const updated =
          await apiFetch<any>(
            `/orders/${selectedOrder.id}/notes`,
            {
              method: "POST",
              body: JSON.stringify({
                body: noteDraft,
              }),
            },
          );

        setItems((current) =>
          current.map((item) =>
            item.id === updated.id
              ? updated
              : item,
          ),
        );

        setNoteDraft("");
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to add note",
        );
      }
    });
  }

  async function copyNotes() {
    const text = getOrderNotes(
      selectedOrder,
    )
      .map((note) => note.body)
      .join("\n\n");

    if (!text) return;

    try {
      await navigator.clipboard.writeText(
        text,
      );

      setCopiedNotes(true);

      window.setTimeout(
        () => setCopiedNotes(false),
        1600,
      );
    } catch {
      setCopiedNotes(false);
    }
  }

  async function copyOrderDetails() {
    if (!selectedOrder) return;

    try {
      await navigator.clipboard.writeText(
        formatOrderDetailsForCopy(
          selectedOrder,
        ),
      );

      setCopiedDetails(true);

      window.setTimeout(
        () => setCopiedDetails(false),
        1600,
      );
    } catch {
      setCopiedDetails(false);
    }
  }

  async function copyTrackingLink() {
    if (
      !selectedOrder ||
      typeof window === "undefined"
    ) {
      return;
    }

    try {
      await navigator.clipboard.writeText(
        `${window.location.origin}/track/${selectedOrder.id}`,
      );

      setCopiedTracking(true);

      window.setTimeout(
        () => setCopiedTracking(false),
        1600,
      );
    } catch {
      setCopiedTracking(false);
    }
  }

  function exportOrdersToExcel() {
    setError(null);
    setExportResult(null);

    startExportTransition(async () => {
      try {
        const result =
          await apiFetch<{
            name: string;
            webViewLink?: string;
          }>("/orders/export/google-drive", {
            method: "POST",
            body: JSON.stringify({
              orderIds:
                filteredItems.map(
                  (order) => order.id,
                ),
            }),
          });

        setExportResult(result);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to upload export to Google Drive",
        );
      }
    });
  }

  function deleteOrder() {
    if (!selectedOrder) return;

    const confirmed = window.confirm(
      `Delete order ${selectedOrder.orderNumber}? This cannot be undone.`,
    );

    if (!confirmed) return;

    setError(null);

    startDeleteTransition(async () => {
      try {
        await apiFetch(
          `/orders/${selectedOrder.id}`,
          {
            method: "DELETE",
          },
        );

        setItems((current) =>
          current.filter(
            (item) =>
              item.id !== selectedOrder.id,
          ),
        );

        setSelectedId((current) =>
          current === selectedOrder.id
            ? null
            : current,
        );

        setDetailOpen(false);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : "Unable to delete order",
        );
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.24em] text-foreground/35">
            Operations Board
          </p>
          <h2 className="mt-1 text-xl font-semibold sm:text-2xl">
            Order Workflow
          </h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:flex lg:items-center">
          <label className="relative block min-w-0 sm:w-[320px]">
            <Search
              size={16}
              className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-foreground/35"
            />
            <Input
              value={search}
              onChange={(e) =>
                setSearch(e.target.value)
              }
              placeholder="Search by customer, order no., area, phone, or notes"
              className="pl-10 sm:h-11"
            />
          </label>

          <Select
            value={statusFilter}
            onChange={setStatusFilter}
            options={statusFilterOptions}
            className="sm:w-[220px]"
          />

          <Input
            type="date"
            value={selectedDate}
            onChange={(e) => {
              const nextDate =
                e.target.value;

              selectedDateRef.current =
                nextDate;

              latestRefreshIdRef.current +=
                1;

              setSelectedDate(nextDate);
              setItems([]);
              setSelectedId(null);
              setIsDateChanging(true);
            }}
            className="w-full sm:h-11 sm:w-[168px]"
          />

          <Button
            type="button"
            variant="ghost"
            onClick={exportOrdersToExcel}
            disabled={
              filteredItems.length === 0 ||
              exportPending
            }
            className="h-11 justify-center gap-2 border border-line/80 px-4"
          >
            <UploadCloud size={16} />
            {exportPending
              ? "Uploading..."
              : "Upload Excel"}
          </Button>

          <Badge className="justify-center border border-line/70 bg-panel text-foreground/70 sm:justify-start">
            {isDateChanging
              ? "Loading..."
              : countLabel}
          </Badge>
        </div>
      </div>

      {exportResult ? (
        <div className="rounded-lg border border-line/80 bg-panel/70 px-4 py-3 text-sm text-foreground/70">
          Uploaded{" "}
          <span className="font-medium text-foreground">
            {exportResult.name}
          </span>{" "}
          to Google Drive.
          {exportResult.webViewLink ? (
            <a
              className="ml-2 text-accent hover:underline"
              href={exportResult.webViewLink}
              target="_blank"
              rel="noreferrer"
            >
              Open file
            </a>
          ) : null}
        </div>
      ) : null}

      <Card className="border-line/70 bg-panel/80 p-3 shadow-none">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-foreground/35">
              Queued Flavor Count
            </p>
            <p className="mt-1 text-sm text-foreground/55">
              {queuedFlavorTotals.length} flavor
              {queuedFlavorTotals.length === 1
                ? ""
                : "s"} · {queuedFlavorQuantity} pcs total
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            {queuedFlavorTotals.length > 0 ? (
              queuedFlavorTotals.map(
                (item) => (
                  <Badge
                    key={item.name}
                    className="border border-line/70 bg-black/15 text-foreground/72"
                  >
                    {item.name}:{" "}
                    <span className="ml-1 font-semibold text-foreground">
                      {item.quantity} pcs
                    </span>
                  </Badge>
                ),
              )
            ) : (
              <span className="text-sm text-foreground/45">
                No queued flavors.
              </span>
            )}
          </div>
        </div>
      </Card>

      <div className="min-w-0 overflow-x-auto rounded-lg border border-line/80 bg-panel/55 p-2 pb-3 shadow-sm shadow-black/10 sm:p-3 sm:pb-4">
        <div className="grid min-w-full grid-flow-col auto-cols-[minmax(224px,85vw)] gap-3 sm:auto-cols-[minmax(248px,1fr)]">
          {visibleColumns.map((status) => {
            const columnOrders =
              filteredItems.filter(
                (item) =>
                  item.status === status,
              );

            const columnQuantity =
              columnOrders.reduce(
                (sum, order) =>
                  sum +
                  Number(
                    order.quantity ?? 0,
                  ),
                0,
              );

            return (
              <Card
                key={status}
                className="min-w-[224px] overflow-hidden border-line/70 bg-panel/90 p-0 shadow-none sm:min-w-[248px]"
              >
                <div
                  className={cn(
                    "h-[3px] w-full",
                    statusDot[status],
                  )}
                />

                <div className="p-3">
                  <div className="mb-3 flex items-center justify-between border-b border-line/70 pb-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={cn(
                            "h-1.5 w-1.5 shrink-0 rounded-full",
                            statusDot[status],
                          )}
                        />
                        <p className="text-[10px] uppercase tracking-[0.22em] text-foreground/35">
                          Stage
                        </p>
                      </div>

                      <h3 className="mt-1 truncate text-[15px] font-semibold capitalize leading-tight">
                        {status.replaceAll(
                          "_",
                          " ",
                        )}
                      </h3>

                      <p className="mt-1 text-xs text-foreground/45">
                        {columnQuantity} pcs total
                      </p>
                    </div>

                    <Badge
                      className={cn(
                        "shrink-0 border-0 tabular-nums",
                        statusTone[status],
                      )}
                    >
                      {columnOrders.length}
                    </Badge>
                  </div>

                  <div className="space-y-2.5">
                    {columnOrders.map(
                      (order) => {
                        const orderLineItems =
                          getOrderLineItems(
                            order,
                          );
                        const notePreview =
                          getOrderNotePreview(
                            order,
                          );

                        return (
                          <button
                            key={order.id}
                            type="button"
                            onClick={() => {
                              setSelectedId(
                                order.id,
                              );
                              setDetailOpen(
                                true,
                              );
                            }}
                            className={cn(
                              "w-full rounded-lg border px-3.5 py-3 text-left transition duration-150 ease-out hover:-translate-y-0.5",
                              selectedOrder?.id ===
                                order.id
                                ? "border-accent/60 bg-accent/[0.08] shadow-[0_0_0_1px_rgb(var(--accent)/0.18)]"
                                : "border-line/70 bg-black/[0.08] hover:border-accent/35 hover:bg-white/[0.04] hover:shadow-[0_10px_28px_rgba(0,0,0,0.28)]",
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                <p className="truncate text-[17px] font-semibold leading-tight">
                                  {order.customer
                                    ?.name}
                                </p>
                                <p className="mt-1 text-[11px] uppercase tracking-[0.16em] text-foreground/30">
                                  {
                                    order.orderNumber
                                  }
                                </p>
                              </div>

                              <Badge
                                className={cn(
                                  "shrink-0 border-0 text-[11px]",
                                  deliveryBadgeTone[
                                    order.deliveryMethod
                                  ] ??
                                    deliveryBadgeTone.pickup,
                                )}
                              >
                                {deliveryMethodLabels[
                                  order.deliveryMethod
                                ] ??
                                  order.deliveryMethod}
                              </Badge>
                            </div>

                            <OrderItemsList
                              items={
                                orderLineItems
                              }
                              fallbackQuantity={
                                order.quantity
                              }
                            />

                            {notePreview ? (
                              <div className="mt-3 rounded-lg border border-line/70 bg-white/[0.03] px-3 py-2.5">
                                <p className="text-[10px] uppercase tracking-[0.16em] text-foreground/28">
                                  Note
                                </p>
                                <p className="mt-1 line-clamp-3 whitespace-pre-wrap text-sm leading-5 text-foreground/70">
                                  {notePreview}
                                </p>
                              </div>
                            ) : null}

                            <div className="mt-3 grid grid-cols-2 gap-2">
                              <CompactStat
                                label="Qty"
                                value={`${order.quantity}`}
                                suffix="pcs"
                              />
                              <CompactStat
                                label="To Pay"
                                value={`Php ${String(
                                  order.totalAmount,
                                )}`}
                                accent
                              />
                            </div>

                            <div className="mt-3 space-y-1.5 text-sm text-foreground/62">
                              <InfoLine
                                icon={MapPin}
                                text={
                                  order.location ??
                                  "No area"
                                }
                              />
                              <InfoLine
                                icon={Clock3}
                                text={formatSchedule(
                                  order.preferredSchedule,
                                )}
                              />
                            </div>
                          </button>
                        );
                      },
                    )}

                    {columnOrders.length === 0 ? (
                      <div className="h-2" />
                    ) : null}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {filteredItems.length === 0 ? (
          <div className="flex min-h-[220px] items-center justify-center px-6 py-10 text-center text-sm text-foreground/45">
            No orders matched your search.
          </div>
        ) : null}
      </div>

      {detailOpen ? (
        <div className="fixed inset-0 z-40">
          <button
            type="button"
            aria-label="Close order details"
            onClick={() =>
              setDetailOpen(false)
            }
            className="absolute inset-0 bg-black/55 backdrop-blur-[3px]"
          />

          <div className="absolute inset-y-0 right-0 w-full max-w-[480px] p-2 sm:p-4">
            <Card className="flex h-full flex-col overflow-hidden border-line/90 bg-panel p-0 shadow-[0_24px_80px_rgba(0,0,0,0.55)]">
              {selectedOrder ? (
                <div className="flex min-h-0 flex-1 flex-col">
                  <div
                    className={cn(
                      "h-[3px] w-full shrink-0",
                      statusDot[
                        selectedOrder.status
                      ],
                    )}
                  />

                  <div className="shrink-0 border-b border-line/75 bg-panel p-4 sm:p-6">
                    <div className="mb-4 flex items-center justify-between">
                      <button
                        type="button"
                        onClick={() =>
                          setDetailOpen(
                            false,
                          )
                        }
                        className="inline-flex items-center gap-2 rounded-md border border-line/80 px-3 py-1.5 text-xs text-foreground/55 transition hover:border-accent/35 hover:text-foreground"
                      >
                        <ChevronRight
                          size={14}
                        />
                        Hide details
                      </button>
                    </div>

                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[11px] uppercase tracking-[0.24em] text-foreground/30">
                          Selected Order
                        </p>

                        <h3 className="mt-2 truncate text-2xl font-semibold leading-tight sm:text-[32px] sm:leading-none">
                          {
                            selectedOrder
                              .customer
                              ?.name
                          }
                        </h3>

                        <p className="mt-2 font-mono text-sm text-foreground/40">
                          {
                            selectedOrder.orderNumber
                          }
                        </p>
                      </div>

                      <Badge
                        className={cn(
                          "shrink-0 border-0",
                          statusTone[
                            selectedOrder.status
                          ],
                        )}
                      >
                        {selectedOrder.status.replaceAll(
                          "_",
                          " ",
                        )}
                      </Badge>
                    </div>
                  </div>

                  <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                    <div className="space-y-4">
                      <div className="space-y-2.5 rounded-lg border border-accent/25 bg-accent/[0.05] p-4">
                        <label className="text-sm font-medium text-foreground/72">
                          Update status
                        </label>

                        <Select
                          value={
                            selectedStatus
                          }
                          onChange={
                            setSelectedStatus
                          }
                          options={
                            statusSelectOptions
                          }
                        />

                        <Button
                          className="w-full"
                          onClick={
                            updateStatus
                          }
                          disabled={
                            pending ||
                            deletePending ||
                            selectedStatus ===
                              selectedOrder.status
                          }
                        >
                          {pending
                            ? "Updating..."
                            : "Save Status"}
                        </Button>

                        {selectedOrder.status !==
                        selectedStatus ? (
                          <p className="flex items-center gap-2 text-xs text-foreground/45">
                            <ArrowRight
                              size={14}
                            />
                            {selectedOrder.status.replaceAll(
                              "_",
                              " ",
                            )}{" "}
                            to{" "}
                            {selectedStatus.replaceAll(
                              "_",
                              " ",
                            )}
                          </p>
                        ) : null}

                        {error ? (
                          <p className="text-sm text-danger">
                            {error}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-sm font-medium text-foreground/68">
                          Order details
                        </p>

                        <div className="flex flex-wrap gap-2">
                          {!editMode ? (
                            <Button
                              variant="ghost"
                              className="px-3"
                              onClick={
                                copyOrderDetails
                              }
                            >
                              {copiedDetails ? (
                                <Check
                                  size={14}
                                />
                              ) : (
                                <Copy
                                  size={14}
                                />
                              )}
                              {copiedDetails
                                ? "Copied"
                                : "Copy"}
                            </Button>
                          ) : null}

                          {!editMode ? (
                            <Button
                              variant="ghost"
                              className="px-3"
                              onClick={
                                copyTrackingLink
                              }
                            >
                              {copiedTracking ? (
                                <Check
                                  size={14}
                                />
                              ) : (
                                <Link2
                                  size={14}
                                />
                              )}
                              {copiedTracking
                                ? "Copied"
                                : "Track Link"}
                            </Button>
                          ) : null}

                          <Button
                            variant="ghost"
                            className="px-3 text-danger hover:text-danger"
                            onClick={
                              deleteOrder
                            }
                            disabled={
                              deletePending ||
                              pending
                            }
                          >
                            <Trash2
                              size={14}
                            />
                            {deletePending
                              ? "Deleting..."
                              : "Delete"}
                          </Button>

                          <Button
                            variant="ghost"
                            className="px-3"
                            onClick={() =>
                              setEditMode(
                                (value) =>
                                  !value,
                              )
                            }
                          >
                            {editMode
                              ? "Cancel Edit"
                              : "Edit Details"}
                          </Button>

                          {editMode ? (
                            <Button
                              className="px-3"
                              onClick={
                                saveDetails
                              }
                              disabled={
                                pending ||
                                deletePending
                              }
                            >
                              {pending
                                ? "Saving..."
                                : "Save Details"}
                            </Button>
                          ) : null}
                        </div>
                      </div>

                      {editMode ? (
                        <div className="grid gap-3">
                          <Input
                            value={
                              form.customerName
                            }
                            onChange={(e) =>
                              setForm((c) => ({
                                ...c,
                                customerName:
                                  e.target.value,
                              }))
                            }
                            placeholder="Customer name"
                          />

                          <Input
                            value={
                              form.phoneNumber
                            }
                            onChange={(e) =>
                              setForm((c) => ({
                                ...c,
                                phoneNumber:
                                  e.target.value,
                              }))
                            }
                            placeholder="Phone number"
                          />

                          <div className="rounded-lg border border-accent/35 bg-accent/[0.06] p-3">
                            <p className="mb-2 text-xs uppercase tracking-[0.18em] text-accent">
                              Maxim Link
                            </p>

                            <Input
                              value={
                                form.maximTrackingLink
                              }
                              onChange={(e) =>
                                setForm((c) => ({
                                  ...c,
                                  maximTrackingLink:
                                    e.target.value,
                                }))
                              }
                              placeholder="Paste Maxim tracking link here"
                            />
                          </div>

                          <div className="overflow-hidden rounded-lg border border-line/80 bg-black/10">
                            <div className="flex items-center justify-between gap-3 border-b border-line/75 px-4 py-3">
                              <div>
                                <p className="text-xs uppercase tracking-[0.18em] text-foreground/35">
                                  Order Items
                                </p>

                                <p className="mt-1 text-xs text-foreground/45">
                                  {
                                    orderItemSummary.quantity
                                  }{" "}
                                  pcs selected
                                </p>
                              </div>

                              <p className="text-sm font-semibold">
                                Php{" "}
                                {formatPeso(
                                  orderItemSummary.subtotal,
                                )}
                              </p>
                            </div>

                            <div className="divide-y divide-line/65">
                              {lineItems.map(
                                (item) => {
                                  const product =
                                    productOptions.find(
                                      (option) =>
                                        option.value ===
                                        item.productName,
                                    );

                                  const available =
                                    product
                                      ? product.available
                                      : true;

                                  return (
                                    <div
                                      key={
                                        item.productName
                                      }
                                      className="flex items-center justify-between gap-3 px-4 py-3"
                                    >
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-medium">
                                          {
                                            item.productName
                                          }
                                        </p>

                                        <p
                                          className={cn(
                                            "mt-1 text-xs",
                                            available
                                              ? "text-foreground/40"
                                              : "text-danger",
                                          )}
                                        >
                                          {available
                                            ? `Php ${formatPeso(
                                                item.price,
                                              )} each`
                                            : "Sold out"}
                                        </p>
                                      </div>

                                      <div className="flex items-center gap-2">
                                        <Button
                                          type="button"
                                          variant="ghost"
                                          onClick={() =>
                                            stepLineItem(
                                              item.productName,
                                              -1,
                                            )
                                          }
                                          className="h-8 w-8 p-0"
                                        >
                                          <Minus
                                            size={
                                              14
                                            }
                                          />
                                        </Button>

                                        <Input
                                          type="number"
                                          min="0"
                                          value={
                                            item.quantity
                                          }
                                          onChange={(
                                            e,
                                          ) =>
                                            updateLineItem(
                                              item.productName,
                                              e.target
                                                .value,
                                            )
                                          }
                                          className="h-8 w-16 text-center"
                                        />

                                        <Button
                                          type="button"
                                          variant="ghost"
                                          onClick={() =>
                                            stepLineItem(
                                              item.productName,
                                              1,
                                            )
                                          }
                                          className="h-8 w-8 p-0"
                                        >
                                          <Plus
                                            size={
                                              14
                                            }
                                          />
                                        </Button>
                                      </div>
                                    </div>
                                  );
                                },
                              )}
                            </div>
                          </div>

                          <div className="grid gap-3 sm:grid-cols-2">
                            <Select
                              value={
                                form.deliveryMethod
                              }
                              onChange={(value) =>
                                setForm((c) => ({
                                  ...c,
                                  deliveryMethod:
                                    value,
                                }))
                              }
                              options={
                                deliverySelectOptions
                              }
                            />

                            <Select
                              value={
                                form.paymentMethod
                              }
                              onChange={(value) =>
                                setForm((c) => ({
                                  ...c,
                                  paymentMethod:
                                    value,
                                }))
                              }
                              options={
                                paymentSelectOptions
                              }
                            />

                            <Input
                              value={
                                form.deliveryFee
                              }
                              onChange={(e) =>
                                setForm((c) => ({
                                  ...c,
                                  deliveryFee:
                                    e.target.value,
                                }))
                              }
                              placeholder="Delivery fee"
                            />

                            <Input
                              value={
                                form.discountAmount
                              }
                              onChange={(e) =>
                                setForm((c) => ({
                                  ...c,
                                  discountAmount:
                                    e.target.value,
                                }))
                              }
                              placeholder="Discount"
                            />

                            <Input
                              value={
                                form.location
                              }
                              onChange={(e) =>
                                setForm((c) => ({
                                  ...c,
                                  location:
                                    e.target.value,
                                }))
                              }
                              placeholder="Area / Location"
                            />

                            <Input
                              value={
                                form.address
                              }
                              onChange={(e) =>
                                setForm((c) => ({
                                  ...c,
                                  address:
                                    e.target.value,
                                }))
                              }
                              placeholder="Full address"
                            />

                            <Input
                              type="datetime-local"
                              value={
                                form.preferredSchedule
                              }
                              onChange={(e) =>
                                setForm((c) => ({
                                  ...c,
                                  preferredSchedule:
                                    e.target.value,
                                }))
                              }
                            />

                            <Input
                              value={
                                form.notes
                              }
                              onChange={(e) =>
                                setForm((c) => ({
                                  ...c,
                                  notes:
                                    e.target.value,
                                }))
                              }
                              placeholder="Notes"
                            />
                          </div>

                          {shouldShowMaximTrackingFields() ? (
                            <div className="grid gap-3 rounded-lg border border-line/80 p-3">
                              <Select
                                value={
                                  form.maximStatus
                                }
                                onChange={(value) =>
                                  setForm(
                                    (c) => ({
                                      ...c,
                                      maximStatus:
                                        value,
                                    }),
                                  )
                                }
                                options={[
                                  {
                                    label: "Booked",
                                    value: "booked",
                                  },
                                  {
                                    label:
                                      "Completed",
                                    value: "completed",
                                  },
                                  {
                                    label:
                                      "Cancelled",
                                    value: "cancelled",
                                  },
                                ]}
                              />

                              <Input
                                type="datetime-local"
                                value={
                                  form.maximScheduledAt
                                }
                                onChange={(e) =>
                                  setForm(
                                    (c) => ({
                                      ...c,
                                      maximScheduledAt:
                                        e.target
                                          .value,
                                    }),
                                  )
                                }
                              />

                              <Input
                                type="datetime-local"
                                value={
                                  form.maximEta
                                }
                                onChange={(e) =>
                                  setForm(
                                    (c) => ({
                                      ...c,
                                      maximEta:
                                        e.target
                                          .value,
                                    }),
                                  )
                                }
                              />

                              <Input
                                value={
                                  form.maximRiderName
                                }
                                onChange={(e) =>
                                  setForm(
                                    (c) => ({
                                      ...c,
                                      maximRiderName:
                                        e.target
                                          .value,
                                    }),
                                  )
                                }
                                placeholder="Rider name"
                              />

                              <Input
                                value={
                                  form.maximRiderPlate
                                }
                                onChange={(e) =>
                                  setForm(
                                    (c) => ({
                                      ...c,
                                      maximRiderPlate:
                                        e.target
                                          .value,
                                  }),
                                }
                                placeholder="Plate number"
                              />

                              <Input
                                value={
                                  form.maximBookingNotes
                                }
                                onChange={(e) =>
                                  setForm(
                                    (c) => ({
                                      ...c,
                                      maximBookingNotes:
                                        e.target
                                          .value,
                                    }),
                                  )
                                }
                                placeholder="Booking notes"
                              />
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="shrink-0 border-t border-line/75 bg-panel p-4 sm:p-6">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-line/70 bg-black/10 p-3 text-sm">
                        <div className="flex justify-between">
                          <span className="text-foreground/45">
                            Subtotal
                          </span>
                          <span>
                            Php{" "}
                            {formatPeso(
                              orderItemSummary.subtotal,
                            )}
                          </span>
                        </div>

                        <div className="mt-1 flex justify-between">
                          <span className="text-foreground/45">
                            Delivery
                          </span>
                          <span>
                            Php{" "}
                            {formatPeso(
                              orderItemSummary.deliveryFee,
                            )}
                          </span>
                        </div>

                        <div className="mt-1 flex justify-between">
                          <span className="text-foreground/45">
                            Discount
                          </span>
                          <span>
                            Php{" "}
                            {formatPeso(
                              orderItemSummary.discountAmount,
                            )}
                          </span>
                        </div>

                        <div className="mt-2 flex justify-between border-t border-line/60 pt-2 font-semibold">
                          <span>Total</span>
                          <span>
                            Php{" "}
                            {formatPeso(
                              orderItemSummary.total,
                            )}
                          </span>
                        </div>
                      </div>

                      <div className="rounded-lg border border-line/70 bg-black/10 p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] uppercase tracking-[0.18em] text-foreground/35">
                            Order notes
                          </p>

                          <Button
                            variant="ghost"
                            className="px-2"
                            onClick={
                              copyNotes
                            }
                          >
                            {copiedNotes ? (
                              "Copied"
                            ) : (
                              <Copy
                                size={14}
                              />
                            )}
                          </Button>
                        </div>

                        <div className="mt-2 space-y-2">
                          {getOrderNotes(
                            selectedOrder,
                          )
                            .slice(-3)
                            .map(
                              (note) => (
                                <div
                                  key={
                                    note.id
                                  }
                                  className="rounded bg-white/[0.03] px-2.5 py-2"
                                >
                                  <p className="text-sm text-foreground/70">
                                    {
                                      note.body
                                    }
                                  </p>

                                  <p className="mt-1 text-[10px] text-foreground/30">
                                    {formatNoteTime(
                                      note.createdAt,
                                    )}
                                  </p>
                                </div>
                              ),
                            )}

                          <div className="mt-2 flex gap-2">
                            <Input
                              value={
                                noteDraft
                              }
                              onChange={(e) =>
                                setNoteDraft(
                                  e.target
                                    .value,
                                )
                              }
                              placeholder="Add note"
                            />

                            <Button
                              onClick={
                                addNote
                              }
                              disabled={
                                pending ||
                                !noteDraft.trim()
                              }
                            >
                              Add
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </Card>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function compareOrdersBySchedule(
  a: any,
  b: any,
) {
  const aSchedule = getTimeValue(
    a.preferredSchedule,
  );
  const bSchedule = getTimeValue(
    b.preferredSchedule,
  );

  return aSchedule !== bSchedule
    ? aSchedule - bSchedule
    : getTimeValue(a.createdAt) -
        getTimeValue(b.createdAt);
}

function getTimeValue(
  value?: string | null,
) {
  if (!value) {
    return Number.MAX_SAFE_INTEGER;
  }

  const time = new Date(
    value,
  ).getTime();

  return Number.isNaN(time)
    ? Number.MAX_SAFE_INTEGER
    : time;
}

function getOrderNotes(
  order: any,
): OrderNoteView[] {
  const orderNotes: OrderNoteView[] =
    Array.isArray(order?.orderNotes)
      ? order.orderNotes
      : [];

  if (orderNotes.length > 0) {
    return orderNotes
      .map((note) => ({
        ...note,
        body: stripItemsBlock(
          note.body,
        ),
      }))
      .filter(
        (note) => note.body.trim(),
      );
  }

  const body = stripItemsBlock(
    order?.notes ?? "",
  );

  return body
    ? [
        {
          id: "legacy-note",
          body,
          createdAt: order.createdAt,
        },
      ]
    : [];
}

function getOrderLineItems(
  order: any,
): OrderLineItemView[] {
  const storedItems =
    normalizeStoredOrderItems(order?.items);

  if (storedItems.length > 0) {
    return storedItems;
  }

  const rawNoteBodies: string[] =
    Array.isArray(order?.orderNotes)
      ? order.orderNotes.map(
          (note: any) => note.body,
        )
      : [];

  const body: string =
    String(order?.notes ?? "") ||
    (rawNoteBodies.find((note) =>
      note.includes("Items:"),
    ) ?? "");

  const itemLines = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) =>
      line.startsWith("- "),
    );

  const items = itemLines
    .map(
      (
        line,
      ): OrderLineItemView | null => {
        const match = line.match(
          /^-\s+(.+?)\s+x\s+(\d+)(?:\s+@\s+Php\s+([\d.]+)\s+=\s+Php\s+([\d.]+))?$/i,
        );

        if (!match) {
          return null;
        }

        return {
          name: match[1],
          quantity: Number(match[2]),
          ...(match[3]
            ? {
                price: Number(match[3]),
              }
            : {}),
          ...(match[4]
            ? {
                subtotal: Number(match[4]),
              }
            : {}),
        };
      },
    )
    .filter(
      (
        item,
      ): item is OrderLineItemView =>
        Boolean(item),
    );

  if (items.length > 0) {
    return items;
  }

  const productMatch = body.match(
    /^Product:\s*(.+)$/im,
  );

  return productMatch
    ? [
        {
          name: productMatch[1].trim(),
          quantity: Number(
            order?.quantity ?? 0,
          ),
        },
      ]
    : [];
}

function normalizeStoredOrderItems(
  value: unknown,
): OrderLineItemView[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map(
      (
        item,
      ): OrderLineItemView | null => {
        if (
          !item ||
          typeof item !== "object"
        ) {
          return null;
        }

        const candidate =
          item as Record<string, unknown>;

        const name =
          typeof candidate.name ===
          "string"
            ? candidate.name
            : "";

        const quantity = Number(
          candidate.quantity ?? 0,
        );

        if (!name || quantity < 1) {
          return null;
        }

        const price =
          candidate.price !== undefined
            ? Number(candidate.price)
            : undefined;

        const subtotal =
          candidate.subtotal !== undefined
            ? Number(candidate.subtotal)
            : undefined;

        return {
          name,
          quantity,
          ...(price !== undefined &&
          !Number.isNaN(price)
            ? { price }
            : {}),
          ...(subtotal !== undefined &&
          !Number.isNaN(subtotal)
            ? { subtotal }
            : {}),
        };
      },
    )
    .filter(
      (
        item,
      ): item is OrderLineItemView =>
        Boolean(item),
    );
}

function getOrderNotePreview(
  order: any,
) {
  return getOrderNotes(order)
    .map((note) => note.body.trim())
    .filter(Boolean)
    .join("\n\n");
}

function createEditableLineItems(
  order: any | undefined,
  productOptions: ProductOption[],
): EditableOrderLineItem[] {
  const parsedItems = order
    ? getOrderLineItems(order)
    : [];

  const parsedByName = new Map(
    parsedItems.map((item) => [
      item.name.toLowerCase(),
      item,
    ]),
  );

  const knownItems = productOptions.map(
    (product) => {
      const existing =
        parsedByName.get(
          product.value.toLowerCase(),
        );

      return {
        productName: product.value,
        quantity: existing?.quantity
          ? String(existing.quantity)
          : "",
        price:
          existing?.price ??
          product.price,
      };
    },
  );

  const knownNames = new Set(
    productOptions.map((product) =>
      product.value.toLowerCase(),
    ),
  );

  const customItems = parsedItems
    .filter(
      (item) =>
        !knownNames.has(
          item.name.toLowerCase(),
        ),
    )
    .map((item) => ({
      productName: item.name,
      quantity: item.quantity
        ? String(item.quantity)
        : "",
      price:
        item.price ??
        Number(
          order?.unitPrice ?? 0,
        ),
    }));

  if (parsedItems.length > 0) {
    return [
      ...knownItems,
      ...customItems,
    ];
  }

  const fallbackQuantity = Number(
    order?.quantity ?? 0,
  );

  return knownItems.map(
    (item, index) => ({
      ...item,
      quantity:
        index === 0 &&
        fallbackQuantity > 0
          ? String(fallbackQuantity)
          : item.quantity,
    }),
  );
}

function stripItemsBlock(
  value: string,
) {
  const lines =
    value.split(/\r?\n/);

  const result: string[] = [];

  let index = 0;

  while (index < lines.length) {
    if (
      lines[index]
        .trim()
        .toLowerCase() ===
      "items:"
    ) {
      index += 1;

      while (
        index < lines.length &&
        lines[index]
          .trim()
          .startsWith("- ")
      ) {
        index += 1;
      }

      while (
        index < lines.length &&
        lines[index].trim() === ""
      ) {
        index += 1;
      }

      continue;
    }

    result.push(lines[index]);
    index += 1;
  }

  return result.join("\n").trim();
}

function formatOrderDetailsForCopy(
  order: any,
) {
  const lineItems =
    getOrderLineItems(order);

  const displayItems =
    lineItems.length > 0
      ? lineItems
      : [
          {
            name: "Empanada",
            quantity: Number(
              order?.quantity ?? 0,
            ),
          },
        ];

  const itemLines =
    displayItems.map((item) => {
      const amount =
        item.subtotal !== undefined
          ? ` - Php ${item.subtotal}`
          : "";

      const price =
        item.price !== undefined
          ? ` x Php ${item.price}`
          : "";

      return `${item.name}: ${item.quantity} pcs${price}${amount}`;
    });

  const address =
    order?.address ??
    order?.location ??
    "No address provided";

  const landmark =
    typeof order?.location === "string"
      ? order.location.trim()
      : "";

  return [
    `Order: ${order?.orderNumber ?? ""}`,
    `Customer: ${
      order?.customer?.name ?? ""
    }`,
    `Phone: ${
      order?.customer?.phoneNumber ??
      "No phone number"
    }`,
    `Address: ${address}`,
    ...(landmark
      ? [`Landmark: ${landmark}`]
      : []),
    `Schedule: ${formatSchedule(
      order?.preferredSchedule,
    )}`,
    `Delivery: ${
      order?.deliveryMethod ?? ""
    }`,
    `Payment: ${formatPaymentMethod(
      order?.paymentMethod,
    )}`,
    "Items:",
    ...itemLines.map(
      (line) => `- ${line}`,
    ),
    `Quantity: ${
      order?.quantity ?? 0
    } pcs`,
    `Total to pay: Php ${String(
      order?.totalAmount ?? 0,
    )}`,
  ].join("\n");
}

function formatNoteTime(
  value?: string | null,
) {
  return value
    ? noteTimeFormatter.format(
        new Date(value),
      )
    : "Just now";
}

function formatPaymentMethod(
  value?: string | null,
) {
  return value === "gcash"
    ? "GCash"
    : "COD";
}

function formatSchedule(
  value?: string | null,
) {
  if (!value) {
    return "Not scheduled";
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not scheduled";
  }

  return scheduleFormatter.format(
    date,
  );
}

function formatPeso(
  value: number,
) {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2);
}

function getTodayDateInputValue() {
  const now = new Date();

  return `${now.getFullYear()}-${String(
    now.getMonth() + 1,
  ).padStart(
    2,
    "0",
  )}-${String(
    now.getDate(),
  ).padStart(
    2,
    "0",
  )}`;
}

function getLocalDateTimeInputValue() {
  const now = new Date();

  const pad = (value: number) =>
    String(value).padStart(
      2,
      "0",
    );

  return `${now.getFullYear()}-${pad(
    now.getMonth() + 1,
  )}-${pad(
    now.getDate(),
  )}T${pad(
    now.getHours(),
  )}:${pad(
    now.getMinutes(),
  )}`;
}

function toInputDate(
  value: string,
) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const pad = (part: number) =>
    String(part).padStart(
      2,
      "0",
    );

  return `${date.getFullYear()}-${pad(
    date.getMonth() + 1,
  )}-${pad(
    date.getDate(),
  )}T${pad(
    date.getHours(),
  )}:${pad(
    date.getMinutes(),
  )}`;
}

function InfoLine({
  icon: Icon,
  text,
}: {
  icon: typeof MapPin;
  text: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon
        size={14}
        className="shrink-0 text-foreground/35"
      />
      <span className="truncate">
        {text}
      </span>
    </div>
  );
}

function CompactStat({
  label,
  value,
  suffix,
  accent,
}: {
  label: string;
  value: string;
  suffix?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-md border border-line/70 bg-black/[0.08] px-2.5 py-2">
      <p className="text-[9px] uppercase tracking-[0.16em] text-foreground/30">
        {label}
      </p>

      <p
        className={cn(
          "mt-1 text-sm font-semibold",
          accent && "text-accent",
        )}
      >
        {value}{" "}
        {suffix ? (
          <span className="text-[10px] font-normal text-foreground/35">
            {suffix}
          </span>
        ) : null}
      </p>
    </div>
  );
}

function OrderItemsList({
  items,
  fallbackQuantity,
}: {
  items: OrderLineItemView[];
  fallbackQuantity?: number;
}) {
  if (items.length === 0) {
    return (
      <div className="mt-3 text-sm text-foreground/50">
        {fallbackQuantity ?? 0} pcs
      </div>
    );
  }

  return (
    <div className="mt-3 space-y-1.5">
      {items.map((item, index) => (
        <div
          key={`${item.name}-${index}`}
          className="flex items-center justify-between gap-2 text-sm"
        >
          <span className="truncate text-foreground/72">
            {item.name}
          </span>

          <span className="shrink-0 text-foreground/45">
            × {item.quantity}
          </span>
        </div>
      ))}
    </div>
  );
}
