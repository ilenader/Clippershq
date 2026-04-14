"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { HelpCircle, ChevronDown, Rocket, Film, DollarSign, Flame, Star, Wallet, XCircle, TrendingUp, Eye, ShieldCheck, MessageCircle, Users } from "lucide-react";

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
        <>
        <ol className="space-y-2 list-none">
          <li className="flex gap-2"><span className="text-accent font-bold">1.</span> Connect your social media accounts (TikTok, Instagram, YouTube)</li>
          <li className="flex gap-2"><span className="text-accent font-bold">2.</span> Join a campaign that interests you</li>
          <li className="flex gap-2"><span className="text-accent font-bold">3.</span> Follow the campaign requirements</li>
          <li className="flex gap-2"><span className="text-accent font-bold">4.</span> Post your clip on your social media</li>
          <li className="flex gap-2"><span className="text-accent font-bold">5.</span> Submit the clip URL on the platform (within 2 hours of posting)</li>
          <li className="flex gap-2"><span className="text-accent font-bold">6.</span> Wait for approval — once approved, you start earning</li>
        </ol>
        <p className="text-xs text-[var(--text-muted)] mt-2">Note: You must submit your clip within 2 hours of posting it. Older clips cannot be uploaded.</p>
        </>
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
              { level: 0, name: "Rookie", earn: "$0", bonus: "—" },
              { level: 1, name: "Clipper", earn: "$300", bonus: "+3%" },
              { level: 2, name: "Creator", earn: "$1,000", bonus: "+6%" },
              { level: 3, name: "Influencer", earn: "$2,500", bonus: "+10%" },
              { level: 4, name: "Viral", earn: "$8,000", bonus: "+15%" },
              { level: 5, name: "Icon", earn: "$20,000", bonus: "+20%" },
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
    {
      icon: <Eye className="h-5 w-5 text-accent flex-shrink-0" />,
      title: "How to get more views",
      content: (
        <ul className="space-y-2 list-none">
          <li className="flex items-start gap-2"><span className="text-accent mt-0.5">-</span> Post consistently — the algorithm rewards daily posting</li>
          <li className="flex items-start gap-2"><span className="text-accent mt-0.5">-</span> Use trending sounds and hashtags</li>
          <li className="flex items-start gap-2"><span className="text-accent mt-0.5">-</span> Hook viewers in the first 1-2 seconds</li>
          <li className="flex items-start gap-2"><span className="text-accent mt-0.5">-</span> Keep clips short — 15-30 seconds performs best</li>
          <li className="flex items-start gap-2"><span className="text-accent mt-0.5">-</span> Post at peak hours — usually 6-9 PM in your target audience's timezone</li>
          <li className="flex items-start gap-2"><span className="text-accent mt-0.5">-</span> Engage with comments on your clips</li>
          <li className="flex items-start gap-2"><span className="text-accent mt-0.5">-</span> Check our Discord channel <strong className="text-[var(--text-primary)]">#how-to-hit-usa</strong> for detailed guides on reaching US audiences</li>
        </ul>
      ),
    },
    {
      icon: <ShieldCheck className="h-5 w-5 text-accent flex-shrink-0" />,
      title: "How to avoid rejections",
      content: (
        <ul className="space-y-2 list-none">
          <li className="flex items-start gap-2"><span className="text-accent mt-0.5">-</span> Read the campaign requirements <strong className="text-[var(--text-primary)]">CAREFULLY</strong> before making your clip</li>
          <li className="flex items-start gap-2"><span className="text-accent mt-0.5">-</span> Make sure your clip matches the brand's style and message</li>
          <li className="flex items-start gap-2"><span className="text-accent mt-0.5">-</span> Don't use copyrighted music unless the campaign says it's okay</li>
          <li className="flex items-start gap-2"><span className="text-accent mt-0.5">-</span> Don't use bots or fake engagement — we detect it automatically</li>
          <li className="flex items-start gap-2"><span className="text-accent mt-0.5">-</span> Don't submit clips older than 2 hours</li>
          <li className="flex items-start gap-2"><span className="text-accent mt-0.5">-</span> Don't submit the same clip to multiple campaigns</li>
          <li className="flex items-start gap-2"><span className="text-accent mt-0.5">-</span> Check your clip URL is correct before submitting</li>
        </ul>
      ),
    },
    {
      icon: <MessageCircle className="h-5 w-5 text-accent flex-shrink-0" />,
      title: "Discord community",
      content: (
        <>
          <p>Join our Discord server for support, tips, and community.</p>
          <div className="mt-2 space-y-1 text-xs">
            <p>Channels: <strong className="text-[var(--text-primary)]">#announcements</strong>, <strong className="text-[var(--text-primary)]">#video-ideas</strong>, <strong className="text-[var(--text-primary)]">#how-to-hit-usa</strong>, <strong className="text-[var(--text-primary)]">#sounds-to-use</strong>, <strong className="text-[var(--text-primary)]">#editing-course</strong>, <strong className="text-[var(--text-primary)]">#payouts</strong>, <strong className="text-[var(--text-primary)]">#tickets</strong></p>
            <p>Open a support ticket if you have any issues.</p>
          </div>
          <a href="https://discord.gg/JtKkbGWN" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 mt-3 rounded-lg bg-accent/10 border border-accent/20 px-4 py-2 text-sm font-medium text-accent hover:bg-accent/20 transition-colors">
            <MessageCircle className="h-4 w-4" /> Join Discord
          </a>
        </>
      ),
    },
    {
      icon: <Users className="h-5 w-5 text-accent flex-shrink-0" />,
      title: "Referral program",
      content: (
        <>
          <ul className="space-y-2 list-none">
            <li className="flex items-start gap-2"><span className="text-accent mt-0.5">-</span> Share your referral link from the <strong className="text-[var(--text-primary)]">Referrals</strong> page</li>
            <li className="flex items-start gap-2"><span className="text-accent mt-0.5">-</span> When someone signs up through your link, you earn <strong className="text-accent">5%</strong> of their approved earnings forever</li>
            <li className="flex items-start gap-2"><span className="text-accent mt-0.5">-</span> They get a reduced platform fee: <strong className="text-accent">4%</strong> instead of 9%</li>
            <li className="flex items-start gap-2"><span className="text-accent mt-0.5">-</span> No limit on referrals — invite as many friends as you want</li>
            <li className="flex items-start gap-2"><span className="text-accent mt-0.5">-</span> The more active clippers you refer, the more passive income you earn</li>
          </ul>
        </>
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
