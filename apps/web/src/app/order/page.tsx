import CustomerKioskPage from "../customer/page";

export const metadata = {
  title: "Order Empanadas Online",
  description:
    "Build your Empanada Hauz box and order freshly made empanadas online for pickup or delivery in Cebu.",
  alternates: { canonical: "/order" },
  robots: { index: false, follow: true },
};

export default function OrderPage() {
  return <CustomerKioskPage />;
}
