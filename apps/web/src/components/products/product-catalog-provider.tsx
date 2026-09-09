"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { replaceMenuItems } from "@/lib/menu";

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

export function ProductCatalogProvider({ children }: { children: React.ReactNode }) {
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void apiFetch<Product[]>("/products")
      .then((products) => {
        if (cancelled || !products.length) return;
        replaceMenuItems(products);
        setVersion((current) => current + 1);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  return <>{version === 0 ? children : <RuntimeChildren version={version}>{children}</RuntimeChildren>}</>;
}

function RuntimeChildren({ version, children }: { version: number; children: React.ReactNode }) {
  return <div key={version} className="contents">{children}</div>;
}
