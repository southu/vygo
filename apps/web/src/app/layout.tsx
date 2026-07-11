import type { Metadata } from "next";
import type { ReactNode } from "react";
import { brand } from "@vygo/ui";
import "./globals.css";

export const metadata: Metadata = {
  title: "vygo — Production engineering for AI-built software",
  description: brand.tagline,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
