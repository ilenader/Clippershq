import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { url: "https://clipershq.com", lastModified: new Date(), changeFrequency: "weekly", priority: 1 },
    { url: "https://clipershq.com/login", lastModified: new Date(), changeFrequency: "monthly", priority: 0.8 },
  ];
}
