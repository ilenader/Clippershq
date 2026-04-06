/**
 * Validates that a profile link matches the selected platform.
 * Used on both client and server side.
 */

interface ValidationResult {
  valid: boolean;
  error: string | null;
}

const PLATFORM_DOMAINS: Record<string, string[]> = {
  TikTok: ["tiktok.com"],
  Instagram: ["instagram.com", "instagr.am"],
  YouTube: ["youtube.com", "youtu.be"],
};

const WRONG_PLATFORM_DOMAINS: Record<string, string[]> = {
  TikTok: ["instagram.com", "youtube.com", "youtu.be"],
  Instagram: ["tiktok.com", "youtube.com", "youtu.be"],
  YouTube: ["tiktok.com", "instagram.com"],
};

// Video/post URL patterns (not profile URLs)
const VIDEO_PATTERNS: Record<string, RegExp[]> = {
  TikTok: [/tiktok\.com\/.*\/video\//i, /tiktok\.com\/.*\/photo\//i, /vm\.tiktok\.com\//i],
  Instagram: [/instagram\.com\/p\//i, /instagram\.com\/reel\//i, /instagram\.com\/stories\//i],
  YouTube: [/youtube\.com\/watch/i, /youtu\.be\/[a-zA-Z0-9_-]+$/i, /youtube\.com\/shorts\//i],
};

// Valid profile URL patterns
const PROFILE_PATTERNS: Record<string, RegExp[]> = {
  TikTok: [/tiktok\.com\/@[\w.]+/i],
  Instagram: [/instagram\.com\/[\w.]+\/?$/i, /instagr\.am\/[\w.]+\/?$/i],
  YouTube: [/youtube\.com\/@[\w.]+/i, /youtube\.com\/channel\//i, /youtube\.com\/c\//i, /youtube\.com\/user\//i],
};

export function validateAccountLink(platform: string, profileLink: string): ValidationResult {
  const link = profileLink.trim().toLowerCase();

  if (!link) {
    return { valid: false, error: "Profile link is required." };
  }

  if (!PLATFORM_DOMAINS[platform]) {
    return { valid: false, error: "Invalid platform." };
  }

  // Check if the link contains a wrong platform domain
  const wrongDomains = WRONG_PLATFORM_DOMAINS[platform] || [];
  for (const domain of wrongDomains) {
    if (link.includes(domain)) {
      const correctDomain = PLATFORM_DOMAINS[platform][0];
      return {
        valid: false,
        error: `The link you provided doesn't match ${platform}. Please use a link from ${correctDomain}`,
      };
    }
  }

  // Check if the link contains the correct platform domain
  const correctDomains = PLATFORM_DOMAINS[platform];
  const hasCorrectDomain = correctDomains.some((d) => link.includes(d));
  if (!hasCorrectDomain) {
    return {
      valid: false,
      error: `The link you provided doesn't match the platform you selected. Please make sure your ${platform} profile link is from ${correctDomains[0]}`,
    };
  }

  // Check if it's a video/post URL instead of a profile URL
  const videoPatterns = VIDEO_PATTERNS[platform] || [];
  for (const pattern of videoPatterns) {
    if (pattern.test(link)) {
      const examples: Record<string, string> = {
        TikTok: "tiktok.com/@username",
        Instagram: "instagram.com/username",
        YouTube: "youtube.com/@username",
      };
      return {
        valid: false,
        error: `This looks like a video link, not a profile link. Please use your profile URL (e.g. ${examples[platform]})`,
      };
    }
  }

  // Check if it matches a valid profile pattern
  const profilePatterns = PROFILE_PATTERNS[platform] || [];
  const matchesProfile = profilePatterns.some((p) => p.test(link));
  if (!matchesProfile && link.includes(correctDomains[0])) {
    const examples: Record<string, string> = {
      TikTok: "https://tiktok.com/@username",
      Instagram: "https://instagram.com/username",
      YouTube: "https://youtube.com/@username",
    };
    return {
      valid: false,
      error: `This doesn't look like a valid ${platform} profile URL. Expected format: ${examples[platform]}`,
    };
  }

  return { valid: true, error: null };
}
