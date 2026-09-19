import Link from "next/link";
import { notFound } from "next/navigation";

const products: Record<string, { name: string; description: string }> = {
  "pork-empanada": { name: "Pork Empanada", description: "A savory pork empanada from Empanada Hauz." },
  "pork-with-egg-empanada": { name: "Pork with Egg Empanada", description: "A savory pork and egg empanada from Empanada Hauz." },
  "ham-and-cheese-empanada": { name: "Ham & Cheese Empanada", description: "A savory ham and cheese empanada from Empanada Hauz." },
  "chicken-empanada": { name: "Chicken Empanada", description: "A savory chicken empanada from Empanada Hauz." },
  "ube-empanada": { name: "Ube Empanada", description: "A sweet ube empanada from Empanada Hauz." },
  "choco-empanada": { name: "Choco Empanada", description: "A sweet chocolate empanada from Empanada Hauz." },
};

export function generateStaticParams() {
  return Object.keys(products).map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = products[slug];
  if (!product) return {};
  return {
    title: product.name + " Cebu",
    description: product.description + " Order online for pickup or delivery in Cebu.",
    alternates: { canonical: "/flavors/" + slug },
  };
}

export default async function FlavorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const product = products[slug];
  if (!product) notFound();

  const siteUrl = "https://empanadahauz.com";
  const url = siteUrl + "/flavors/" + slug;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description,
    url,
    brand: { "@type": "Brand", name: "Empanada Hauz" },
  };

  return (
    <main className="min-h-screen bg-[#1C2941] px-5 py-12 text-[#F2E8D5]">
      <article className="mx-auto max-w-3xl">
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
        <nav className="mb-8 flex flex-wrap gap-4 text-sm underline"><Link href="/">Home</Link><Link href="/menu">Menu</Link><Link href="/empanada-cebu">Cebu</Link><Link href="/order">Order</Link></nav>
        <h1 className="text-4xl font-bold sm:text-5xl">{product.name}</h1>
        <p className="mt-5 text-lg text-[#F2E8D5]/80">{product.description} Order online for pickup or delivery in Cebu.</p>
        <Link className="mt-8 inline-flex rounded-full bg-[#C0472B] px-6 py-3 font-bold text-white" href="/order">Order {product.name}</Link>
      </article>
    </main>
  );
}
