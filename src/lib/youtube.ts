/**
 * YouTube Data API v3 integration for tracking YouTube clip stats.
 * Requires YOUTUBE_API_KEY environment variable.
 */

export async function getYouTubeVideoStats(videoUrl: string): Promise<{ views: number; likes: number; comments: number } | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.error('[YOUTUBE] YOUTUBE_API_KEY not set');
    return null;
  }

  let videoId: string | null = null;
  try {
    const url = new URL(videoUrl);
    if (url.hostname.includes('youtu.be')) {
      videoId = url.pathname.slice(1);
    } else if (url.pathname.includes('/shorts/')) {
      videoId = url.pathname.split('/shorts/')[1]?.split('/')[0]?.split('?')[0];
    } else if (url.searchParams.has('v')) {
      videoId = url.searchParams.get('v');
    }
  } catch { return null; }

  if (!videoId) return null;

  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=statistics&id=${videoId}&key=${apiKey}`
    );
    const data = await res.json();
    if (!data.items || data.items.length === 0) return null;
    const stats = data.items[0].statistics;
    return {
      views: parseInt(stats.viewCount || '0', 10),
      likes: parseInt(stats.likeCount || '0', 10),
      comments: parseInt(stats.commentCount || '0', 10),
    };
  } catch (err) {
    console.error('[YOUTUBE] API error:', err);
    return null;
  }
}

/** Extract video ID from a YouTube URL */
function extractVideoId(videoUrl: string): string | null {
  try {
    const url = new URL(videoUrl);
    if (url.hostname.includes('youtu.be')) return url.pathname.slice(1);
    if (url.pathname.includes('/shorts/')) return url.pathname.split('/shorts/')[1]?.split('/')[0]?.split('?')[0] || null;
    if (url.searchParams.has('v')) return url.searchParams.get('v');
  } catch {}
  return null;
}

/**
 * Get YouTube video publish time + stats using snippet+statistics parts.
 * Returns publishedAt as ISO string, plus views/likes/comments.
 */
export async function getYouTubeVideoDetails(videoUrl: string): Promise<{
  publishedAt: string | null;
  views: number;
  likes: number;
  comments: number;
} | null> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) {
    console.log('[YOUTUBE] YOUTUBE_API_KEY not set — cannot verify posting time');
    return null;
  }

  const videoId = extractVideoId(videoUrl);
  if (!videoId) return null;

  try {
    const res = await fetch(
      `https://www.googleapis.com/youtube/v3/videos?part=snippet,statistics&id=${videoId}&key=${apiKey}`
    );
    const data = await res.json();
    if (!data.items || data.items.length === 0) return null;
    const item = data.items[0];
    return {
      publishedAt: item.snippet?.publishedAt || null,
      views: parseInt(item.statistics?.viewCount || '0', 10),
      likes: parseInt(item.statistics?.likeCount || '0', 10),
      comments: parseInt(item.statistics?.commentCount || '0', 10),
    };
  } catch (err) {
    console.error('[YOUTUBE] API error:', err);
    return null;
  }
}
