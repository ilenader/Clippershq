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
  applicationName: "Clippers HQ",
  title: "Clippers HQ — Get Paid to Clip",
  description: "The #1 platform for content clippers. Join campaigns, create short-form clips for TikTok, Instagram & YouTube, and earn real money from your views.",
  keywords: "clippers hq, content clipping, clipping platform, clipping agency, short form video, tiktok clipping, instagram reels, youtube shorts, creator economy, ugc platform, clip tracking, cpm earnings, brand campaigns, hire clippers, clipping jobs, best clipping platform",
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: { url: "/icon-192.png", sizes: "192x192" },
  },
  openGraph: {
    type: "website",
    siteName: "Clippers HQ",
    title: "Clippers HQ — Get Paid to Clip",
    description: "The #1 platform for content clippers. Join campaigns, create short-form clips for TikTok, Instagram & YouTube, and earn real money from your views.",
    url: "https://clipershq.com",
    images: [{ url: "https://clipershq.com/icon-512.png", width: 512, height: 512 }],
  },
  twitter: {
    card: "summary",
    title: "Clippers HQ — Get Paid to Clip",
    description: "Join campaigns, create clips, earn money. The #1 clipping platform.",
    images: ["https://clipershq.com/icon-512.png"],
  },
  robots: {
    index: true,
    follow: true,
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

const websiteSchema = {
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Clippers HQ",
  "url": "https://clipershq.com",
  "description": "The #1 platform for content clippers. Join campaigns, create clips, earn money.",
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
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover" />
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
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteSchema) }}
        />
        <script dangerouslySetInnerHTML={{ __html: `if('serviceWorker' in navigator){navigator.serviceWorker.register('/sw.js').then(function(r){console.log('[PWA] SW registered, scope:',r.scope)}).catch(function(e){console.error('[PWA] SW failed:',e)})}` }} />
      </head>
      <body className="min-h-screen antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
