import Link from "next/link";

export const metadata = {
  title: "Empanada Menu Cebu | Flavors | Empanada Hauz",
  description:
    "Explore the Empanada Hauz menu and choose your favorite empanada flavors before ordering online in Cebu.",
  alternates: { canonical: "/menu" },
};

const flavors = [
  ["Pork Empanada", "pork-empanada"],
  ["Pork with Egg Empanada", "pork-with-egg-empanada"],
  ["Ham & Cheese Empanada", "ham-and-cheese-empanada"],
  ["Chicken Empanada", "chicken-empanada"],
  ["Ube Empanada", "ube-empanada"],
  ["Choco Empanada", "choco-empanada"],
];

export default function MenuPage() {
  return (
    <main className="min-h-screen bg-[#1C2941] px-5 py-12 text-[#F2E8D5]">
      <article className="mx-auto max-w-4xl">
        <nav className="mb-8 flex flex-wrap gap-4 text-sm underline"><Link href="/">Home</Link><Link href="/empanada-cebu">Cebu</Link><Link href="/empanada-delivery-cebu">Delivery</Link><Link href="/order">Order</Link></nav>
        <h1 className="text-4xl font-bold sm:text-5xl">Empanada Menu</h1>
        <p className="mt-5 max-w-3xl text-lg text-[#F2E8D5]/80">Choose from the available Empanada Hauz flavors, then build your box online.</p>
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {flavors.map(([name, slug]) => (
            <Link key={slug} href={"/flavors/" + slug} className="rounded-2xl border border-[#F2E8D5]/10 bg-[#241c13]/70 p-5 hover:border-[#E3A64B]/50">
              <h2 className="text-xl font-bold">{name}</h2>
              <span className="mt-2 inline-block text-sm underline">View flavor →</span>
            </Link>
          ))}
        </div>
        <Link className="mt-10 inline-flex rounded-full bg-[#C0472B] px-6 py-3 font-bold text-white" href="/order">Build Your Box</Link>
      </article>
    </main>
  );
}
