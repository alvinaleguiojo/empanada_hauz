"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type Review = {
  id: string;
  orderId: string;
  orderNumber: string;
  reviewerName: string;
  productName: string;
  rating: number;
  comment: string | null;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
};

export default function ProductReviewsAdmin() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [filter, setFilter] = useState<"pending" | "approved" | "rejected">("pending");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadReviews = async () => {
    setLoading(true);
    setError("");

    try {
      const data = await apiFetch<Review[]>(
        `/admin/product-reviews?status=${filter}`
      );
      setReviews(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load reviews.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadReviews();
  }, [filter]);

  const updateStatus = async (id: string, status: "approved" | "rejected") => {
    try {
      await apiFetch(`/admin/product-reviews/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      await loadReviews();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update review.");
    }
  };

  return (
    <main className="min-h-screen bg-background px-5 py-10 text-foreground sm:px-8">
      <div className="mx-auto max-w-5xl">
        <header className="border-b border-line/70 pb-6">
          <p className="text-xs uppercase tracking-[0.2em] text-foreground/35">Empanada Hauz</p>
          <h1 className="mt-2 text-3xl font-bold">Product Reviews</h1>
          <p className="mt-2 text-sm text-foreground/55">
            Approve genuine completed-order reviews before they appear publicly and in Product structured data.
          </p>
        </header>

        <div className="mt-6 flex flex-wrap gap-2">
          {(["pending", "approved", "rejected"] as const).map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setFilter(status)}
              className={`rounded-full border px-4 py-2 text-sm font-semibold capitalize transition ${
                filter === status
                  ? "border-accent/50 bg-accent/12 text-accent"
                  : "border-line bg-panel text-foreground/55"
              }`}
            >
              {status}
            </button>
          ))}
        </div>

        {error ? (
          <div className="mt-5 rounded-xl border border-danger/30 bg-danger/10 px-4 py-3 text-sm text-danger">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="mt-8 rounded-2xl border border-line/70 bg-panel p-8 text-sm text-foreground/50">
            Loading reviews…
          </div>
        ) : reviews.length === 0 ? (
          <div className="mt-8 rounded-2xl border border-dashed border-line/70 bg-panel p-8 text-sm text-foreground/50">
            No {filter} reviews.
          </div>
        ) : (
          <div className="mt-8 grid gap-4">
            {reviews.map((review) => (
              <article key={review.id} className="rounded-2xl border border-line/70 bg-panel p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.16em] text-foreground/35">{review.productName}</p>
                    <h2 className="mt-1 text-lg font-semibold">{review.reviewerName}</h2>
                    <p className="mt-1 text-xs text-foreground/38">Order {review.orderNumber}</p>
                  </div>
                  <div className="text-lg tracking-[0.15em] text-[#E3A64B]">
                    {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}
                  </div>
                </div>

                {review.comment ? (
                  <p className="mt-4 rounded-xl border border-line/60 bg-background/50 px-4 py-3 text-sm leading-6 text-foreground/70">
                    “{review.comment}”
                  </p>
                ) : null}

                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-foreground/35">
                    Submitted {new Date(review.createdAt).toLocaleString("en-PH")}
                  </p>
                  {review.status === "pending" ? (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => void updateStatus(review.id, "rejected")}
                        className="rounded-xl border border-danger/30 px-4 py-2 text-sm font-semibold text-danger"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => void updateStatus(review.id, "approved")}
                        className="rounded-xl bg-[#C0472B] px-4 py-2 text-sm font-bold text-white"
                      >
                        Approve
                      </button>
                    </div>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
