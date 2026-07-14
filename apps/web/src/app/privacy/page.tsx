import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata = {
  title: "Privacy Policy — Empanada Hauz"
};

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-[#17110b] px-4 py-10 text-[#F2E8D5] sm:px-6">
      <div className="mx-auto max-w-2xl">
        <Link href="/" className="inline-flex items-center gap-2 text-sm text-[#E3A64B] hover:underline">
          <ArrowLeft size={16} /> Back to ordering
        </Link>

        <h1 className="mt-6 text-3xl font-bold text-[#F6EFDD] sm:text-4xl">Privacy Policy</h1>
        <p className="mt-2 text-sm text-[#F2E8D5]/50">Last updated: July 2026</p>

        <div className="mt-8 space-y-8 text-[15px] leading-relaxed text-[#F2E8D5]/85">
          <section>
            <p>
              Empanada Hauz (&quot;we&quot;, &quot;us&quot;) values your privacy. This policy explains what information we collect when you
              place an order through this site, how we use it, and the choices you have. It's written to comply with the
              Philippine Data Privacy Act of 2012 (RA 10173).
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#F6EFDD]">Information we collect</h2>
            <p className="mt-2">When you place an order, we collect:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[#F2E8D5]/80">
              <li>Your name</li>
              <li>Your contact number</li>
              <li>Your delivery or pickup address, and any landmark you provide</li>
              <li>The items, quantities, and delivery/payment preferences for your order</li>
              <li>Any optional notes you add to your order</li>
            </ul>
            <p className="mt-2">We don't require you to create an account or log in to place an order.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#F6EFDD]">How we use this information</h2>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[#F2E8D5]/80">
              <li>To prepare, process, and fulfill your order</li>
              <li>To coordinate delivery, including sharing your name, number, and address with our delivery partner (Maxim) when you choose delivery</li>
              <li>To contact you if there's an issue with your order (e.g. confirming details, delays, or delivery updates)</li>
              <li>To generate a tracking link so you can check your order status</li>
            </ul>
            <p className="mt-2">We do not sell your personal information, and we don't use it for marketing without your separate consent.</p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#F6EFDD]">Who we share it with</h2>
            <p className="mt-2">
              We share the minimum information necessary with our delivery partner (Maxim) to complete delivery orders. We do
              not share your information with any other third party except where required by law.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#F6EFDD]">How long we keep it</h2>
            <p className="mt-2">
              We retain order records for as long as needed for business, accounting, and legal purposes. If you'd like your
              information deleted sooner, you can contact us using the details below.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#F6EFDD]">Your rights</h2>
            <p className="mt-2">Under the Data Privacy Act, you have the right to:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-[#F2E8D5]/80">
              <li>Know what personal data we hold about you</li>
              <li>Request a copy, correction, or deletion of your data</li>
              <li>Withdraw consent for future processing (this won't affect orders already placed)</li>
              <li>File a complaint with the National Privacy Commission if you believe your rights have been violated</li>
            </ul>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#F6EFDD]">Security</h2>
            <p className="mt-2">
              We take reasonable technical and organizational measures to protect your information from unauthorized access,
              loss, or misuse.
            </p>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-[#F6EFDD]">Contact us</h2>
            <p className="mt-2">
              If you have questions about this policy or want to exercise your rights over your data, message us directly
              through our ordering page or our official contact channels.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
