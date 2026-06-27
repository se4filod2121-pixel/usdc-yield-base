import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "@coinbase/onchainkit/styles.css";
import "./globals.css";
import { Providers } from "./providers";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
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
        url: "https://placehold.co/1200x630/0052FF/ffffff?text=USDC+Yield+on+Base",
        width: 1200,
        height: 630,
        alt: "USDC Yield on Base",
      },
    ],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "USDC Yield on Base",
    description: "Earn on-chain yield on your USDC with Morpho vaults on Base mainnet.",
    images: ["https://placehold.co/1200x630/0052FF/ffffff?text=USDC+Yield+on+Base"],
  },
  other: {
    google: "notranslate",
    "base:app_id": "6a405c6b7590957b7706bafe",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      translate="no"
      className="notranslate"
      suppressHydrationWarning
    >
      <body
        className={`notranslate ${geistSans.variable} ${geistMono.variable}`}
        translate="no"
        suppressHydrationWarning
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
