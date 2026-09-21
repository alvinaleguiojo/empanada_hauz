import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { API_URL } from "@/lib/config";
import {
  findSeoProduct,
  getSeoProducts,
  productSlug,
  resolveProductImage,
  safeJsonLd,
} from "@/lib/seo-products";

export const revalidate = 300;

type FlavorPageProps = {
  params: Promise<{ slug: string }>;
};

async function findProduct(slug: string) {
  return findSeoProduct(await getSeoProducts(), slug);
}

export async function generateMetadata({
  params,
}: FlavorPageProps): Promise<Metadata> {
  const { slug } = await params;
  const result = await findProduct(slug);

  if (!result) {
    return {
      title: "Empanada Flavor | Empanada Hauz",
      robots: { index: false, follow: true },
    };
  }

  const { product, canonicalSlug } = result;

  return {
    title: `${product.name} Cebu | Empanada Hauz`,
    description:
      (product.description || `${product.name} from Empanada Hauz.`) +
      ` Order online for pickup or delivery in Cebu at ₱${product.price}.`,
    alternates: { canonical: `/flavors/${canonicalSlug}` },
  };
}

export default async function FlavorPage({ params }: FlavorPageProps) {
  const { slug } = await params;
  const result = await findProduct(slug);

  if (!result) notFound();

  const { product, canonicalSlug } = result;

  if (slug !== canonicalSlug) {
    redirect(`/flavors/${canonicalSlug}`);
  }

  const siteUrl = "https://empanadahauz.com";
  const url = `${siteUrl}/flavors/${canonicalSlug}`;
  const image = resolveProductImage(
    product.imageUrl || product.imageUrls?.[0],
  );
  const reviews = await getProductReviews(canonicalSlug);

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description:
      product.description || `${product.name} from Empanada Hauz.`,
    url,
    image: image ? [image] : undefined,
    category: product.category,
    brand: { "@type": "Brand", name: "Empanada Hauz" },
    offers: {
      "@type": "Offer",
      url,
      price: product.price,
      priceCurrency: "PHP",
      availability:
        product.available === false
          ? "https://schema.org/OutOfStock"
          : "https://schema.org/InStock",
      itemCondition: "https://schema.org/NewCondition",
    },
    ...(reviews.reviewCount > 0 && reviews.ratingValue
      ? {
          aggregateRating: {
            "@type": "AggregateRating",
            ratingValue: reviews.ratingValue,
            reviewCount: reviews.reviewCount
          },
          review: reviews.reviews.slice(0, 10).map((review) => ({
            "@type": "Review",
            author: { "@type": "Person", name: review.reviewerName },
            reviewRating: {
              "@type": "Rating",
              ratingValue: review.rating,
              bestRating: 5,
              worstRating: 1
            },
            ...(review.comment ? { reviewBody: review.comment } : {}),
            datePublished: new Date(review.createdAt).toISOString()
          }))
        }
      : {}),
  };

  return (
    <main className="min-h-screen bg-[#1C2941] px-5 py-12 text-[#F2E8D5]">
      <article className="mx-auto max-w-3xl">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: safeJsonLd(jsonLd) }}
        />

        <nav className="mb-8 flex flex-wrap gap-4 text-sm underline">
          <Link href="/">Home</Link>
          <Link href="/menu">Menu</Link>
          <Link href="/empanada-cebu">Cebu</Link>
          <Link href="/order">Order</Link>
        </nav>

        {image ? (
          <img
            src={image}
            alt={`${product.name} empanada from Empanada Hauz`}
            className="mb-8 aspect-[16/9] w-full rounded-3xl object-cover"
          />
        ) : null}

        <h1 className="text-4xl font-bold sm:text-5xl">{product.name}</h1>

        <p className="mt-5 text-lg leading-8 text-[#F2E8D5]/80">
          {product.description || `${product.name} from Empanada Hauz.`} Order
          online for pickup or delivery in Cebu.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <span className="rounded-full border border-[#E3A64B]/40 px-3 py-1 font-semibold text-[#E3A64B]">
            ₱{product.price}
          </span>
          <span className="rounded-full border border-[#F2E8D5]/10 px-3 py-1 text-sm">
            {product.available === false ? "Currently unavailable" : "Available"}
          </span>
        </div>

        {product.tags?.length ? (
          <div className="mt-5 flex flex-wrap gap-2">
            {product.tags.map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-[#F2E8D5]/10 px-2.5 py-1 text-xs"
              >
                {tag}
              </span>
            ))}
          </div>
        ) : null}

        {reviews.reviewCount > 0 ? (
          <section className="mt-10 border-t border-[#F2E8D5]/10 pt-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#E3A64B]">Customer reviews</p>
                <h2 className="mt-2 text-2xl font-bold">What customers say</h2>
              </div>
              <div className="rounded-full border border-[#E3A64B]/30 bg-[#E3A64B]/10 px-3 py-1.5 text-sm font-semibold text-[#E3A64B]">
                ★ {reviews.ratingValue?.toFixed(1)} · {reviews.reviewCount} review{reviews.reviewCount === 1 ? "" : "s"}
              </div>
            </div>
            <div className="mt-5 grid gap-4">
              {reviews.reviews.map((review) => (
                <article key={review.id} className="rounded-2xl border border-[#F2E8D5]/10 bg-[#241c13]/55 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold">{review.reviewerName}</div>
                    <div className="text-sm tracking-[0.15em] text-[#E3A64B]">
                      {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}
                    </div>
                  </div>
                  {review.comment ? <p className="mt-3 text-sm leading-6 text-[#F2E8D5]/70">“{review.comment}”</p> : null}
                  <p className="mt-3 text-xs text-[#F2E8D5]/35">Verified completed order</p>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <Link
          className="mt-8 inline-flex rounded-full bg-[#C0472B] px-6 py-3 font-bold text-white"
          href="/order"
        >
          Order {product.name}
        </Link>
      </article>
    </main>
  );
}


async function getProductReviews(productKey: string) {
  try {
    const response = await fetch(
      `${API_URL}/products/${encodeURIComponent(productKey)}/reviews`,
      { next: { revalidate: 60 } }
    );

    if (!response.ok) {
      return { ratingValue: null, reviewCount: 0, reviews: [] as Array<{
        id: string;
        reviewerName: string;
        rating: number;
        comment: string | null;
        createdAt: string;
      }> };
    }

    return (await response.json()) as {
      ratingValue: number | null;
      reviewCount: number;
      reviews: Array<{
        id: string;
        reviewerName: string;
        rating: number;
        comment: string | null;
        createdAt: string;
      }>;
    };
  } catch {
    return { ratingValue: null, reviewCount: 0, reviews: [] };
  }
}
