"use client";

import { Card } from "@/components/ui/card";
import { HelpCircle, Film, Megaphone, UserCircle, DollarSign, Wallet, Shield, AlertTriangle, Star, Flame, Users } from "lucide-react";

const sections = [
  {
    icon: <Megaphone className="h-5 w-5 text-accent" />,
    title: "How campaigns work",
    content: [
      "Campaigns are created by the agency for specific brands or products.",
      "Each campaign has requirements, platforms (TikTok, Instagram, YouTube), and payout rules.",
      "Browse active campaigns, join the ones that match your content style, and start submitting clips.",
      "Paused campaigns do not accept new clip submissions.",
    ],
  },
  {
    icon: <UserCircle className="h-5 w-5 text-accent" />,
    title: "Adding your accounts",
    content: [
      "Before submitting clips, verify your social media account (TikTok, Instagram, or YouTube).",
      "Go to Accounts → Add Account → select your platform and enter your username + profile link.",
      "You'll receive a short verification code. Place it in your bio, then click Verify.",
      "Once verified, your account is approved and ready for clip submissions.",
    ],
  },
  {
    icon: <Film className="h-5 w-5 text-accent" />,
    title: "Submitting clips",
    content: [
      "Go to Clips → Submit Clip → choose a campaign and your verified account.",
      "Paste the URL of your clip (TikTok video link, Instagram Reel, etc.).",
      "Your clip URL must match your account platform — TikTok account = TikTok links only.",
      "You must submit within 2 hours after posting. Older clips cannot be uploaded.",
      "Each campaign has a daily clip limit (usually 3 per day). Check before submitting.",
      "Your clip will be reviewed within 24–48 hours. Approved clips start earning based on views.",
      "Note: YouTube clip tracking is not yet available — TikTok and Instagram clips are tracked automatically.",
    ],
  },
  {
    icon: <DollarSign className="h-5 w-5 text-accent" />,
    title: "How earnings work",
    content: [
      "Earnings = (views ÷ 1,000) × Clipper CPM rate. Each campaign sets its own CPM.",
      "Your clip must reach the campaign's minimum view threshold before it earns anything.",
      "Once past the threshold, earnings are calculated on all views, up to the max payout per clip.",
      "Level and streak bonuses increase your earnings (see below). Bonuses come from the campaign budget.",
      "Each campaign has its own separate balance. View your balances on the Earnings page.",
    ],
  },
  {
    icon: <Wallet className="h-5 w-5 text-accent" />,
    title: "Requesting payouts",
    content: [
      "Go to Payouts to see your available balance per campaign.",
      "Minimum payout is $10 per campaign. Each campaign must reach $10 independently.",
      "Select a campaign, enter the amount, your wallet address (crypto), and Discord username.",
      "Platform fee: 9% standard, or 4% if you were referred by another user.",
      "Status flow: Requested → Under Review → Approved → Paid.",
      "Once requested, that amount is locked and cannot be withdrawn again until processed.",
    ],
  },
  {
    icon: <Star className="h-5 w-5 text-accent" />,
    title: "Levels & bonuses",
    content: [
      "Everyone starts at Level 0. As your total lifetime earnings grow, you permanently unlock higher levels.",
      "Level 0: $0 (0%) → Level 1: $300 (+3%) → Level 2: $1,000 (+6%) → Level 3: $2,500 (+10%) → Level 4: $8,000 (+15%) → Level 5: $20,000 (+20%).",
      "Levels are permanent. They never go down, even if you take a break.",
      "Your level bonus increases your earnings from the campaign budget. Higher level = more money per clip.",
    ],
  },
  {
    icon: <Flame className="h-5 w-5 text-accent" />,
    title: "Streaks & daily activity",
    content: [
      "Post at least 1 approved clip per day to build your streak. Rejected or flagged clips do NOT count.",
      "Milestones: 3 days (+2%), 7 days (+4%), 14 days (+5%), 30 days (+7%), 60 days (+9%).",
      "Streak bonuses are temporary — they reset if you miss a day. But your level bonus stays forever.",
      "Only real, approved clips count. No botted or invalid clips.",
      "Check the Progress page for a visual 30-day streak grid (expandable to 60 days).",
    ],
  },
  {
    icon: <Users className="h-5 w-5 text-accent" />,
    title: "Referrals & invites",
    content: [
      "Every clipper gets a personal referral link on the Progress page.",
      "When someone signs up through your link, you earn 5% of their approved earnings, forever.",
      "Referred users also benefit: they get a reduced platform fee of 4% instead of 9%.",
      "There's no limit on referrals. The more people you invite, the more passive income you earn.",
    ],
  },
  {
    icon: <Shield className="h-5 w-5 text-accent" />,
    title: "Trust & verification",
    content: [
      "Every clipper has a trust score that affects review priority.",
      "Approved clips increase your trust. Rejected or flagged clips decrease it.",
      "Always submit real, original content. Never use bots or fake engagement.",
      "Suspicious engagement patterns are automatically detected and flagged for review.",
    ],
  },
  {
    icon: <AlertTriangle className="h-5 w-5 text-accent" />,
    title: "Rules & policies",
    content: [
      "Each campaign has specific content requirements. Read them carefully before submitting.",
      "Clips with bought views, fake engagement, or bot activity will be flagged and rejected.",
      "Repeated violations will result in a permanent account ban.",
      "If you have questions or disputes, open a Discord support ticket via the link in the sidebar.",
    ],
  },
];

const faqs = [
  {
    q: "What do the bonus percentages mean?",
    a: "Your bonus % is added on top of your base earnings. For example, if you earned $1,000 and have a +10% bonus, you get $1,100 instead of $1,000. Your total bonus = level bonus + streak bonus.",
  },
  {
    q: "Can I lose my level?",
    a: "No. Your level is permanent. Once you reach Level 2, you stay at Level 2 forever, even if you stop posting. Only streak bonuses reset if you miss a day.",
  },
  {
    q: "What counts as an active day for my streak?",
    a: "You need at least 1 approved clip that day. Rejected or flagged clips do not count toward your streak.",
  },
  {
    q: "How do referrals work?",
    a: "Share your personal link from the Progress page. When someone signs up through it, you earn 5% of their approved earnings forever. They also get a reduced 4% platform fee (instead of 9%).",
  },
  {
    q: "What's the platform fee?",
    a: "9% for standard users, 4% for referred users. This fee is deducted from your payout when you request a withdrawal.",
  },
  {
    q: "Which platforms are supported?",
    a: "TikTok and Instagram clips are tracked automatically with real view counts. YouTube accounts can be added but clip tracking is not yet available.",
  },
];

export default function HelpPage() {
  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      <div className="text-center">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-accent/10 mb-3">
          <HelpCircle className="h-6 w-6 text-accent" />
        </div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Help & Tutorial</h1>
        <p className="text-[15px] text-[var(--text-secondary)] mt-1">Everything you need to know about using Clippers HQ.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {sections.map((section) => (
          <Card key={section.title}>
            <div className="flex items-center gap-3 mb-3">
              {section.icon}
              <h2 className="text-[16px] font-semibold text-[var(--text-primary)]">{section.title}</h2>
            </div>
            <ul className="space-y-2">
              {section.content.map((line, i) => (
                <li key={i} className="flex items-start gap-2 text-sm text-[var(--text-secondary)]">
                  <span className="text-accent mt-1.5 text-[8px]">●</span>
                  {line}
                </li>
              ))}
            </ul>
          </Card>
        ))}
      </div>

      <div className="space-y-4">
        <h2 className="text-lg font-semibold text-[var(--text-primary)] text-center">Frequently Asked Questions</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {faqs.map((faq, i) => (
            <Card key={i}>
              <p className="text-sm font-semibold text-[var(--text-primary)] mb-1">{faq.q}</p>
              <p className="text-sm text-[var(--text-secondary)]">{faq.a}</p>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}
