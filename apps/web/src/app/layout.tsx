import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Montserrat, Open_Sans } from "next/font/google";
import { site } from "@/content/site";
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
      <body className="min-h-screen bg-canvas font-body text-ink antialiased">
        <a href="#main-content" className="skip-link">
          Skip to content
        </a>
        <AvailabilityBar />
        <SiteHeader />
        {children}
        <SiteFooter />
        <StickyMobileCTA />
      </body>
    </html>
  );
}
