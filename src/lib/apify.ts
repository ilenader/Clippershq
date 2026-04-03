/**
 * Apify integration for fetching TikTok and Instagram video/post stats.
 * Uses Apify Actor API to scrape public post data.
 *
 * Actors:
 *   TikTok:    clockworks/tiktok-scraper
 *   Instagram: apify/instagram-reel-scraper
 *
 * IMPORTANT: APIFY_API_KEY must NEVER be exposed to frontend.
 * This module runs server-side only.
 */

const APIFY_BASE = "https://api.apify.com/v2";

/** Apify actor names use username/actor-name but API URL needs username~actor-name */
function encodeActorName(actor: string): string {
  return actor.replace("/", "~");
}

function getApiKey(): string {
  const key = process.env.APIFY_API_KEY;
  if (!key) throw new Error("APIFY_API_KEY is not set");
  return key;
}

function getTikTokActor(): string {
  return process.env.APIFY_TIKTOK_ACTOR || "clockworks/tiktok-scraper";
}

function getInstagramActor(): string {
  return process.env.APIFY_INSTAGRAM_ACTOR || "apify/instagram-reel-scraper";
}

export interface ClipStats {
  views: number;
  likes: number;
  comments: number;
  shares: number;
  createdAt: string | null;
  platform: string;
  raw?: any; // full response for debugging
}

/**
 * Detect platform from URL
 */
export function detectPlatform(url: string): "tiktok" | "instagram" | null {
  const lower = url.toLowerCase();
  if (lower.includes("tiktok.com")) return "tiktok";
  if (lower.includes("instagram.com") || lower.includes("instagr.am")) return "instagram";
  return null;
}

/**
 * Fetch stats for a TikTok video using Apify actor.
 */
async function fetchTikTokStats(videoUrl: string): Promise<ClipStats> {
  const apiKey = getApiKey();
  const actor = getTikTokActor();

  // Run the actor synchronously (waits for result)
  const runUrl = `${APIFY_BASE}/acts/${encodeActorName(actor)}/run-sync-get-dataset-items?token=${apiKey}`;

  const res = await fetch(runUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      postURLs: [videoUrl],
      resultsPerPage: 1,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSubtitles: false,
      shouldDownloadSlideshowImages: false,
    }),
    signal: AbortSignal.timeout(60000), // 60s timeout
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`TikTok Apify request failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("TikTok: No results returned from Apify");
  }

  const item = data[0];

  // Check if the actor returned an error (e.g., "Post not found or private.")
  if (item.error && !item.playCount) {
    throw new Error(`TikTok scraper error: ${item.error}`);
  }

  return {
    views: item.playCount ?? 0,
    likes: item.diggCount ?? 0,
    comments: item.commentCount ?? 0,
    shares: item.shareCount ?? 0,
    createdAt: item.createTimeISO ?? (item.createTime ? new Date(item.createTime * 1000).toISOString() : null),
    platform: "tiktok",
    raw: item,
  };
}

/**
 * Fetch stats for an Instagram reel/post using Apify actor.
 * Default actor: apify/instagram-reel-scraper
 */
async function fetchInstagramStats(postUrl: string): Promise<ClipStats> {
  const apiKey = getApiKey();
  const actor = getInstagramActor();

  console.log(`[INSTAGRAM TRACKING] Fetching stats for ${postUrl} via ${actor}`);

  const runUrl = `${APIFY_BASE}/acts/${encodeActorName(actor)}/run-sync-get-dataset-items?token=${apiKey}`;

  // apify/instagram-reel-scraper uses "username" field for direct URLs
  const res = await fetch(runUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: [postUrl],
      resultsLimit: 1,
    }),
    signal: AbortSignal.timeout(60000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error(`[INSTAGRAM TRACKING] Apify HTTP ${res.status}: ${text.slice(0, 300)}`);
    throw new Error(`Instagram scraper failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  console.log(`[INSTAGRAM TRACKING] Apify returned ${Array.isArray(data) ? data.length : 0} results`);

  if (!Array.isArray(data) || data.length === 0) {
    throw new Error("Instagram: No results returned from Apify");
  }

  const item = data[0];

  if (item.error) {
    throw new Error(`Instagram scraper returned error: ${item.error}`);
  }

  // Parse createdAt — the actor may return:
  //   timestamp: ISO string ("2025-03-28T14:30:00.000Z") or Unix seconds
  //   takenAtTimestamp / taken_at_timestamp: Unix seconds
  let createdAt: string | null = null;
  const ts = item.timestamp ?? item.takenAtTimestamp ?? item.taken_at_timestamp;
  if (ts) {
    // If it's a string (ISO format), use directly. If it's a number (Unix seconds), convert.
    const parsed = typeof ts === "string" ? new Date(ts) : new Date(ts * 1000);
    if (!isNaN(parsed.getTime())) {
      createdAt = parsed.toISOString();
    }
  }

  const stats: ClipStats = {
    views: item.videoPlayCount ?? item.videoViewCount ?? item.playCount ?? item.viewCount ?? 0,
    likes: item.likesCount ?? item.likes ?? 0,
    comments: item.commentsCount ?? item.comments ?? 0,
    shares: 0,
    createdAt,
    platform: "instagram",
    raw: item,
  };

  console.log("[INSTAGRAM TRACKING]", {
    url: postUrl,
    views: stats.views,
    likes: stats.likes,
    comments: stats.comments,
    createdAt: stats.createdAt,
  });

  return stats;
}

/**
 * Main function: fetch clip stats by URL.
 * Detects platform automatically.
 */
export async function fetchClipStats(clipUrl: string): Promise<ClipStats> {
  const platform = detectPlatform(clipUrl);

  if (platform === "tiktok") {
    return fetchTikTokStats(clipUrl);
  }

  if (platform === "instagram") {
    return fetchInstagramStats(clipUrl);
  }

  throw new Error(`Unsupported platform for URL: ${clipUrl}`);
}
