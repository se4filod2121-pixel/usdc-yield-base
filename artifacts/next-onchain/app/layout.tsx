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
  title: "OnchainKit App",
  description: "Base mainnet wallet connect",
  // Instructs Google's crawler (and Chrome's translate bar) not to translate
  // this page, preventing injected non-ASCII characters from breaking fetch headers.
  other: {
    google: "notranslate",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning on <html>: browser extensions (e.g. translators)
    // can rewrite lang="en" before React hydrates — suppress that diff.
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
