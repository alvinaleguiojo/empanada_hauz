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
  title: "Empanada Hauz",
  description: "Fresh and delicious empanadas",
  icons: {
    icon: "/empanada hauz logo.jpg",
    shortcut: "/empanada hauz logo.jpg",
    apple: "/empanada hauz logo.jpg",
  },
};
