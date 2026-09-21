import Link from "next/link";
import type { Metadata } from "next";
import type { Route } from "next";
import {
  getSeoProducts,
  productSlug,
  resolveProductImage,
  safeJsonLd,
} from "@/lib/seo-products";

export const metadata: Metadata = {
  title: "Empanada Menu Cebu | Flavors, Prices & Ordering | Empanada Hauz",
  description:
    "Explore the current Empanada Hauz menu in Cebu, including flavors, prices, descriptions, availability, and online ordering for pickup or delivery.",
  alternates: { canonical: "/menu" },
};

export const revalidate = 300;

export default async function MenuPage() {
  const [products, ratings] = await Promise.all([
    getSeoProducts(),
    getProductRatingSummaries(),
  ]);
  const ratingByProduct = new Map(ratings.map((rating) => [rating.productKey, rating]));

  const menuJsonLd = {
    "@context": "https://schema.org",
    "@type": "Menu",
    name: "Empanada Hauz Menu",
    url: "https://empanadahauz.com/menu",
    hasMenuSection: [
      {
        "@type": "MenuSection",
        name: "Empanadas",
        hasMenuItem: products.map((product) => ({
          "@type": "MenuItem",
          name: product.name,
          description: product.description || undefined,
          image: resolveProductImage(product.imageUrl || product.imageUrls?.[0]) || undefined,
          offers: {
            "@type": "Offer",
            price: product.price,
            priceCurrency: "PHP",
            availability:
              product.available === false
                ? "https://schema.org/OutOfStock"
                : "https://schema.org/InStock",
          },
        })),
      },
    ],
  };

  return (
    <main className="min-h-screen bg-[#1C2941] px-5 py-12 text-[#F2E8D5]">
      <article className="mx-auto max-w-5xl">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(menuJsonLd) }}
        />

        <nav className="mb-8 flex flex-wrap gap-4 text-sm underline">
          <Link href="/">Home</Link>
          <Link href="/empanada-cebu">Cebu</Link>
          <Link href="/empanada-delivery-cebu">Delivery</Link>
          <Link href="/order">Order</Link>
        </nav>

        <h1 className="text-4xl font-bold sm:text-5xl">Empanada Menu</h1>
        <p className="mt-5 max-w-3xl text-lg text-[#F2E8D5]/80">
          Explore the current Empanada Hauz menu, with catalog information for
          flavors, prices, descriptions, and availability. Choose your favorites,
          then build your box online for pickup or delivery in Cebu.
        </p>

        {products.length > 0 ? (
          <div className="mt-10 grid gap-5 sm:grid-cols-2">
            {products.map((product) => {
              const slug = productSlug(product.name);
              const image = resolveProductImage(
                product.imageUrl || product.imageUrls?.[0],
              );
              const soldOut = product.available === false;
              const rating = ratingByProduct.get(productSlug(product.name));

              return (
                <article
                  key={product._id ?? product.name}
                  className="overflow-hidden rounded-2xl border border-[#F2E8D5]/10 bg-[#241c13]/70"
                >
                  <div className="relative">
                  {image ? (
                    <img
                      src={image}
                      alt={`${product.name} empanada from Empanada Hauz`}
                      className="aspect-[16/9] w-full object-cover"
                    />
                  ) : null}
                  {rating ? (
                    <div className="absolute bottom-3 left-3 inline-flex items-center gap-1 rounded-full border border-[#E3A64B]/30 bg-[#1a140d]/90 px-2.5 py-1 text-xs font-bold text-[#E3A64B] backdrop-blur">
                      <span aria-hidden="true">★</span> {rating.ratingValue.toFixed(1)} ({rating.reviewCount})
                    </div>
                  ) : null}
                  </div>

                  <div className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-xl font-bold">{product.name}</h2>
                        <p className="mt-2 text-sm leading-6 text-[#F2E8D5]/65">
                          {product.description ||
                            `Freshly made ${product.name} from Empanada Hauz.`}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1.5">
                        <span className="font-semibold text-[#E3A64B]">₱{product.price}</span>
                        {rating ? (
                          <span className="inline-flex items-center gap-1 rounded-full border border-[#E3A64B]/20 bg-[#E3A64B]/8 px-2 py-1 text-[10px] font-bold text-[#E3A64B]">
                            ★ {rating.ratingValue.toFixed(1)} ({rating.reviewCount})
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
                      <span className="rounded-full border border-[#F2E8D5]/10 px-2.5 py-1">
                        {soldOut ? "Currently unavailable" : "Available"}
                      </span>
                      {product.category ? (
                        <span className="rounded-full border border-[#F2E8D5]/10 px-2.5 py-1 capitalize">
                          {product.category}
                        </span>
                      ) : null}
                      {product.isNew ? (
                        <span className="rounded-full border border-[#7A9B4E]/40 px-2.5 py-1 text-[#c9dba6]">
                          New
                        </span>
                      ) : null}
                      {product.isFeatured ? (
                        <span className="rounded-full border border-[#E3A64B]/40 px-2.5 py-1 text-[#E3A64B]">
                          Featured
                        </span>
                      ) : null}
                    </div>

                    <Link
                      href={(`/flavors/${slug}`) as Route}
                      className="mt-5 inline-block text-sm font-semibold underline"
                    >
                      View {product.name} →
                    </Link>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="mt-10 rounded-2xl border border-dashed border-[#F2E8D5]/15 bg-[#241c13]/50 p-8">
            <h2 className="text-xl font-bold">Menu temporarily unavailable</h2>
            <p className="mt-2 text-sm text-[#F2E8D5]/65">
              Please use the order page to check the latest available products.
            </p>
          </div>
        )}

        <div className="mt-12 rounded-2xl border border-[#F2E8D5]/10 bg-[#241c13]/55 p-6">
          <h2 className="text-2xl font-bold">Empanada Delivery in Cebu</h2>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#F2E8D5]/70">
            Empanada Hauz offers freshly made empanadas for pickup or delivery in Cebu.
            Choose your flavors and quantities, then place your order online.
          </p>
          <div className="mt-5 flex flex-wrap gap-4 text-sm underline">
            <Link href="/empanada-cebu">Empanada in Cebu</Link>
            <Link href="/empanada-delivery-cebu">Empanada Delivery Cebu</Link>
            <Link href="/empanada-talisay">Empanada Talisay</Link>
            <Link href="/delivery-fee">Check Delivery Fee</Link>
            <Link href="/order">Order Empanadas Online</Link>
          </div>
        </div>

        <Link
          className="mt-8 inline-flex rounded-full bg-[#C0472B] px-6 py-3 font-bold text-white"
          href="/order"
        >
          Build Your Box
        </Link>
      </article>
    </main>
  );
}
