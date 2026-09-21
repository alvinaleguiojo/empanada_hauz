import type { Metadata } from "next";
import ProductReviewsAdmin from "@/components/product-reviews-admin";

export const metadata: Metadata = {
  title: "Product Reviews | Empanada Hauz",
  robots: { index: false, follow: false }
};

export default function ProductReviewsPage() {
  return <ProductReviewsAdmin />;
}
