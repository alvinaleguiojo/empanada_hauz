import type { Metadata } from "next";
import Link from "next/link";
import DeliveryFeeChecker from "@/components/delivery-fee-checker";

export const metadata: Metadata = {
  title: "Check Empanada Delivery Fee in Cebu | Empanada Hauz",
  description:
    "Check the estimated delivery fee from Empanada Hauz to your Cebu location before ordering. Enter your address or use your current location.",
  alternates: { canonical: "/delivery-fee" },
};

export default function DeliveryFeePage() {
  return (
    <main className="min-h-screen bg-[#1C2941] px-5 py-10 text-[#F2E8D5] sm:px-6 sm:py-12">
      <article className="mx-auto max-w-6xl">
        <nav className="mb-8 flex flex-wrap gap-4 text-sm underline">
          <Link href="/">Home</Link>
          <Link href="/menu">Menu</Link>
          <Link href="/empanada-delivery-cebu">Delivery</Link>
          <Link href="/order">Order</Link>
        </nav>

        <header>
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-[#E3A64B]">
            Cebu delivery
          </p>
          <h1 className="mt-2 max-w-4xl text-4xl font-extrabold sm:text-5xl">
            Check your Empanada Hauz delivery fee
          </h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-[#F2E8D5]/68 sm:text-lg">
            See an estimated route-based delivery fee to your location before you
            place an order.
          </p>
        </header>

        <DeliveryFeeChecker />

        <section className="mt-10 grid gap-5 md:grid-cols-3">
          <InfoCard
            title="Route-based estimate"
            text="The estimate uses the route distance from Empanada Hauz to your selected destination."
          />
          <InfoCard
            title="Use your address"
            text="Enter a complete address and an optional landmark for a more precise route."
          />
          <InfoCard
            title="Ready to order?"
            text="Once you know the estimated delivery cost, continue to the public ordering page."
          />
        </section>

        <section className="mt-10 rounded-3xl border border-[#F2E8D5]/10 bg-[#241c13]/60 p-6">
          <h2 className="text-2xl font-bold">Ordering in Cebu</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#F2E8D5]/66">
            Delivery availability and the final charge can depend on the exact
            destination and delivery arrangement. Use the quote as a guide, then
            confirm the details during checkout.
          </p>
          <div className="mt-5 flex flex-wrap gap-4 text-sm underline">
            <Link href="/empanada-delivery-cebu">How delivery works</Link>
            <Link href="/menu">View the menu</Link>
            <Link href="/order">Order empanadas online</Link>
          </div>
        </section>
      </article>
    </main>
  );
}

function InfoCard({ title, text }: { title: string; text: string }) {
  return (
    <div className="rounded-2xl border border-[#F2E8D5]/10 bg-[#241c13]/55 p-5">
      <h2 className="font-bold">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-[#F2E8D5]/58">{text}</p>
    </div>
  );
}
