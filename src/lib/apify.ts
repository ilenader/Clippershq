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
export function detectPlatform(url: string): "tiktok" | "instagram" | "youtube" | null {
  const lower = url.toLowerCase();
  if (lower.includes("tiktok.com")) return "tiktok";
  if (lower.includes("instagram.com") || lower.includes("instagr.am")) return "instagram";
  if (lower.includes("youtube.com") || lower.includes("youtu.be")) return "youtube";
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

export interface ClipStatsSlim {
  views: number;
  likes: number;
  comments: number;
  shares: number;
}

/** Normalize URL for matching actor output to input URLs */
function normalizeUrlForMatch(url: string): string {
  return String(url || "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("?")[0]
    .split("#")[0]
    .replace(/\/$/, "")
    .trim();
}

/** Fetch stats for many TikTok URLs in a single Apify actor call. */
async function fetchTikTokStatsBatch(urls: string[]): Promise<Map<string, ClipStatsSlim>> {
  if (urls.length === 0) return new Map();
  const apiKey = getApiKey();
  const actor = getTikTokActor();
  const runUrl = `${APIFY_BASE}/acts/${encodeActorName(actor)}/run-sync-get-dataset-items?token=${apiKey}`;

  // Scale timeout with batch size (3s/URL + 30s buffer, clamped 60s-600s)
  const timeoutMs = Math.max(60_000, Math.min(600_000, urls.length * 3_000 + 30_000));

  const res = await fetch(runUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      postURLs: urls,
      resultsPerPage: 1,
      shouldDownloadVideos: false,
      shouldDownloadCovers: false,
      shouldDownloadSubtitles: false,
      shouldDownloadSlideshowImages: false,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`TikTok batch Apify request failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const resultMap = new Map<string, ClipStatsSlim>();
  if (!Array.isArray(data)) return resultMap;

  for (const item of data) {
    if (!item || (item.error && !item.playCount)) continue;
    const stats: ClipStatsSlim = {
      views: item.playCount ?? 0,
      likes: item.diggCount ?? 0,
      comments: item.commentCount ?? 0,
      shares: item.shareCount ?? 0,
    };
    // Match by any URL-like field the actor returns
    const candidates = [item.webVideoUrl, item.url, item.inputUrl, item.postUrl].filter(Boolean);
    for (const u of candidates) resultMap.set(normalizeUrlForMatch(u), stats);
  }
  return resultMap;
}

/** Fetch stats for many Instagram URLs in a single Apify actor call. */
async function fetchInstagramStatsBatch(urls: string[]): Promise<Map<string, ClipStatsSlim>> {
  if (urls.length === 0) return new Map();
  const apiKey = getApiKey();
  const actor = getInstagramActor();
  const runUrl = `${APIFY_BASE}/acts/${encodeActorName(actor)}/run-sync-get-dataset-items?token=${apiKey}`;

  const timeoutMs = Math.max(60_000, Math.min(600_000, urls.length * 3_000 + 30_000));

  const res = await fetch(runUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: urls,
      resultsLimit: urls.length,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Instagram batch Apify request failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const resultMap = new Map<string, ClipStatsSlim>();
  if (!Array.isArray(data)) return resultMap;

  for (const item of data) {
    if (!item || item.error) continue;
    const stats: ClipStatsSlim = {
      views: item.videoPlayCount ?? item.videoViewCount ?? item.playCount ?? item.viewCount ?? 0,
      likes: item.likesCount ?? item.likes ?? 0,
      comments: item.commentsCount ?? item.comments ?? 0,
      shares: 0,
    };
    const candidates = [item.url, item.inputUrl, item.postUrl].filter(Boolean);
    for (const u of candidates) resultMap.set(normalizeUrlForMatch(u), stats);
  }
  return resultMap;
}

/**
 * Fetch stats for many clips in as few Apify calls as possible.
 * TikTok and Instagram clips are each sent in ONE actor call.
 * YouTube clips go through the existing per-clip direct API.
 *
 * Returns a Map keyed by clipId. Missing URLs (actor returned no data) map to null.
 * If a batch request fails entirely, that platform's clips fall back to individual fetches.
 */
export async function fetchClipStatsBatch(
  clips: { url: string; platform: string; clipId: string }[],
): Promise<Map<string, ClipStatsSlim | null>> {
  const result = new Map<string, ClipStatsSlim | null>();
  const tiktokClips = clips.filter((c) => c.platform === "tiktok");
  const instagramClips = clips.filter((c) => c.platform === "instagram");
  const youtubeClips = clips.filter((c) => c.platform === "youtube");
  const unknownClips = clips.filter((c) => !["tiktok", "instagram", "youtube"].includes(c.platform));

  for (const c of unknownClips) result.set(c.clipId, null);

  // TikTok batch
  if (tiktokClips.length > 0) {
    const t0 = Date.now();
    try {
      const statsMap = await fetchTikTokStatsBatch(tiktokClips.map((c) => c.url));
      let hits = 0;
      for (const c of tiktokClips) {
        const s = statsMap.get(normalizeUrlForMatch(c.url));
        if (s) { result.set(c.clipId, s); hits++; } else { result.set(c.clipId, null); }
      }
      console.log(`[TRACKING] Batch: fetched ${hits}/${tiktokClips.length} clips for tiktok in ${Date.now() - t0}ms`);
    } catch (err: any) {
      console.error(`[APIFY-BATCH] TikTok batch failed, falling back to individual fetches:`, err?.message);
      await Promise.allSettled(tiktokClips.map(async (c) => {
        try {
          const s = await fetchClipStats(c.url);
          result.set(c.clipId, { views: s.views, likes: s.likes, comments: s.comments, shares: s.shares });
        } catch {
          result.set(c.clipId, null);
        }
      }));
    }
  }

  // Instagram batch
  if (instagramClips.length > 0) {
    const t0 = Date.now();
    try {
      const statsMap = await fetchInstagramStatsBatch(instagramClips.map((c) => c.url));
      let hits = 0;
      for (const c of instagramClips) {
        const s = statsMap.get(normalizeUrlForMatch(c.url));
        if (s) { result.set(c.clipId, s); hits++; } else { result.set(c.clipId, null); }
      }
      console.log(`[TRACKING] Batch: fetched ${hits}/${instagramClips.length} clips for instagram in ${Date.now() - t0}ms`);
    } catch (err: any) {
      console.error(`[APIFY-BATCH] Instagram batch failed, falling back to individual fetches:`, err?.message);
      await Promise.allSettled(instagramClips.map(async (c) => {
        try {
          const s = await fetchClipStats(c.url);
          result.set(c.clipId, { views: s.views, likes: s.likes, comments: s.comments, shares: s.shares });
        } catch {
          result.set(c.clipId, null);
        }
      }));
    }
  }

  // YouTube — direct API, per clip (unchanged)
  if (youtubeClips.length > 0) {
    const t0 = Date.now();
    let hits = 0;
    await Promise.allSettled(youtubeClips.map(async (c) => {
      try {
        const s = await fetchClipStats(c.url);
        result.set(c.clipId, { views: s.views, likes: s.likes, comments: s.comments, shares: s.shares });
        hits++;
      } catch {
        result.set(c.clipId, null);
      }
    }));
    console.log(`[TRACKING] Batch: fetched ${hits}/${youtubeClips.length} clips for youtube in ${Date.now() - t0}ms`);
  }

  return result;
}

/**
 * Main function: fetch clip stats by URL.
 * Detects platform automatically.
 */
export async function fetchClipStats(clipUrl: string): Promise<ClipStats> {
  const platform = detectPlatform(clipUrl);
  console.log(`[APIFY] Fetching stats for: ${clipUrl} (platform: ${platform})`);

  if (platform === "tiktok") {
    const result = await fetchTikTokStats(clipUrl);
    console.log(`[APIFY] TikTok result: views=${result.views} likes=${result.likes} comments=${result.comments} shares=${result.shares}`);
    return result;
  }

  if (platform === "instagram") {
    const result = await fetchInstagramStats(clipUrl);
    console.log(`[APIFY] Instagram result: views=${result.views} likes=${result.likes} comments=${result.comments} shares=${result.shares}`);
    return result;
  }

  if (platform === "youtube") {
    const { getYouTubeVideoStats } = await import("@/lib/youtube");
    const ytStats = await getYouTubeVideoStats(clipUrl);
    if (!ytStats) throw new Error(`Failed to fetch YouTube stats for: ${clipUrl}`);
    return {
      views: ytStats.views,
      likes: ytStats.likes,
      comments: ytStats.comments,
      shares: 0,
      createdAt: null,
      platform: "youtube",
    };
  }

  throw new Error(`Unsupported platform for URL: ${clipUrl}`);
}
