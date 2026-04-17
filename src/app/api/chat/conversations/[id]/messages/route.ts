import { getSession } from "@/lib/get-session";
import { db } from "@/lib/db";
import { canAccessConversation } from "@/lib/chat-access";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";
import { checkBanStatus } from "@/lib/check-ban";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// ─── Auto-reply map for common clipper questions ────────────
const AUTO_REPLIES: { match: string[]; reply: string }[] = [
  {
    match: ["how do i post correctly", "how do i post", "how to post correctly"],
    reply: "Post within 2 hours of creating the video. Make sure the clip URL matches your account platform (TikTok link for TikTok account). Follow the campaign requirements listed on the campaign page.",
  },
  {
    match: ["i don't know what to post", "dont know what to post", "what should i post", "what kind of content"],
    reply: "Check the campaign page for requirements, examples, and content rules. Follow the hashtag and caption guidelines. Look at the example links for inspiration on what works well.",
  },
  {
    match: ["problem with my views", "views are low", "not getting views", "why is this video not performing", "video not performing"],
    reply: "Make sure you're posting at peak hours for your target audience. Use the required hashtags and sounds. Keep your hook strong in the first 2 seconds. Check if your content matches the campaign's target market.",
  },
  {
    match: ["how do i hit usa", "usa market", "usa viewers", "hit more usa", "target usa", "reach usa"],
    reply: "Post between 9 AM–12 PM EST or 6 PM–9 PM EST for maximum USA reach. Use US-trending sounds, English captions, and US-relevant hashtags. Avoid posting during off-peak hours for the US timezone.",
  },
  {
    match: ["review my posting strategy", "review my strategy", "posting strategy"],
    reply: "Share your recent clip links here and I'll review them. Include what time you posted, which sounds you used, and your hashtag strategy. We'll help you optimize.",
  },
  {
    match: ["best hook for this campaign", "best hook", "what hook should i use"],
    reply: "Start with a question or bold statement in the first 1-2 seconds. Check the campaign examples for hooks that performed well. Avoid slow intros — grab attention immediately.",
  },
  {
    match: ["help me improve this clip", "improve this clip", "improve my clip"],
    reply: "Send the clip link and I'll give you specific feedback. Common improvements: stronger hook, better lighting, tighter editing, and matching the campaign's required sound/hashtags.",
  },
  {
    match: ["i need help with this campaign", "need help with campaign", "help with this campaign"],
    reply: "Sure! What specifically do you need help with? Views, content ideas, posting strategy, or something else? Let me know and I'll guide you.",
  },
  // ─── Progress / Gamification ────────────────
  {
    match: ["level", "level up", "how do levels work", "what level am i"],
    reply: "Your level is based on your total lifetime earnings. Each level gives you a permanent bonus on all future earnings that never resets. Check your Progress page to see your current level and how much you need to reach the next one!",
  },
  {
    match: ["streak", "how do streaks work", "daily streak", "how does streak work"],
    reply: "Post at least 1 approved clip every day to build your streak. Streaks give you an extra bonus on top of your level bonus — up to +9% at 60 days! If you miss a day, the streak resets but your level bonus stays.",
  },
  {
    match: ["bonus", "how does bonus work", "my bonus", "what is my bonus"],
    reply: "Your total bonus is your level bonus + streak bonus combined. This percentage is added to all your earnings. For example, if you have a 15% bonus and earn $100, you actually get $115. Check your Progress page for details!",
  },
  {
    match: ["referral", "invite", "refer a friend", "referral link", "how to invite"],
    reply: "Share your referral link from the Progress page. You earn 5% of every referred user's approved earnings, forever! Plus, referred users get a reduced platform fee (4% instead of 9%).",
  },
  {
    match: ["payout", "when do i get paid", "how do payouts work", "how to get paid", "withdraw"],
    reply: "Go to the Payouts page, select a campaign, enter the amount you want to withdraw (minimum $10), and fill in your wallet details. Your payout will be reviewed and processed by the team.",
  },
  // ─── General ────────────────
  {
    match: ["help", "how does this work", "what do i do", "getting started", "how to start"],
    reply: "Welcome! Here's the basics: 1) Add your social media account in Accounts. 2) Browse and join a Campaign. 3) Post clips and submit them in Clips. 4) Earn money based on views! Check the Help page for more details.",
  },
  {
    match: ["banned", "suspended", "can't log in", "account issue", "account problem"],
    reply: "If you're having account issues, please contact support via the Discord ticket link in the sidebar.",
  },
];

function findAutoReply(message: string): string | null {
  const normalized = message.toLowerCase().replace(/[?.!,]/g, "").trim();
  for (const entry of AUTO_REPLIES) {
    for (const pattern of entry.match) {
      if (normalized === pattern || normalized.includes(pattern)) {
        return entry.reply;
      }
    }
  }
  return null;
}

/**
 * GET /api/chat/conversations/[id]/messages
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json([], { status: 401 });

  const banCheck = checkBanStatus(session);
  if (banCheck) return banCheck;

  if (!db || !db.message) return NextResponse.json([]);

  const { id: conversationId } = await params;
  const userId = session.user.id;
  const role = (session.user as any).role;

  const allowed = await canAccessConversation(userId, role, conversationId);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const messages = await db.message.findMany({
      where: { conversationId },
      include: {
        sender: { select: { id: true, name: true, username: true, image: true, role: true } },
      },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    return NextResponse.json(messages);
  } catch (err: any) {
    console.error("GET messages error:", err?.message);
    return NextResponse.json([]);
  }
}

/**
 * POST /api/chat/conversations/[id]/messages
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const banCheck2 = checkBanStatus(session);
  if (banCheck2) return banCheck2;

  if (!db || !db.message) return NextResponse.json({ error: "Database unavailable" }, { status: 500 });

  const { id: conversationId } = await params;
  const userId = session.user.id;
  const role = (session.user as any).role;

  const allowed = await canAccessConversation(userId, role, conversationId);
  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  // Rate limit: 30 messages per minute per user
  const rl = checkRateLimit(`chat-msg:${userId}`, 30, 60_000);
  if (!rl.allowed) return rateLimitResponse(rl.retryAfterMs);

  let body: any;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  if (body.content != null && typeof body.content !== "string") {
    return NextResponse.json({ error: "Message content must be a string" }, { status: 400 });
  }
  const content = (typeof body.content === "string" ? body.content : "").trim();
  if (!content) return NextResponse.json({ error: "Message cannot be empty" }, { status: 400 });
  if (content.length > 5000) {
    return NextResponse.json({ error: "Message is too long (max 5000 chars)" }, { status: 400 });
  }

  try {
    // Owner auto-join: only if the conversation has NO existing OWNER/ADMIN participant.
    // Prevents a removed owner from silently re-adding themselves on next reply.
    // If another owner/admin is already on the conversation, this owner must be explicitly invited.
    if (role === "OWNER") {
      const existingParticipants = await db.conversationParticipant.findMany({
        where: { conversationId },
        include: { user: { select: { role: true } } },
      });
      const isParticipant = existingParticipants.some((p: any) => p.userId === userId);
      const hasOwnerOrAdmin = existingParticipants.some(
        (p: any) => p.user?.role === "OWNER" || p.user?.role === "ADMIN",
      );
      if (!isParticipant && !hasOwnerOrAdmin) {
        await db.conversationParticipant.create({
          data: { conversationId, userId },
        });
      }
    }

    const [message] = await Promise.all([
      db.message.create({
        data: { conversationId, senderId: userId, content },
        include: {
          sender: { select: { id: true, name: true, username: true, image: true, role: true } },
        },
      }),
      db.conversation.update({
        where: { id: conversationId },
        data: { updatedAt: new Date() },
      }),
      db.conversationParticipant.updateMany({
        where: { conversationId, userId },
        data: { lastReadAt: new Date() },
      }),
    ]);

    // CLIENT messages: immediately flag for human support, no AI response
    if (role === "CLIENT") {
      try {
        await db.conversation.update({
          where: { id: conversationId },
          data: { needsHumanSupport: true, lastHumanEmailSentAt: null },
        });
        const { createNotification } = await import("@/lib/notifications");

        // Find the campaign team to notify — team lookup is best-effort; we always fall
        // back to notifying OWNERs on any failure so a CLIENT message never goes unread.
        const convo = await db.conversation.findUnique({
          where: { id: conversationId },
          select: { campaignId: true },
        });
        let notifyUserIds: string[] = [];
        if (convo?.campaignId) {
          try {
            const teamCampaign = await db.teamCampaign.findFirst({
              where: { campaignId: convo.campaignId },
              include: {
                team: {
                  include: {
                    members: {
                      include: { user: { select: { id: true } } },
                      orderBy: { role: "asc" },
                    },
                  },
                },
              },
            });
            if (teamCampaign?.team?.members?.length) {
              notifyUserIds = teamCampaign.team.members.map((m: any) => m.userId);
            }
          } catch (teamErr: any) {
            console.error("[CHAT] Team lookup failed, falling back to owners:", teamErr?.message);
          }
        }
        // Fallback to owners if no team found OR team lookup errored
        if (notifyUserIds.length === 0) {
          const owners = await db.user.findMany({ where: { role: "OWNER" }, select: { id: true } });
          notifyUserIds = owners.map((o: any) => o.id);
        }
        for (const uid of notifyUserIds) {
          await createNotification(uid, "CLIP_FLAGGED", "Client message received", "A client sent a message and needs a response.", { conversationId });
        }
      } catch {}
    }

    // Auto-reply for clipper messages — AI chatbot with pattern fallback
    if (role === "CLIPPER") {
      try {
        // Check if conversation needs human support (skip AI)
        const convo = await db.conversation.findUnique({
          where: { id: conversationId },
          select: { campaignId: true, needsHumanSupport: true },
        });

        if (!convo?.needsHumanSupport) {
          // Find responder ID (campaign creator or fallback admin/owner)
          let responderId: string | null = null;
          if (convo?.campaignId) {
            const campaign = await db.campaign.findUnique({
              where: { id: convo.campaignId },
              select: { createdById: true },
            });
            if (campaign?.createdById) {
              const creator = await db.user.findUnique({
                where: { id: campaign.createdById },
                select: { id: true, role: true, status: true },
              });
              if (creator && creator.status === "ACTIVE" && (creator.role === "ADMIN" || creator.role === "OWNER")) {
                responderId = creator.id;
              }
            }
          }
          if (!responderId) {
            const participants = await db.conversationParticipant.findMany({
              where: { conversationId, userId: { not: userId } },
              include: { user: { select: { id: true, role: true } } },
            });
            const fallback = participants.find((p: any) => p.user.role === "ADMIN")
              || participants.find((p: any) => p.user.role === "OWNER")
              || participants[0];
            if (fallback) responderId = fallback.userId;
          }

          if (responderId) {
            let replyContent: string | null = null;

            // Try AI chatbot first
            try {
              const { generateChatbotResponse, shouldTransferToAgent } = await import("@/lib/chatbot");
              const userData = await db.user.findUnique({
                where: { id: userId },
                select: { username: true, level: true, totalEarnings: true, currentStreak: true },
              });
              // Get conversation history for context
              const history = await db.message.findMany({
                where: { conversationId },
                orderBy: { createdAt: "desc" },
                take: 10,
                select: { senderId: true, content: true },
              });
              const chatHistory = history.reverse().map((m: any) => ({
                role: m.senderId === userId ? "user" as const : "assistant" as const,
                content: m.content,
              }));

              replyContent = await generateChatbotResponse(content, chatHistory, {
                username: userData?.username || "Clipper",
                role: "CLIPPER",
                level: userData?.level || 0,
                earnings: userData?.totalEarnings || 0,
                streak: userData?.currentStreak || 0,
              }, convo?.campaignId);

              // Check if AI suggests transfer after 3 consecutive unable-to-help responses
              if (replyContent) {
                const recentAI = history.filter((m: any) => m.senderId === responderId).slice(0, 3).map((m: any) => m.content);
                recentAI.push(replyContent);
                if (shouldTransferToAgent(recentAI)) {
                  await db.conversation.update({ where: { id: conversationId }, data: { needsHumanSupport: true, lastHumanEmailSentAt: null } });
                  // Notify owners
                  const { createNotification } = await import("@/lib/notifications");
                  const owners = await db.user.findMany({ where: { role: "OWNER" }, select: { id: true } });
                  for (const owner of owners) {
                    await createNotification(owner.id, "CLIP_FLAGGED", "Live support requested", `${userData?.username || "A clipper"} needs help in chat.`, { conversationId });
                  }
                }
              }
            } catch {
              // AI failed — will fall back to pattern matching below
            }

            // Fallback to pattern-based auto-reply if AI returned nothing
            if (!replyContent) {
              replyContent = findAutoReply(content);
            }

            if (replyContent) {
              // Strip TRANSFER_TO_AGENT prefix from display
              if (replyContent.startsWith("TRANSFER_TO_AGENT:")) {
                replyContent = replyContent.replace("TRANSFER_TO_AGENT:", "").trim();
              }
              await db.message.create({
                data: { conversationId, senderId: responderId, content: replyContent, isAI: true },
              });
              await db.conversation.update({
                where: { id: conversationId },
                data: { updatedAt: new Date() },
              });
            }
          }
        }
      } catch {}
    }

    // When OWNER/ADMIN sends a message, email the recipient on the FIRST human response
    // (once per conversation — lastHumanEmailSentAt stays set to prevent spam)
    // then clear needsHumanSupport flag
    if (role === "OWNER" || role === "ADMIN") {
      try {
        const convo = await db.conversation.findUnique({
          where: { id: conversationId },
          select: {
            needsHumanSupport: true,
            lastHumanEmailSentAt: true,
            participants: {
              select: {
                userId: true,
                user: { select: { email: true, name: true, username: true, role: true } },
              },
            },
          },
        });

        if (convo?.needsHumanSupport && !convo.lastHumanEmailSentAt && content.length > 0) {
          const recipient = convo.participants.find(
            (p: any) =>
              p.userId !== userId &&
              p.user?.email &&
              (p.user.role === "CLIPPER" || p.user.role === "CLIENT"),
          );
          if (recipient?.user?.email) {
            const senderName =
              (message as any).sender?.name ||
              (message as any).sender?.username ||
              "Your account manager";
            const recipientName =
              recipient.user.name || recipient.user.username || "there";
            const urlByRole: Record<string, string> = {
              CLIENT: "https://clipershq.com/client",
              CLIPPER: "https://clipershq.com/dashboard",
              ADMIN: "https://clipershq.com/admin",
            };
            const conversationUrl =
              urlByRole[recipient.user.role] || "https://clipershq.com/dashboard";
            try {
              const { sendChatReplyEmail } = await import("@/lib/email");
              await sendChatReplyEmail({
                to: recipient.user.email,
                recipientName,
                senderName,
                messagePreview: content.slice(0, 200),
                conversationUrl,
              });
              await db.conversation.update({
                where: { id: conversationId },
                data: { lastHumanEmailSentAt: new Date() },
              });
            } catch (emailErr: any) {
              console.error("[CHAT-EMAIL] Failed:", emailErr?.message);
            }
          }
        }

        await db.conversation.update({
          where: { id: conversationId },
          data: { needsHumanSupport: false },
        });
      } catch {}
    }

    return NextResponse.json(message, { status: 201 });
  } catch (err: any) {
    console.error("POST message error:", err?.message);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
