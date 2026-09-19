import type { Metadata } from "next";
import "./globals.css";
import { ThemeScript } from "@/components/layout/theme-script";
import CustomerGooglePlacesAutocomplete from "@/components/CustomerGooglePlacesAutocomplete";
import { NetworkStatusToast } from "@/components/network-status-toast";
import { ProductCatalogProvider } from "@/components/products/product-catalog-provider";

const siteUrl = "https://empanadahauz.com";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "Fresh Empanadas in Cebu | Empanada Hauz",
    template: "%s | Empanada Hauz",
  },
  description:
    "Order freshly made empanadas in Cebu from Empanada Hauz. Choose your favorite flavors and order online for pickup or delivery.",
  keywords: [
    "empanada Cebu",
    "empanada delivery Cebu",
    "empanada Talisay",
    "fresh empanadas Cebu",
    "empanada delivery",
    "pork empanada",
    "pork with egg empanada",
    "ham and cheese empanada",
  ],
  authors: [{ name: "Empanada Hauz" }],
  alternates: { canonical: "/" },
  openGraph: {
    title: "Fresh Empanadas in Cebu | Empanada Hauz",
    description:
      "Freshly made empanadas in Cebu. Choose your favorite flavors and order online for pickup or delivery.",
    url: siteUrl,
    images: [
      {
        url: "/og-image.jpg",
        width: 1200,
        height: 630,
        alt: "Empanada Hauz fresh empanadas",
      },
    ],
    locale: "en_PH",
    type: "website",
    siteName: "Empanada Hauz",
  },
  twitter: {
    card: "summary_large_image",
    title: "Fresh Empanadas in Cebu | Empanada Hauz",
    description:
      "Order freshly made empanadas in Cebu for pickup or delivery.",
  },
  icons: {
    icon: "/empanada hauz logo.jpg",
    shortcut: "/empanada hauz logo.jpg",
    apple: "/empanada hauz logo.jpg",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body>
        <ThemeScript />
        <CustomerGooglePlacesAutocomplete />
        <NetworkStatusToast />
        <ProductCatalogProvider>{children}</ProductCatalogProvider>
      </body>
    </html>
  );
}
