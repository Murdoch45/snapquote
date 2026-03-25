import Link from "next/link";
import { Manrope } from "next/font/google";
import { BrandLogo } from "@/components/BrandLogo";

const manrope = Manrope({
  subsets: ["latin"]
});

export default function PrivacyPage() {
  return (
    <main className={`${manrope.className} min-h-screen bg-white text-slate-900`}>
      <nav className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-20 max-w-6xl items-center px-6 sm:px-8">
          <Link href="/" className="inline-flex items-center gap-3">
            <BrandLogo size="sm" showWordmark={false} />
            <span className="text-2xl font-bold tracking-tight text-slate-900">SnapQuote</span>
          </Link>
        </div>
      </nav>

      <div className="mx-auto max-w-4xl px-6 py-16 sm:px-8">
        <p className="text-sm font-medium text-slate-500">Last updated: March 2026</p>
        <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-900">
          Privacy Policy
        </h1>

        <div className="mt-10 space-y-10 text-[15px] leading-8 text-slate-700">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">1. Introduction</h2>
            <p>
              SnapQuote (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) operates snapquote.us.
              This policy explains how we collect, use, and protect your information.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">2. Information We Collect</h2>
            <p>
              We collect information from contractors, including name, email, business name,
              phone number, address, and payment information processed by Stripe.
            </p>
            <p>
              We collect information from customers submitting job requests, including name,
              email, phone number, property address, photos of the property, and answers to
              service questions.
            </p>
            <p>
              We also collect certain information automatically, such as usage data, IP
              addresses, and browser type.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">3. How We Use Your Information</h2>
            <p>We use your information to provide and operate the SnapQuote platform.</p>
            <p>We use your information to generate AI-powered job estimates using OpenAI.</p>
            <p>
              We use your information to send estimates and communications via email
              through Resend and SMS through Twilio.
            </p>
            <p>We use your information to process payments via Stripe.</p>
            <p>We use your information to improve the service.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">4. Third-Party Services</h2>
            <p>
              We share data with the following third parties to operate the service:
            </p>
            <ul className="space-y-2 pl-5 text-slate-700">
              <li>Stripe (payment processing) — stripe.com/privacy</li>
              <li>Supabase (database and authentication) — supabase.com/privacy</li>
              <li>OpenAI (AI estimate generation) — openai.com/privacy</li>
              <li>Twilio (SMS delivery) — twilio.com/legal/privacy</li>
              <li>Resend (email delivery) — resend.com/privacy</li>
              <li>Google Maps (address verification) — policies.google.com/privacy</li>
              <li>Cloudflare (bot protection) — cloudflare.com/privacypolicy</li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">5. Data Retention</h2>
            <p>
              We retain your data for as long as your account is active. You may request
              deletion by contacting us.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">6. California Privacy Rights (CCPA)</h2>
            <p>
              California residents have the right to know what personal data we collect,
              request deletion, and opt out of sale. We do not sell personal data. To
              exercise your rights, contact support@snapquote.us.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">7. Cookies</h2>
            <p>We use cookies for authentication and session management only.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">8. Children&apos;s Privacy</h2>
            <p>SnapQuote is not intended for users under 18.</p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">9. Changes to This Policy</h2>
            <p>
              We may update this policy and will notify users of significant changes.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-slate-900">10. Contact</h2>
            <p>
              <a
                href="mailto:support@snapquote.us"
                className="font-medium text-[#2563EB] hover:text-[#1D4ED8]"
              >
                support@snapquote.us
              </a>
            </p>
          </section>
        </div>
      </div>
    </main>
  );
}
