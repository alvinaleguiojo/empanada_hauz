import Link from "next/link";
import CustomerKioskPage from "./customer/page";

const siteUrl = "https://empanadahauz.com";

function JsonLd() {
  const data = {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "FoodEstablishment",
        "@id": siteUrl + "/#business",
        name: "Empanada Hauz",
        url: siteUrl,
        menu: siteUrl + "/menu",
        servesCuisine: ["Filipino", "Empanadas"],
      },
      {
        "@type": "WebSite",
        "@id": siteUrl + "/#website",
        name: "Empanada Hauz",
        url: siteUrl,
      },
    ],
  };

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  );
}

export default function HomePage() {
  return (
    <>
      <JsonLd />
      <div className="sr-only">
        <h1>Fresh Empanadas in Cebu</h1>
        <p>
          Order freshly made empanadas in Cebu from Empanada Hauz. Choose your
          favorite flavors and order online for pickup or delivery.
        </p>
        <nav aria-label="Empanada Hauz">
          <Link href="/menu">Empanada Menu</Link>
          <Link href="/empanada-cebu">Empanada in Cebu</Link>
          <Link href="/empanada-delivery-cebu">Empanada Delivery Cebu</Link>
          <Link href="/empanada-talisay">Empanada Talisay</Link>
          <Link href="/delivery-fee">Check Delivery Fee</Link>
          <Link href="/order">Order Empanadas Online</Link>
        </nav>
      </div>
      <CustomerKioskPage />
    </>
  );
}
