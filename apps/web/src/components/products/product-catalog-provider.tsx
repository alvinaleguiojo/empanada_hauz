"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import {
  replaceMenuItems,
  replaceProductRatings,
  type ProductRatingSummary,
} from "@/lib/menu";

type Product = {
  name: string;
  description?: string | null;
  category?: string;
  price: number;
  available: boolean;
  tags?: string[];
  isFeatured?: boolean;
  isNew?: boolean;
  imageUrl?: string | null;
  sortOrder?: number;
};

type CatalogStatus = "loading" | "ready" | "error";

type ProductCatalogContextValue = {
  status: CatalogStatus;
};

const ProductCatalogContext = createContext<ProductCatalogContextValue>({
  status: "loading",
});

export function useProductCatalog() {
  return useContext(ProductCatalogContext);
}

export function ProductCatalogProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<CatalogStatus>("loading");

  useEffect(() => {
    let cancelled = false;

    const loadCatalog = async () => {
      try {
        const [products, ratings] = await Promise.all([
          apiFetch<Product[]>("/products"),
          apiFetch<ProductRatingSummary[]>("/products/reviews/summary"),
        ]);

        if (cancelled) return;
        if (!products.length) {
          setStatus("error");
          return;
        }

        replaceMenuItems(products);
        replaceProductRatings(ratings);
        setStatus("ready");
      } catch {
        if (!cancelled) setStatus("error");
      }
    };

    void loadCatalog();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo(() => ({ status }), [status]);

  return (
    <ProductCatalogContext.Provider value={value}>
      {children}
    </ProductCatalogContext.Provider>
  );
}

function RuntimeChildren({ version, children }: { version: number; children: React.ReactNode }) {
  return <div key={version} className="contents">{children}</div>;
}
