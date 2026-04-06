import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://clipershq.com"),
  title: {
    default: "Clippers HQ — Content Clipping Agency for Creators & Brands",
    template: "%s — Clippers HQ",
  },
  description: "Professional content clipping agency. We extract, edit, and distribute your best moments across TikTok, Instagram Reels, and YouTube Shorts. Trusted by streamers and creators.",
  keywords: "content clipping agency, clip management, gaming clips, streamer clips, short-form content, TikTok clipping, content repurposing",
  openGraph: {
    type: "website",
    siteName: "Clippers HQ",
    title: "Clippers HQ — Content Clipping Agency for Creators & Brands",
    description: "Professional content clipping agency. Manage clips, campaigns, and payouts — all in one platform.",
    url: "https://clipershq.com",
  },
  twitter: {
    card: "summary_large_image",
    title: "Clippers HQ — Content Clipping Agency",
    description: "Professional content clipping agency for creators and brands.",
  },
  alternates: {
    canonical: "https://clipershq.com",
  },
  other: {
    "script:ld+json": JSON.stringify({
      "@context": "https://schema.org",
      "@type": "Organization",
      "name": "Clippers HQ",
      "url": "https://clipershq.com",
      "description": "Professional content clipping agency for creators and brands",
    }),
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
      className={`${geistSans.variable} ${geistMono.variable} dark`}
      suppressHydrationWarning
    >
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0a0d12" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/landing/logo/logo.png" />
        <script dangerouslySetInnerHTML={{ __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js')}` }} />
      </head>
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
