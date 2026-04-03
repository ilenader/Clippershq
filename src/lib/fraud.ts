/**
 * Fraud detection utilities.
 * Computes a fraud risk level from clip stats ONLY.
 *
 * IMPORTANT: This does NOT use trustScore or any gamification signals.
 * It only uses content performance metrics (views, likes, comments, shares).
 *
 * Signals:
 * 1. View spike detection (requires 2+ stat snapshots)
 * 2. Engagement ratio anomalies (views vs likes)
 * 3. Comments-to-views ratio
 * 4. High views with zero engagement
 * 5. Like spike without proportional view growth
 * 6. Impossible engagement ratios (likes > views)
 * 7. Views decreased between snapshots
 * 8. Stale-then-spike pattern (flat for 3+ checks then sudden jump)
 */

export type FraudLevel = "CLEAN" | "SUSPECT" | "FLAGGED" | "HIGH_RISK";

interface StatSnapshot {
  views: number;
  likes: number;
  comments: number;
  shares: number;
}

export interface FraudInput {
  /** Stats ordered newest-first (index 0 = latest) */
  stats: StatSnapshot[];
}

export interface FraudResult {
  level: FraudLevel;
  score: number;
  reasons: string[];
}

// Configurable thresholds — can be overridden via env vars later
const CONFIG = {
  VIEW_SPIKE_EXTREME: 100,   // 100x growth = extreme
  VIEW_SPIKE_MODERATE: 15,   // 15x growth = moderate
  ENGAGEMENT_RATIO_FLAG: 500, // 500:1 views/likes = very suspicious
  ENGAGEMENT_RATIO_WARN: 200, // 200:1 views/likes = suspicious
  MIN_VIEWS_FOR_ENGAGEMENT: 500,
  MIN_VIEWS_FOR_ZERO_ENGAGEMENT: 2000,
  MIN_VIEWS_FOR_COMMENTS_CHECK: 2000,
  AUTO_FLAG_THRESHOLD: 30,
  HIGH_RISK_THRESHOLD: 50,
};

export function computeFraudLevel(input: FraudInput): FraudResult {
  const reasons: string[] = [];
  let score = 0;

  const latest = input.stats[0];
  const prev = input.stats[1];

  if (!latest) return { level: "CLEAN", score: 0, reasons: [] };

  // 1. View spike detection (requires at least 2 stat snapshots)
  if (prev && prev.views > 0) {
    const growthRate = latest.views / prev.views;
    if (growthRate > CONFIG.VIEW_SPIKE_EXTREME) {
      score += 40;
      reasons.push(`Views grew ${growthRate.toFixed(0)}x between checks — far outside normal growth`);
    } else if (growthRate > CONFIG.VIEW_SPIKE_MODERATE) {
      score += 20;
      reasons.push(`Views grew ${growthRate.toFixed(0)}x between checks — unusually fast`);
    }
  }

  // 2. Engagement ratio (views:likes) — suspicious if very low engagement
  if (latest.views > CONFIG.MIN_VIEWS_FOR_ENGAGEMENT) {
    const ratio = latest.views / Math.max(latest.likes, 1);
    if (ratio > CONFIG.ENGAGEMENT_RATIO_FLAG) {
      score += 30;
      reasons.push(`Only 1 like per ${ratio.toFixed(0)} views — organic clips typically get 1 like per 20-80 views`);
    } else if (ratio > CONFIG.ENGAGEMENT_RATIO_WARN) {
      score += 15;
      reasons.push(`Only 1 like per ${ratio.toFixed(0)} views — engagement is below expected range`);
    }
  }

  // 3. Comments-to-views ratio
  if (latest.views > CONFIG.MIN_VIEWS_FOR_COMMENTS_CHECK && latest.comments < 2) {
    score += 10;
    reasons.push(`Only ${latest.comments} comments for ${latest.views.toLocaleString()} views — organic content gets comments at scale`);
  }

  // 4. Views with zero comments/likes (suspicious for high-view clips)
  if (latest.views > CONFIG.MIN_VIEWS_FOR_ZERO_ENGAGEMENT && latest.comments === 0 && latest.likes < 10) {
    score += 20;
    reasons.push(`${latest.views.toLocaleString()} views but virtually zero engagement — possible bot traffic`);
  }

  // 5. Like spike without proportional view growth
  if (prev && prev.likes > 0 && prev.views > 0) {
    const likeGrowthRate = latest.likes / prev.likes;
    const viewGrowthRate = latest.views / prev.views;
    // If likes exploded but views barely moved
    if (likeGrowthRate > 5 && viewGrowthRate < 2) {
      score += 25;
      reasons.push(`Likes grew ${likeGrowthRate.toFixed(1)}x while views only grew ${viewGrowthRate.toFixed(1)}x — likes may be purchased`);
    }
  }

  // 6. Impossible ratios — likes exceeding views (should never happen organically)
  if (latest.likes > latest.views && latest.views > 100) {
    score += 35;
    reasons.push(`${latest.likes.toLocaleString()} likes but only ${latest.views.toLocaleString()} views — statistically impossible`);
  }

  // 7. Views decreased between snapshots (should be impossible on most platforms)
  if (prev && latest.views < prev.views && prev.views > 100) {
    score += 30;
    reasons.push(`Views decreased from ${prev.views.toLocaleString()} to ${latest.views.toLocaleString()} — platforms don't reduce view counts`);
  }

  // 8. Stale-then-spike pattern (requires 4+ snapshots)
  if (input.stats.length >= 4) {
    // Check if there were 3+ consecutive flat periods before the latest spike
    let flatCount = 0;
    for (let i = 1; i < input.stats.length - 1; i++) {
      const curr = input.stats[i];
      const next = input.stats[i + 1];
      if (next.views > 0 && curr.views / next.views < 1.1) {
        flatCount++;
      } else {
        break;
      }
    }
    if (flatCount >= 3 && prev && prev.views > 0) {
      const spikeRatio = latest.views / prev.views;
      if (spikeRatio > 10) {
        score += 25;
        reasons.push(`Clip was flat for ${flatCount} checks then jumped ${spikeRatio.toFixed(0)}x — consistent with purchased engagement`);
      }
    }
  }

  // Determine level
  let level: FraudLevel = "CLEAN";
  if (score >= CONFIG.HIGH_RISK_THRESHOLD) level = "HIGH_RISK";
  else if (score >= CONFIG.AUTO_FLAG_THRESHOLD) level = "FLAGGED";
  else if (score >= 15) level = "SUSPECT";

  return { level, score, reasons };
}
