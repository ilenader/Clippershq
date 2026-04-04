/**
 * AI Chatbot — Uses Anthropic Claude API for intelligent auto-replies.
 * Falls back to pattern-based auto-replies if API key is not set or API fails.
 */

const SYSTEM_PROMPT = `You are the Clippers HQ support assistant. You help clippers (content creators who clip and distribute short-form content for campaigns).

RULES:
- Only answer questions about clipping, the Clippers HQ platform, campaigns, payouts, earnings, accounts, and related topics
- If someone asks something unrelated to clipping or the platform, say: "I can only help with Clippers HQ and clipping-related questions. Is there something about the platform I can help with?"
- Keep responses short and helpful (2-3 sentences max)
- Be friendly but professional
- Never reveal internal platform details (fee percentages, fraud detection methods, tracking intervals)
- Never mention team location
- If you don't know the answer or the user seems frustrated, say: "I'd recommend speaking with our support team directly. You can request to talk to an agent and someone from the team will get back to you."

PLATFORM KNOWLEDGE:
- Clippers submit clips (TikTok, Instagram Reels, YouTube Shorts) to campaigns
- Earnings are based on views (CPM model, cost per 1000 views)
- Views are tracked automatically
- Streaks: submit at least 1 clip per day that gets approved. Streak bonuses increase earnings.
- Levels: based on total earnings. Higher level = higher bonus percentage.
- Payouts: request when you've earned enough. Payouts are reviewed and processed.
- Accounts: link your TikTok/Instagram/YouTube accounts before submitting clips
- Referrals: share your referral link. Referred users get lower fees, you earn a percentage of their earnings.`;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface UserData {
  username: string;
  role: string;
  level: number;
  earnings: number;
  streak: number;
}

// Rate limit: 20 AI messages per user per day
const dailyLimits = new Map<string, { count: number; resetAt: number }>();

function checkAIRateLimit(userId: string): boolean {
  const now = Date.now();
  const entry = dailyLimits.get(userId);
  if (!entry || entry.resetAt <= now) {
    dailyLimits.set(userId, { count: 1, resetAt: now + 24 * 60 * 60 * 1000 });
    return true;
  }
  if (entry.count >= 20) return false;
  entry.count++;
  return true;
}

// Clean expired entries every hour
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of dailyLimits) {
      if (entry.resetAt <= now) dailyLimits.delete(key);
    }
  }, 3_600_000);
}

/**
 * Generate a chatbot response using Anthropic Claude API.
 * Returns null if API key is not set or call fails (caller should fall back to auto-replies).
 */
export async function generateChatbotResponse(
  userMessage: string,
  conversationHistory: ChatMessage[],
  userData: UserData,
): Promise<string | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null; // Fall back to auto-replies

  // Check rate limit
  if (!checkAIRateLimit(userData.username)) {
    return "You've reached the daily message limit. Please connect with our support team for further help.";
  }

  const userContext = `\n\nUSER CONTEXT:\n- Username: ${userData.username}\n- Level: ${userData.level}\n- Current streak: ${userData.streak} days\n- Total earnings: $${userData.earnings.toFixed(2)}`;

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 500,
        system: SYSTEM_PROMPT + userContext,
        messages: [
          ...conversationHistory.slice(-10), // Last 10 messages for context
          { role: "user", content: userMessage },
        ],
      }),
    });

    if (!res.ok) {
      console.error("[CHATBOT] API error:", res.status);
      return null; // Fall back to auto-replies
    }

    const data = await res.json();
    const text = data.content?.[0]?.text;
    return text || null;
  } catch (err: any) {
    console.error("[CHATBOT] Error:", err?.message);
    return null; // Fall back to auto-replies
  }
}

/**
 * Check if the AI response suggests transfer to human.
 * Returns true if the last 3 AI responses all indicate inability to help.
 */
export function shouldTransferToAgent(recentAIMessages: string[]): boolean {
  if (recentAIMessages.length < 3) return false;
  const last3 = recentAIMessages.slice(-3);
  const transferPhrases = ["support team", "speak with", "talk to an agent", "can only help with", "connect with"];
  return last3.every((msg) => transferPhrases.some((phrase) => msg.toLowerCase().includes(phrase)));
}
