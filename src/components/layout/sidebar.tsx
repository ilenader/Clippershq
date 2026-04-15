"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Megaphone,
  UserCircle,
  Film,
  DollarSign,
  Wallet,
  Users,
  Flag,
  ClipboardList,
  Settings,
  Activity,
  Star,
  Shield,
  MessageCircle,
  Archive,
  HelpCircle,
  Trophy,
  Phone,
  Smartphone,
  BookOpen,
} from "lucide-react";
import { useState } from "react";
import { useInstallPrompt } from "@/hooks/use-pwa";
import { PWAInstallInstructions } from "@/components/pwa-install-popup";

interface NavItem {
  label: string;
  href: string;
  icon: React.ReactNode;
}

interface NavSection {
  title?: string;
  items: NavItem[];
}

const clipperNav: NavSection[] = [
  {
    items: [
      { label: "Dashboard", href: "/dashboard", icon: <LayoutDashboard className="h-[18px] w-[18px]" /> },
      { label: "Campaigns", href: "/campaigns", icon: <Megaphone className="h-[18px] w-[18px]" /> },
      { label: "Accounts", href: "/accounts", icon: <UserCircle className="h-[18px] w-[18px]" /> },
      { label: "Clips", href: "/clips", icon: <Film className="h-[18px] w-[18px]" /> },
      { label: "Earnings", href: "/earnings", icon: <DollarSign className="h-[18px] w-[18px]" /> },
      { label: "Progress", href: "/progress", icon: <Trophy className="h-[18px] w-[18px]" /> },
      { label: "Referrals", href: "/referrals", icon: <Users className="h-[18px] w-[18px]" /> },
      { label: "Payouts", href: "/payouts", icon: <Wallet className="h-[18px] w-[18px]" /> },
      { label: "Help", href: "/help", icon: <HelpCircle className="h-[18px] w-[18px]" /> },
    ],
  },
];

// Admin sees only: Dashboard, Campaigns, Clips (for their assigned campaigns)
const adminNav: NavSection[] = [
  {
    title: "Overview",
    items: [
      { label: "Dashboard", href: "/admin", icon: <LayoutDashboard className="h-[18px] w-[18px]" /> },
    ],
  },
  {
    title: "Manage",
    items: [
      { label: "Campaigns", href: "/admin/campaigns", icon: <Megaphone className="h-[18px] w-[18px]" /> },
      { label: "Clips", href: "/admin/clips", icon: <Film className="h-[18px] w-[18px]" /> },
      { label: "Analytics", href: "/admin/analytics", icon: <Activity className="h-[18px] w-[18px]" /> },
      { label: "Referrals", href: "/admin/referrals", icon: <Users className="h-[18px] w-[18px]" /> },
    ],
  },
];

// Owner sees everything admin sees, plus these extra sections
const ownerManageNav: NavSection = {
  title: "Owner manage",
  items: [
    { label: "Accounts", href: "/admin/accounts", icon: <ClipboardList className="h-[18px] w-[18px]" /> },
    { label: "Payouts", href: "/admin/payouts", icon: <Wallet className="h-[18px] w-[18px]" /> },
    { label: "Calls", href: "/admin/calls", icon: <Phone className="h-[18px] w-[18px]" /> },
    { label: "Flags", href: "/admin/flags", icon: <Flag className="h-[18px] w-[18px]" /> },
    { label: "Submit Clip", href: "/admin/submit-clip", icon: <Film className="h-[18px] w-[18px]" /> },
  ],
};

const ownerExtraNav: NavSection = {
  title: "Owner",
  items: [
    { label: "Archive", href: "/admin/archive", icon: <Archive className="h-[18px] w-[18px]" /> },
    { label: "Team", href: "/admin/team", icon: <Shield className="h-[18px] w-[18px]" /> },
    { label: "Agency Earnings", href: "/admin/agency-earnings", icon: <DollarSign className="h-[18px] w-[18px]" /> },
    { label: "AI Knowledge", href: "/admin/knowledge", icon: <BookOpen className="h-[18px] w-[18px]" /> },
    { label: "Gamification", href: "/admin/settings", icon: <Settings className="h-[18px] w-[18px]" /> },
  ],
};

interface SidebarProps {
  role: "CLIPPER" | "ADMIN" | "OWNER";
}

export function Sidebar({ role }: SidebarProps) {
  const pathname = usePathname();
  const { theme } = useTheme();
  const { isInstalled, hasNativePrompt, triggerNativeInstall } = useInstallPrompt();
  const [showInstallModal, setShowInstallModal] = useState(false);
  const isAdmin = role === "ADMIN" || role === "OWNER";

  let sections = isAdmin ? [...adminNav] : clipperNav;
  if (role === "OWNER") {
    sections = [...sections, ownerManageNav, ownerExtraNav];
  }

  return (
    <aside className="fixed left-0 top-0 z-40 flex h-full w-60 flex-col border-r border-[var(--border-color)] bg-[var(--bg-secondary)] transition-theme">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-5 border-b border-[var(--border-color)]">
        <div className="flex h-8 w-8 items-center justify-center">
          <svg viewBox="0 0 100 100" className="h-7 w-7 text-[var(--text-primary)]">
            <polygon
              points="50,10 90,85 10,85"
              fill="currentColor"
            />
          </svg>
        </div>
        <div>
          <span className="text-[15px] font-bold tracking-tight text-[var(--text-primary)]">
            CLIPPERS HQ
          </span>
          {isAdmin && (
            <p className="text-[10px] font-medium uppercase tracking-widest text-[var(--text-muted)]">
              {role === "OWNER" ? "Owner" : "Admin"}
            </p>
          )}
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section, i) => (
          <div key={i} className={i > 0 ? "mt-6" : ""}>
            {section.title && (
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
                {section.title}
              </p>
            )}
            <div className="space-y-1">
              {section.items.map((item) => {
                const isActive = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(item.href + "/"));
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium transition-all duration-150",
                      isActive
                        ? "bg-accent/10 text-accent"
                        : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)]"
                    )}
                  >
                    {item.icon}
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom */}
      <div className="border-t border-[var(--border-color)] px-4 py-4 space-y-1">
        {role !== "OWNER" && (
          <a
            href="https://discord.gg/7TpufG6ak6"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-all"
          >
            <MessageCircle className="h-[18px] w-[18px] text-accent" />
            Join our Discord
          </a>
        )}
        {!isInstalled && role !== "OWNER" && (
          <button
            onClick={async () => {
              if (hasNativePrompt) {
                const success = await triggerNativeInstall();
                if (success) {
                  fetch("/api/user/pwa-status", { method: "POST" }).catch(() => {});
                  return;
                }
              }
              // No native prompt or user declined — show instructions modal
              setShowInstallModal(true);
            }}
            className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-card-hover)] transition-all cursor-pointer"
          >
            <Smartphone className="h-[18px] w-[18px] text-accent" />
            <span>Download App</span>
            <span className="ml-auto rounded-md bg-accent/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent">+2%</span>
          </button>
        )}
        <PWAInstallInstructions open={showInstallModal} onClose={() => setShowInstallModal(false)} />
      </div>
    </aside>
  );
}
