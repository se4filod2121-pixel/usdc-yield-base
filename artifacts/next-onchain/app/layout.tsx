import type { Metadata } from "next";
import { headers } from "next/headers";
import { Geist, Geist_Mono } from "next/font/google";
import "@coinbase/onchainkit/styles.css";
import "./globals.css";
import { Providers } from "./providers";
import { detectLocale } from "../lib/i18n";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://onbase-finance.vercel.app"),
  title: "USDC Yield on Base",
  description:
    "Earn on-chain yield on your USDC with Morpho vaults on Base mainnet. Compare live APYs and deposit in one tap.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
  openGraph: {
    title: "USDC Yield on Base",
    description: "Earn on-chain yield on your USDC with Morpho vaults on Base mainnet.",
    url: "https://onbase-finance.vercel.app",
    siteName: "USDC Yield on Base",
    images: [
      {
        url: "/opengraph.jpg",
        width: 1280,
        height: 720,
        alt: "USDC Yield on Base",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "USDC Yield on Base",
    description: "Earn on-chain yield on your USDC with Morpho vaults on Base mainnet.",
    images: ["/opengraph.jpg"],
  },
  other: {
    google: "notranslate",
    "base:app_id": "6a405c6b7590957b7706bafe",
  },
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const headersList = await headers();
  const locale = detectLocale(headersList.get("accept-language"));

  return (
    <html
      lang={locale}
      translate="no"
      className="notranslate"
      suppressHydrationWarning
    >
      <body
        className={`notranslate base-dark ${geistSans.variable} ${geistMono.variable}`}
        translate="no"
        suppressHydrationWarning
      >
        <Providers initialLocale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
