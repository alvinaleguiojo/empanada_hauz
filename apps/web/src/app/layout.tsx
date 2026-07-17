import "./globals.css";
import { ThemeScript } from "@/components/layout/theme-script";
import SplashScreen from '@/components/SplashScreen';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body>
        <SplashScreen>
        <ThemeScript />
        {children}
        </SplashScreen>
      </body>
    </html>
  );
}

export const metadata = {
  title: "Empanada Hauz | Fresh Empanadas Delivery & Pickup",
  description: "Order fresh, authentic empanadas online. Pork, Chicken, Beef, Ube Cheese & more. Fast delivery or pickup. Minimum 10 pieces.",
  keywords: ["empanada", "empanadas", "empanada delivery", "fresh empanadas", "ube empanada", "pork empanada", "beef empanada", "Filipino food"],
  openGraph: {
    title: "Empanada Hauz - Fresh from the Pan",
    description: "Handcrafted empanadas delivered hot to your door.",
    images: [{ url: "/og-image.jpg", width: 1200, height: 630, alt: "Empanada Hauz" }],
    locale: "en_PH",
    type: "website",
  },
  icons: {
    icon: "/empanada hauz logo.jpg",
  },
};
