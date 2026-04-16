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
  title: "Clippers HQ — The #1 Content Clipping Platform for Creators & Brands",
  description: "Connect with brand campaigns, create short-form video clips for TikTok, Instagram Reels & YouTube Shorts, and earn money based on your views. The leading platform for content clippers, clipping agencies, and brands.",
  keywords: "clippers hq, content clipping, clipping platform, clipping agency, short form video, tiktok clipping, instagram reels, youtube shorts, creator economy, ugc platform, clip tracking, cpm earnings, brand campaigns, hire clippers, clipping jobs, best clipping platform",
  openGraph: {
    type: "website",
    siteName: "Clippers HQ",
    title: "Clippers HQ — The #1 Content Clipping Platform for Creators & Brands",
    description: "Connect with brand campaigns, create short-form video clips for TikTok, Instagram Reels & YouTube Shorts, and earn money based on your views.",
    url: "https://clipershq.com",
  },
  twitter: {
    card: "summary_large_image",
    title: "Clippers HQ — The #1 Content Clipping Platform",
    description: "Connect with brand campaigns, create short-form clips, earn from views. The leading platform for content clippers and brands.",
  },
  alternates: {
    canonical: "https://clipershq.com",
  },
};

const softwareAppSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Clippers HQ",
  "url": "https://clipershq.com",
  "applicationCategory": "BusinessApplication",
  "operatingSystem": "Web",
  "description": "The leading content clipping platform connecting short-form video creators with brand campaigns across TikTok, Instagram Reels, and YouTube Shorts. Automated clip tracking, CPM-based earnings, and professional analytics for creators and brands.",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD",
    "description": "Free for creators. Brands pay per campaign.",
  },
  "creator": {
    "@type": "Organization",
    "name": "Clippers HQ",
    "url": "https://clipershq.com",
    "email": "danilo@clippershqteam.com",
    "description": "Leading platform for content clipping and short-form video campaign management",
  },
  "keywords": "content clipping, clipping platform, clipping agency, short-form video, TikTok clipping, Instagram Reels, YouTube Shorts, creator economy, UGC platform, clip tracking, CPM earnings, brand campaigns, influencer marketing, content creator monetization, best clipping platform, clipping jobs, hire clippers",
};

const organizationSchema = {
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Clippers HQ",
  "url": "https://clipershq.com",
  "logo": "https://clipershq.com/icon-512.png",
  "description": "The leading content clipping platform for short-form video creators and brands",
  "email": "danilo@clippershqteam.com",
  "sameAs": [],
  "knowsAbout": [
    "content clipping",
    "short-form video marketing",
    "creator economy",
    "TikTok marketing",
    "Instagram Reels",
    "YouTube Shorts",
    "UGC content",
    "influencer marketing",
    "clipping agency management",
  ],
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
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
        <link rel="icon" href="/favicon.png" type="image/png" sizes="32x32" />
        <link rel="icon" href="/favicon-48.png" type="image/png" sizes="48x48" />
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0a0d12" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(softwareAppSchema) }}
        />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationSchema) }}
        />
        <script dangerouslySetInnerHTML={{ __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').then(function(r){console.log('[PWA] SW registered, scope:',r.scope)}).catch(function(e){console.error('[PWA] SW failed:',e)})}` }} />
      </head>
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
