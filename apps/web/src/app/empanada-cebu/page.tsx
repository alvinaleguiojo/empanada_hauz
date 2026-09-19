import Link from "next/link";

const siteUrl = "https://empanadahauz.com";

export const metadata = {
  title: "Empanada Cebu | Fresh Empanadas for Pickup & Delivery",
  description:
    "Looking for empanada in Cebu? Order freshly made empanadas from Empanada Hauz for pickup or delivery.",
  alternates: { canonical: "/empanada-cebu" },
};

export default function EmpanadaCebuPage() {
  const faqs = [
    ["Where can I order empanadas in Cebu?", "You can order from Empanada Hauz online and choose your preferred pickup or delivery details."],
    ["Can I mix different empanada flavors?", "The online ordering flow lets you select the flavors and quantities you want for your box."],
    ["What is the minimum order?", "Empanada Hauz currently uses a 10-piece minimum order in the online ordering flow."],
  ];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(([question, answer]) => ({
      "@type": "Question",
      name: question,
      acceptedAnswer: { "@type": "Answer", text: answer },
    })),
  };

  return (
    <main className="min-h-screen bg-[#1C2941] px-5 py-12 text-[#F2E8D5]">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <article className="mx-auto max-w-4xl">
        <nav className="mb-8 flex flex-wrap gap-4 text-sm underline">
          <Link href="/">Home</Link><Link href="/menu">Menu</Link><Link href="/order">Order</Link>
        </nav>
        <h1 className="text-4xl font-bold sm:text-5xl">Fresh Empanadas in Cebu</h1>
        <p className="mt-5 max-w-3xl text-lg text-[#F2E8D5]/80">
          Looking for freshly made empanadas in Cebu? Empanada Hauz makes empanadas to order with different flavors available for pickup or delivery.
        </p>
        <section className="mt-12">
          <h2 className="text-2xl font-bold">Order Empanadas Online</h2>
          <p className="mt-3 text-[#F2E8D5]/80">Build your box, choose your flavors and quantities, then provide your pickup or delivery details.</p>
          <Link className="mt-6 inline-flex rounded-full bg-[#C0472B] px-6 py-3 font-bold text-white" href="/order">Order Empanadas</Link>
        </section>
        <section className="mt-12">
          <h2 className="text-2xl font-bold">Empanada Menu</h2>
          <p className="mt-3 text-[#F2E8D5]/80">Explore the current menu and available flavors.</p>
          <Link className="mt-4 inline-block underline" href="/menu">View the Empanada Menu →</Link>
        </section>
        <section className="mt-12">
          <h2 className="text-2xl font-bold">Empanada Delivery in Cebu</h2>
          <p className="mt-3 text-[#F2E8D5]/80">Check the delivery option during checkout and provide your complete address and landmark for an estimate.</p>
          <Link className="mt-4 inline-block underline" href="/empanada-delivery-cebu">Learn about Cebu delivery →</Link>
        </section>
        <section className="mt-12">
          <h2 className="text-2xl font-bold">Frequently Asked Questions</h2>
          <div className="mt-5 space-y-6">{faqs.map(([q, a]) => <div key={q}><h3 className="font-bold">{q}</h3><p className="mt-1 text-[#F2E8D5]/75">{a}</p></div>)}</div>
        </section>
      </article>
    </main>
  );
}
