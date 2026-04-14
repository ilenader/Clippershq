"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { HelpCircle, ChevronDown, Rocket, Film, DollarSign, Flame, Star, Wallet, XCircle, TrendingUp } from "lucide-react";

interface HelpSection {
  icon: React.ReactNode;
  title: string;
  content: React.ReactNode;
}

function Collapsible({ icon, title, content, defaultOpen }: HelpSection & { defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen || false);
  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-3 w-full text-left cursor-pointer"
      >
        {icon}
        <h2 className="text-[15px] sm:text-[16px] font-semibold text-[var(--text-primary)] flex-1">{title}</h2>
        <ChevronDown className={`h-4 w-4 text-[var(--text-muted)] transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-4 text-sm text-[var(--text-secondary)] space-y-3">
          {content}
        </div>
      )}
    </Card>
  );
}

export default function HelpPage() {
  const sections: (HelpSection & { defaultOpen?: boolean })[] = [
    {
      icon: <HelpCircle className="h-5 w-5 text-accent flex-shrink-0" />,
      title: "What is Clippers HQ?",
      defaultOpen: true,
      content: (
        <>
          <p>Clippers HQ connects you with brands who want short videos on TikTok, Instagram Reels, and YouTube Shorts.</p>
          <p>You make clips. You earn money. The more views your clips get, the more you earn.</p>
        </>
      ),
    },
    {
      icon: <Rocket className="h-5 w-5 text-accent flex-shrink-0" />,
      title: "How do I start?",
      content: (
        <ol className="space-y-2 list-none">
          <li className="flex gap-2"><span className="text-accent font-bold">1.</span> Connect your social media accounts (TikTok, Instagram, YouTube)</li>
          <li className="flex gap-2"><span className="text-accent font-bold">2.</span> Join a campaign that interests you</li>
          <li className="flex gap-2"><span className="text-accent font-bold">3.</span> Follow the campaign requirements</li>
          <li className="flex gap-2"><span className="text-accent font-bold">4.</span> Post your clip on your social media</li>
          <li className="flex gap-2"><span className="text-accent font-bold">5.</span> Submit the clip URL on the platform</li>
          <li className="flex gap-2"><span className="text-accent font-bold">6.</span> Wait for approval — once approved, you start earning</li>
        </ol>
      ),
    },
    {
      icon: <DollarSign className="h-5 w-5 text-accent flex-shrink-0" />,
      title: "How do I earn money?",
      content: (
        <>
          <p>You earn based on views. Each campaign has a <strong className="text-[var(--text-primary)]">CPM rate</strong> (cost per 1,000 views).</p>
          <p>Example: if CPM is <strong className="text-accent">$1.00</strong> and your clip gets <strong className="text-accent">50,000 views</strong>, you earn <strong className="text-accent">$50</strong>.</p>
          <p>Your earnings update automatically as your clip gets more views. We check your views regularly.</p>
        </>
      ),
    },
    {
      icon: <Flame className="h-5 w-5 text-accent flex-shrink-0" />,
      title: "What are streaks?",
      content: (
        <>
          <p>Post at least 1 clip every day to build a streak. Streaks give you <strong className="text-[var(--text-primary)]">bonus earnings</strong> on top of everything you make.</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 my-2">
            {[
              { days: 3, bonus: 1 }, { days: 7, bonus: 2 }, { days: 14, bonus: 3 },
              { days: 30, bonus: 5 }, { days: 60, bonus: 7 }, { days: 90, bonus: 10 },
            ].map((m) => (
              <div key={m.days} className="rounded-lg border border-[var(--border-color)] px-3 py-2 text-center">
                <p className="text-sm font-bold text-[var(--text-primary)]">{m.days} days</p>
                <p className="text-xs font-bold text-accent">+{m.bonus}%</p>
              </div>
            ))}
          </div>
          <p>The bonus applies to <strong className="text-accent">ALL</strong> your earnings across ALL campaigns.</p>
          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-3 space-y-1.5 text-xs">
            <p className="font-medium text-[var(--text-primary)]">Important:</p>
            <ul className="space-y-1 list-none">
              <li>You have 24 hours (your local time) to post each day</li>
              <li>When you submit a clip, your streak is safe while we review it</li>
              <li>If we reject your clip, you can submit another one before the day ends</li>
              <li>If all your clips for a day are rejected and the day is over, your streak resets</li>
              <li>If none of your campaigns are active, your streak freezes automatically — no penalty</li>
              <li className="text-accent font-medium">Tip: Submit 2-3 clips per day to be safe</li>
            </ul>
          </div>
        </>
      ),
    },
    {
      icon: <Star className="h-5 w-5 text-accent flex-shrink-0" />,
      title: "What are levels?",
      content: (
        <>
          <p>The more you earn, the higher your level. Each level gives you a <strong className="text-[var(--text-primary)]">permanent bonus</strong> that never resets, even if you take a break.</p>
          <div className="space-y-1.5 my-2">
            {[
              { level: 0, name: "Starter", earn: "$0", bonus: "—" },
              { level: 1, name: "Rising", earn: "$300", bonus: "+3%" },
              { level: 2, name: "Proven", earn: "$1,000", bonus: "+6%" },
              { level: 3, name: "Expert", earn: "$2,500", bonus: "+10%" },
              { level: 4, name: "Elite", earn: "$8,000", bonus: "+15%" },
              { level: 5, name: "Legend", earn: "$20,000", bonus: "+20%" },
            ].map((l) => (
              <div key={l.level} className="flex items-center justify-between rounded-lg border border-[var(--border-color)] px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="flex h-6 w-6 items-center justify-center rounded bg-accent/20 text-xs font-bold text-accent">{l.level}</span>
                  <span className="text-sm text-[var(--text-primary)] font-medium">{l.name}</span>
                  <span className="text-xs text-[var(--text-muted)]">{l.earn} earned</span>
                </div>
                <span className="text-sm font-bold text-accent">{l.bonus}</span>
              </div>
            ))}
          </div>
          <p>Level bonuses <strong className="text-[var(--text-primary)]">stack</strong> with streak bonuses. Example: Level 2 (+6%) + 30-day streak (+5%) = <strong className="text-accent">+11%</strong> on all earnings.</p>
        </>
      ),
    },
    {
      icon: <Wallet className="h-5 w-5 text-accent flex-shrink-0" />,
      title: "How do payouts work?",
      content: (
        <>
          <ol className="space-y-2 list-none">
            <li className="flex gap-2"><span className="text-accent font-bold">1.</span> Go to the Payouts page</li>
            <li className="flex gap-2"><span className="text-accent font-bold">2.</span> Pick a campaign and enter the amount you want</li>
            <li className="flex gap-2"><span className="text-accent font-bold">3.</span> Enter your wallet address and Discord username</li>
            <li className="flex gap-2"><span className="text-accent font-bold">4.</span> Click "Request Payout"</li>
            <li className="flex gap-2"><span className="text-accent font-bold">5.</span> We review and process your payout</li>
          </ol>
          <p className="mt-2">Minimum payout: <strong className="text-accent">$10</strong> per campaign.</p>
          <p>Platform fee: <strong className="text-[var(--text-primary)]">9%</strong> standard, or <strong className="text-accent">4%</strong> if you were referred by another clipper.</p>
        </>
      ),
    },
    {
      icon: <XCircle className="h-5 w-5 text-accent flex-shrink-0" />,
      title: "What if my clip gets rejected?",
      content: (
        <>
          <p>Don't panic. You can submit another clip the same day. Check why it was rejected:</p>
          <ul className="space-y-1 list-none text-xs">
            <li>Did you follow the campaign requirements?</li>
            <li>Was the video high quality?</li>
            <li>Was it posted on the right platform?</li>
          </ul>
          <p className="mt-2">If 3 or more clips get rejected in a row, you'll get a warning. Make sure you read the campaign requirements carefully before posting.</p>
        </>
      ),
    },
    {
      icon: <TrendingUp className="h-5 w-5 text-accent flex-shrink-0" />,
      title: "Tips for earning more",
      content: (
        <ul className="space-y-2 list-none">
          <li className="flex items-start gap-2"><span className="text-accent mt-0.5">-</span> Join multiple campaigns to maximize earnings</li>
          <li className="flex items-start gap-2"><span className="text-accent mt-0.5">-</span> Post consistently to build your streak bonus</li>
          <li className="flex items-start gap-2"><span className="text-accent mt-0.5">-</span> Follow campaign requirements exactly — rejected clips waste your time</li>
          <li className="flex items-start gap-2"><span className="text-accent mt-0.5">-</span> Higher view counts = more money</li>
          <li className="flex items-start gap-2"><span className="text-accent mt-0.5">-</span> Refer friends — you earn 5% of their earnings forever, and they get a reduced 4% fee</li>
        </ul>
      ),
    },
  ];

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-accent/10 mb-3">
          <HelpCircle className="h-6 w-6 text-accent" />
        </div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)]">Help Center</h1>
        <p className="text-[15px] text-[var(--text-secondary)] mt-1">Everything you need to know. Click a section to expand.</p>
      </div>

      <div className="space-y-3">
        {sections.map((section) => (
          <Collapsible key={section.title} {...section} />
        ))}
      </div>
    </div>
  );
}
