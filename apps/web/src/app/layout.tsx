import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Montserrat, Open_Sans } from "next/font/google";
import { site } from "@/content/site";
import { publicConfig } from "@/lib/config";
import { AvailabilityProvider } from "@/components/AvailabilityProvider";
import { WaitlistProvider } from "@/components/WaitlistProvider";
import { AvailabilityBar } from "@/components/AvailabilityBar";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { StickyMobileCTA } from "@/components/StickyMobileCTA";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-montserrat",
});

const openSans = Open_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-open-sans",
});

export const metadata: Metadata = {
  title: {
    default: site.metadata.homeTitle,
    template: "%s | vygo.ai",
  },
  description: site.metadata.homeDescription,
  metadataBase: new URL("https://vygo.ai"),
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${montserrat.variable} ${openSans.variable}`}>
      <head>
        {/* Non-secret public config: identifies the Railway API origin the Vercel
            frontend targets (NEXT_PUBLIC_API_BASE_URL) for black-box verification. */}
        <meta name="vygo:api-base-url" content={publicConfig.apiBaseUrl} />
        <meta name="vygo:api-platform" content="railway" />
        <meta name="vygo:frontend-platform" content="vercel" />
      </head>
      <body className="min-h-screen bg-canvas font-body text-ink antialiased">
        <script
          id="vygo-public-config"
          type="application/json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(publicConfig) }}
        />
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <AvailabilityProvider>
          <WaitlistProvider>
            <AvailabilityBar />
            <SiteHeader />
            {children}
            <SiteFooter />
            <StickyMobileCTA />
          </WaitlistProvider>
        </AvailabilityProvider>
      </body>
    </html>
  );
}
