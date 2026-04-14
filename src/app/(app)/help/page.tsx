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
        <h2 className="text-[15px] sm:text-[16px] lg:text-lg font-semibold text-[var(--text-primary)] flex-1">{title}</h2>
        <ChevronDown className={`h-4 w-4 text-[var(--text-muted)] transition-transform flex-shrink-0 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-4 text-sm lg:text-base text-[var(--text-secondary)] space-y-3">
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
        <p className="mt-2">Note: You must submit your clip within 2 hours of posting it. Older clips cannot be uploaded.</p>
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
                <p className="font-bold text-[var(--text-primary)]">{m.days} days</p>
                <p className="font-bold text-accent">+{m.bonus}%</p>
              </div>
            ))}
          </div>
          <p>The bonus applies to <strong className="text-accent">ALL</strong> your earnings across ALL campaigns.</p>
          <div className="rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] p-3 space-y-1.5">
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
                  <span className="text-[var(--text-primary)] font-medium">{l.name}</span>
                  <span className="text-[var(--text-muted)]">{l.earn} earned</span>
                </div>
                <span className="font-bold text-accent">{l.bonus}</span>
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
        <div className="space-y-4">
          <p><strong className="font-bold text-[var(--text-primary)]">Don't panic.</strong> You can submit another clip the same day. Check why it was rejected:</p>
          <div className="space-y-3">
            <p className="pl-4 border-l-2 border-accent/30">Did you follow the <strong className="font-bold text-[var(--text-primary)]">campaign requirements</strong>?</p>
            <p className="pl-4 border-l-2 border-accent/30">Was the video <strong className="font-bold text-[var(--text-primary)]">high quality</strong>?</p>
            <p className="pl-4 border-l-2 border-accent/30">Was it posted on the <strong className="font-bold text-[var(--text-primary)]">right platform</strong>?</p>
          </div>
          <p>If <strong className="text-accent font-bold">3 or more</strong> clips get rejected in a row, you'll get a <strong className="font-bold text-[var(--text-primary)]">warning</strong>. Make sure you read the campaign requirements carefully before posting.</p>
        </div>
      ),
    },
    {
      icon: <TrendingUp className="h-5 w-5 text-accent flex-shrink-0" />,
      title: "Tips for earning more",
      content: (
        <div className="space-y-3">
          <p className="pl-4 border-l-2 border-accent/30">Join <strong className="font-bold text-[var(--text-primary)]">multiple campaigns</strong> to maximize your earnings potential.</p>
          <p className="pl-4 border-l-2 border-accent/30">Post <strong className="font-bold text-[var(--text-primary)]">consistently</strong> every day to build your <strong className="font-bold text-[var(--text-primary)]">streak bonus</strong>.</p>
          <p className="pl-4 border-l-2 border-accent/30">Follow campaign requirements <strong className="font-bold text-[var(--text-primary)]">exactly</strong> — rejected clips waste your time.</p>
          <p className="pl-4 border-l-2 border-accent/30"><strong className="font-bold text-[var(--text-primary)]">Higher view counts</strong> = more money. Focus on making engaging content.</p>
          <p className="pl-4 border-l-2 border-accent/30">Refer friends — you earn <strong className="text-accent font-bold">5%</strong> of their earnings <strong className="font-bold text-[var(--text-primary)]">forever</strong>, and they get a reduced <strong className="text-accent font-bold">4%</strong> fee.</p>
        </div>
      ),
    },
    {
      icon: <Eye className="h-5 w-5 text-accent flex-shrink-0" />,
      title: "How to get more views",
      content: (
        <div className="space-y-3">
          <p className="pl-4 border-l-2 border-accent/30">Post <strong className="font-bold text-[var(--text-primary)]">consistently</strong> — the algorithm rewards <strong className="font-bold text-[var(--text-primary)]">daily posting</strong>.</p>
          <p className="pl-4 border-l-2 border-accent/30">Use <strong className="font-bold text-[var(--text-primary)]">trending sounds</strong> and <strong className="font-bold text-[var(--text-primary)]">hashtags</strong> to reach more people.</p>
          <p className="pl-4 border-l-2 border-accent/30"><strong className="font-bold text-[var(--text-primary)]">Hook viewers</strong> in the first <strong className="text-accent font-bold">1-2 seconds</strong>. If they scroll past, you lose them.</p>
          <p className="pl-4 border-l-2 border-accent/30">Keep clips <strong className="font-bold text-[var(--text-primary)]">short</strong> — <strong className="text-accent font-bold">15-30 seconds</strong> performs best on all platforms.</p>
          <p className="pl-4 border-l-2 border-accent/30">Post at <strong className="font-bold text-[var(--text-primary)]">peak hours</strong> — usually <strong className="text-accent font-bold">6-9 PM</strong> in your target audience's timezone.</p>
          <p className="pl-4 border-l-2 border-accent/30"><strong className="font-bold text-[var(--text-primary)]">Engage with comments</strong> on your clips — it boosts the algorithm.</p>
          <p className="pl-4 border-l-2 border-accent/30">Check our Discord channel <strong className="font-bold text-[var(--text-primary)]">#how-to-hit-usa</strong> for detailed guides on reaching <strong className="font-bold text-[var(--text-primary)]">US audiences</strong>.</p>
        </div>
      ),
    },
    {
      icon: <ShieldCheck className="h-5 w-5 text-accent flex-shrink-0" />,
      title: "How to avoid rejections",
      content: (
        <div className="space-y-3">
          <p className="pl-4 border-l-2 border-accent/30">Read the campaign requirements <strong className="font-bold text-[var(--text-primary)]">CAREFULLY</strong> before making your clip.</p>
          <p className="pl-4 border-l-2 border-accent/30">Make sure your clip matches the <strong className="font-bold text-[var(--text-primary)]">brand's style</strong> and message.</p>
          <p className="pl-4 border-l-2 border-accent/30">Don't use <strong className="font-bold text-[var(--text-primary)]">copyrighted music</strong> unless the campaign says it's okay.</p>
          <p className="pl-4 border-l-2 border-accent/30">Don't use <strong className="font-bold text-[var(--text-primary)]">bots</strong> or <strong className="font-bold text-[var(--text-primary)]">fake engagement</strong> — we detect it automatically.</p>
          <p className="pl-4 border-l-2 border-accent/30">Don't submit clips older than <strong className="text-accent font-bold">2 hours</strong>.</p>
          <p className="pl-4 border-l-2 border-accent/30">Don't submit the <strong className="font-bold text-[var(--text-primary)]">same clip</strong> to multiple campaigns.</p>
          <p className="pl-4 border-l-2 border-accent/30">Check your <strong className="font-bold text-[var(--text-primary)]">clip URL</strong> is correct before submitting.</p>
        </div>
      ),
    },
    {
      icon: <MessageCircle className="h-5 w-5 text-accent flex-shrink-0" />,
      title: "Discord community",
      content: (
        <>
          <p>Join our <strong className="font-bold text-[var(--text-primary)]">Discord server</strong> for support, tips, and community.</p>
          <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
            {["#announcements", "#video-ideas", "#how-to-hit-usa", "#sounds-to-use", "#editing-course", "#payouts", "#tickets"].map((ch) => (
              <span key={ch} className="rounded-lg border border-[var(--border-color)] px-2 py-1.5 text-center font-medium text-[var(--text-primary)]">{ch}</span>
            ))}
          </div>
          <p className="mt-3">Open a <strong className="font-bold text-[var(--text-primary)]">support ticket</strong> if you have any issues.</p>
          <a href="https://discord.gg/JtKkbGWN" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 mt-3 rounded-lg bg-accent/10 border border-accent/20 px-4 py-2 font-medium text-accent hover:bg-accent/20 transition-colors">
            <MessageCircle className="h-4 w-4" /> Join Discord
          </a>
        </>
      ),
    },
    {
      icon: <Users className="h-5 w-5 text-accent flex-shrink-0" />,
      title: "Referral program",
      content: (
        <div className="space-y-3">
          <p className="pl-4 border-l-2 border-accent/30">Share your referral link from the <strong className="font-bold text-[var(--text-primary)]">Referrals</strong> page.</p>
          <p className="pl-4 border-l-2 border-accent/30">When someone signs up through your link, you earn <strong className="text-accent font-bold">5%</strong> of their <strong className="font-bold text-[var(--text-primary)]">approved earnings forever</strong>.</p>
          <p className="pl-4 border-l-2 border-accent/30">They get a reduced platform fee: <strong className="text-accent font-bold">4%</strong> instead of <strong className="text-accent font-bold">9%</strong>.</p>
          <p className="pl-4 border-l-2 border-accent/30"><strong className="font-bold text-[var(--text-primary)]">No limit</strong> on referrals — invite as many friends as you want.</p>
          <p className="pl-4 border-l-2 border-accent/30">The more <strong className="font-bold text-[var(--text-primary)]">active clippers</strong> you refer, the more <strong className="font-bold text-[var(--text-primary)]">passive income</strong> you earn.</p>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="text-center mb-6">
        <div className="inline-flex items-center justify-center h-12 w-12 rounded-2xl bg-accent/10 mb-3">
          <HelpCircle className="h-6 w-6 text-accent" />
        </div>
        <h1 className="text-2xl lg:text-3xl font-bold text-[var(--text-primary)]">Help Center</h1>
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
