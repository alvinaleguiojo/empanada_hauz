"use client";

import { useState } from "react";
import { API_URL } from "@/lib/config";

type ReviewItem = {
  name: string;
  quantity: number;
};

export default function OrderReviewForm({
  orderId,
  items
}: {
  orderId: string;
  items: ReviewItem[];
}) {
  const [selectedProduct, setSelectedProduct] = useState(items[0]?.name ?? "");
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState("");
  const [submitted, setSubmitted] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  const reviewed = submitted.includes(selectedProduct);

  const submitReview = async () => {
    if (!selectedProduct || reviewed || submitting) return;

    setSubmitting(true);
    setMessage("");

    try {
      const response = await fetch(`${API_URL}/orders/${encodeURIComponent(orderId)}/reviews`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          productName: selectedProduct,
          rating,
          comment: comment.trim() || undefined
        })
      });

      const payload = (await response.json().catch(() => null)) as
        | { status?: string; message?: string; error?: string }
        | null;

      if (!response.ok) {
        throw new Error(payload?.message || payload?.error || "We couldn't submit your review.");
      }

      setSubmitted((current) => [...current, selectedProduct]);
      setComment("");
      setMessage("Thanks! Your review is now published. 😊");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "We couldn't submit your review.");
    } finally {
      setSubmitting(false);
    }
  };

  if (items.length === 0) return null;

  return (
    <section className="rounded-2xl border border-line/80 bg-panel p-4 sm:p-5">
      <p className="text-xs uppercase tracking-[0.18em] text-foreground/35">Your feedback</p>
      <h2 className="mt-2 text-xl font-semibold">How was your empanada?</h2>
      <p className="mt-2 text-sm leading-6 text-foreground/55">
        Your review is tied to this completed order and is published immediately.
      </p>

      <div className="mt-5">
        <label className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/40">
          Flavor
        </label>
        <select
          value={selectedProduct}
          onChange={(event) => {
            setSelectedProduct(event.target.value);
            setMessage("");
          }}
          className="mt-2 min-h-11 w-full rounded-xl border border-line/80 bg-background px-3 text-sm"
        >
          {items.map((item) => (
            <option key={item.name} value={item.name}>
              {item.name} · {item.quantity} pcs
            </option>
          ))}
        </select>
      </div>

      <div className="mt-5">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/40">Rating</span>
        <div className="mt-2 flex gap-1.5" role="radiogroup" aria-label="Rating">
          {[1, 2, 3, 4, 5].map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setRating(value)}
              aria-pressed={rating === value}
              className={`grid h-10 w-10 place-items-center rounded-full border text-lg transition ${
                rating >= value
                  ? "border-[#E3A64B]/70 bg-[#E3A64B]/15 text-[#E3A64B]"
                  : "border-line bg-background text-foreground/30"
              }`}
            >
              ★
            </button>
          ))}
        </div>
      </div>

      <label className="mt-5 block">
        <span className="text-xs font-semibold uppercase tracking-[0.14em] text-foreground/40">
          Comment <span className="font-normal normal-case tracking-normal text-foreground/30">optional</span>
        </span>
        <textarea
          value={comment}
          maxLength={1000}
          onChange={(event) => setComment(event.target.value)}
          placeholder="What did you like about it?"
          className="mt-2 min-h-24 w-full rounded-xl border border-line/80 bg-background px-3 py-3 text-sm outline-none focus:border-accent/50"
        />
      </label>

      {message ? (
        <p className="mt-4 rounded-xl border border-line/70 bg-background/60 px-3 py-3 text-sm text-foreground/65">
          {message}
        </p>
      ) : null}

      <button
        type="button"
        onClick={() => void submitReview()}
        disabled={!selectedProduct || reviewed || submitting}
        className="mt-4 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-[#C0472B] px-4 text-sm font-extrabold text-white disabled:cursor-not-allowed disabled:opacity-45"
      >
        {submitting ? "Submitting…" : reviewed ? "Review submitted" : "Submit review"}
      </button>

      <p className="mt-3 text-xs leading-5 text-foreground/38">
        Only customers with completed orders can submit reviews.
      </p>
    </section>
  );
}
