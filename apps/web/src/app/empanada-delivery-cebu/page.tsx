import Link from "next/link";

export const metadata = {
  title: "Empanada Delivery Cebu | Order Online",
  description:
    "Order freshly made empanadas for delivery in Cebu from Empanada Hauz. Choose flavors, quantities and delivery details online.",
  alternates: { canonical: "/empanada-delivery-cebu" },
};

export default function EmpanadaDeliveryCebuPage() {
  return (
    <main className="min-h-screen bg-[#1C2941] px-5 py-12 text-[#F2E8D5]">
      <article className="mx-auto max-w-4xl">
        <nav className="mb-8 flex flex-wrap gap-4 text-sm underline"><Link href="/">Home</Link><Link href="/menu">Menu</Link><Link href="/empanada-cebu">Cebu</Link><Link href="/order">Order</Link></nav>
        <h1 className="text-4xl font-bold sm:text-5xl">Empanada Delivery in Cebu</h1>
        <p className="mt-5 max-w-3xl text-lg text-[#F2E8D5]/80">Order freshly made empanadas from Empanada Hauz and provide your delivery address during checkout.</p>
        <h2 className="mt-12 text-2xl font-bold">How to Order</h2>
        <ol className="mt-4 list-decimal space-y-2 pl-6 text-[#F2E8D5]/80">
          <li>Choose your empanada flavors.</li><li>Select your quantities.</li><li>Select Delivery and enter your address.</li><li>Review your order and payment details.</li><li>Place your order online.</li>
        </ol>
        <h2 className="mt-12 text-2xl font-bold">For Parties, Offices & Events</h2>
        <p className="mt-3 text-[#F2E8D5]/80">Empanadas can be ordered as individual snacks or for group occasions. Use the online ordering flow to choose the quantity and flavors you need.</p>
        <div className="mt-8 flex flex-wrap gap-3"><Link className="inline-flex rounded-full border border-[#F2E8D5]/15 bg-[#F2E8D5]/5 px-5 py-3 font-bold text-[#F2E8D5] transition hover:bg-[#F2E8D5]/10" href="/delivery-fee">Check Delivery Fee</Link><Link className="inline-flex rounded-full bg-[#C0472B] px-6 py-3 font-bold text-white" href="/order">Order for Delivery</Link></div>
      </article>
    </main>
  );
}
