import "./globals.css";
import { ThemeScript } from "@/components/layout/theme-script";
import CustomerGooglePlacesAutocomplete from "@/components/CustomerGooglePlacesAutocomplete";
import { ProductCatalogProvider } from "@/components/products/product-catalog-provider";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body>
        <ThemeScript />
        <CustomerGooglePlacesAutocomplete />
        <ProductCatalogProvider>{children}</ProductCatalogProvider>
      </body>
    </html>
  );
}

export const metadata = {
  metadataBase: new URL("https://empanadahauz.com"),
  title: "Empanada Hauz | Fresh Empanadas Delivery & Pickup",
  description: "Order fresh, authentic Filipino-style empanadas online. Pork, Chicken, Beef, Ube Cheese & more. Fast delivery or pickup. Minimum 10 pieces.",
  keywords: ["empanada", "empanadas", "empanada delivery", "fresh empanadas", "ube empanada", "pork empanada", "beef empanada", "Filipino food", "manila empanada"],
  authors: [{ name: "Empanada Hauz" }],
  openGraph: {
    title: "Empanada Hauz - Fresh from the Pan",
    description: "Handcrafted empanadas delivered hot to your door.",
    images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: "Empanada Hauz Fresh Empanadas" }],
    locale: "en_PH",
    type: "website",
    siteName: "Empanada Hauz"
  },
  twitter: {
    card: "summary_large_image",
    title: "Empanada Hauz | Fresh Empanadas",
    description: "Order delicious empanadas online - fast delivery available."
  },
  icons: {
    icon: "/empanada hauz logo.jpg",
    shortcut: "/empanada hauz logo.jpg",
    apple: "/empanada hauz logo.jpg"
  }
};
