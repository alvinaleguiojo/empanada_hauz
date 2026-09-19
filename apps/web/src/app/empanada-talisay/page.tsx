import Link from "next/link";

export const metadata = {
  title: "Empanada Talisay Cebu | Fresh Empanadas & Delivery",
  description:
    "Order freshly made empanadas from Empanada Hauz for customers in Talisay, Cebu. Check pickup and delivery availability online.",
  alternates: { canonical: "/empanada-talisay" },
};

export default function EmpanadaTalisayPage() {
  return (
    <main className="min-h-screen bg-[#1C2941] px-5 py-12 text-[#F2E8D5]">
      <article className="mx-auto max-w-4xl">
        <nav className="mb-8 flex flex-wrap gap-4 text-sm underline"><Link href="/">Home</Link><Link href="/menu">Menu</Link><Link href="/empanada-cebu">Cebu</Link><Link href="/order">Order</Link></nav>
        <h1 className="text-4xl font-bold sm:text-5xl">Empanada in Talisay, Cebu</h1>
        <p className="mt-5 max-w-3xl text-lg text-[#F2E8D5]/80">Order freshly made empanadas from Empanada Hauz and provide your preferred pickup or delivery details through the online ordering flow.</p>
        <h2 className="mt-12 text-2xl font-bold">Order Empanadas in Talisay</h2>
        <p className="mt-3 text-[#F2E8D5]/80">Choose the flavors and quantities you want, then enter your customer and delivery information.</p>
        <Link className="mt-8 inline-flex rounded-full bg-[#C0472B] px-6 py-3 font-bold text-white" href="/order">Order Empanadas</Link>
        <p className="mt-8 text-sm text-[#F2E8D5]/60">Delivery availability and estimated delivery charges depend on the address entered at checkout.</p>
      </article>
    </main>
  );
}
