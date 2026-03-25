/**
 * File-based persistent store for dev mode when no database is available.
 * Data persists across server restarts via a JSON file.
 * Only used when DB writes fail.
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

// ─── File persistence ───────────────────────────────────────

const DATA_DIR = join(process.cwd(), ".dev-data");
const DATA_FILE = join(DATA_DIR, "store.json");

interface StoreData {
  campaigns: StoredCampaign[];
  accounts: StoredAccount[];
  clips: StoredClip[];
  campaignAccounts: StoredCampaignAccount[];
  payouts: StoredPayout[];
}

function loadStore(): StoreData {
  try {
    if (existsSync(DATA_FILE)) {
      const raw = readFileSync(DATA_FILE, "utf-8");
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn("Failed to load dev store, starting fresh:", err);
  }
  return { campaigns: [], accounts: [], clips: [], campaignAccounts: [], payouts: [] };
}

function saveStore(data: StoreData): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch (err) {
    console.warn("Failed to save dev store:", err);
  }
}

// Use globalThis to survive Next.js HMR (hot module replacement).
// Without this, different API routes can get different module instances
// with separate _cache variables, causing writes in one route to be
// invisible to reads in another route.
const globalForDevStore = globalThis as unknown as { __devStoreCache: StoreData | null };

function getStore(): StoreData {
  if (!globalForDevStore.__devStoreCache) {
    globalForDevStore.__devStoreCache = loadStore();
  }
  return globalForDevStore.__devStoreCache;
}

function persist(): void {
  if (globalForDevStore.__devStoreCache) {
    saveStore(globalForDevStore.__devStoreCache);
  }
}

// ─── Types ──────────────────────────────────────────────────

interface StoredCampaign {
  id: string;
  name: string;
  clientName: string | null;
  platform: string;
  status: string;
  budget: number | null;
  cpmRate: number | null;
  payoutRule: string | null;
  minViews: number | null;
  maxPayoutPerClip: number | null;
  description: string | null;
  requirements: string | null;
  examples: string | null;
  soundLink: string | null;
  assetLink: string | null;
  imageUrl: string | null;
  bannedContent: string | null;
  captionRules: string | null;
  hashtagRules: string | null;
  videoLengthMin: number | null;
  videoLengthMax: number | null;
  reviewTiming: string | null;
  startDate: string | null;
  endDate: string | null;
  createdAt: string;
  updatedAt: string;
}

interface StoredAccount {
  id: string;
  userId: string;
  platform: string;
  username: string;
  profileLink: string;
  followerCount: number | null;
  contentNiche: string | null;
  country: string | null;
  status: string;
  rejectionReason: string | null;
  verificationCode: string | null;
  verifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

interface StoredCampaignAccount {
  id: string;
  clipAccountId: string;
  campaignId: string;
  joinedAt: string;
}

interface StoredClip {
  id: string;
  userId: string;
  campaignId: string;
  clipAccountId: string;
  clipUrl: string;
  note: string | null;
  status: string;
  rejectionReason: string | null;
  earnings: number;
  createdAt: string;
  updatedAt: string;
  campaign?: any;
  clipAccount?: any;
  stats?: any[];
}

interface StoredPayout {
  id: string;
  userId: string;
  amount: number;
  walletAddress: string;
  discordUsername: string | null;
  proofNote: string | null;
  proofFileUrl: string | null;
  status: string;
  rejectionReason: string | null;
  createdAt: string;
  updatedAt: string;
  user?: any;
}

function uid(): string {
  return "dev_" + Math.random().toString(36).slice(2, 11);
}

// ─── Campaigns ──────────────────────────────────────────────

export function devGetCampaigns(statusFilter?: string): StoredCampaign[] {
  const all = getStore().campaigns;
  if (statusFilter) return all.filter((c) => c.status === statusFilter);
  return all;
}

export function devGetCampaign(id: string): StoredCampaign | undefined {
  return getStore().campaigns.find((c) => c.id === id);
}

export function devCreateCampaign(data: Omit<StoredCampaign, "id" | "createdAt" | "updatedAt">): StoredCampaign {
  const store = getStore();
  const now = new Date().toISOString();
  const campaign: StoredCampaign = {
    ...data,
    imageUrl: (data as any).imageUrl || null,
    id: uid(),
    createdAt: now,
    updatedAt: now,
  };
  store.campaigns.unshift(campaign);
  persist();
  return campaign;
}

export function devUpdateCampaign(id: string, data: Partial<StoredCampaign>): StoredCampaign | null {
  const store = getStore();
  const idx = store.campaigns.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  store.campaigns[idx] = { ...store.campaigns[idx], ...data, updatedAt: new Date().toISOString() };
  persist();
  return store.campaigns[idx];
}

export function devDeleteCampaign(id: string): boolean {
  const store = getStore();
  const idx = store.campaigns.findIndex((c) => c.id === id);
  if (idx === -1) return false;
  store.campaigns.splice(idx, 1);
  persist();
  return true;
}

// ─── Accounts ───────────────────────────────────────────────

export function devGetAccounts(userId?: string, statusFilter?: string): StoredAccount[] {
  let all = getStore().accounts;
  if (userId) all = all.filter((a) => a.userId === userId);
  if (statusFilter) all = all.filter((a) => a.status === statusFilter);
  return all;
}

export function devGetAccount(id: string): StoredAccount | undefined {
  return getStore().accounts.find((a) => a.id === id);
}

export function devCreateAccount(data: Omit<StoredAccount, "id" | "createdAt" | "updatedAt">): StoredAccount {
  const store = getStore();
  const now = new Date().toISOString();
  const account: StoredAccount = {
    ...data,
    id: uid(),
    createdAt: now,
    updatedAt: now,
  };
  store.accounts.unshift(account);
  persist();
  return account;
}

export function devUpdateAccount(id: string, data: Partial<StoredAccount>): StoredAccount | null {
  const store = getStore();
  const idx = store.accounts.findIndex((a) => a.id === id);
  if (idx === -1) return null;
  store.accounts[idx] = { ...store.accounts[idx], ...data, updatedAt: new Date().toISOString() };
  persist();
  return store.accounts[idx];
}

export function devDeleteAccount(id: string): boolean {
  const store = getStore();
  const idx = store.accounts.findIndex((a) => a.id === id);
  if (idx === -1) return false;
  store.accounts.splice(idx, 1);
  persist();
  return true;
}

// ─── Clips ─────────────────────────────────────────────────

export function devGetClips(userId?: string, status?: string): StoredClip[] {
  let all = getStore().clips;
  if (userId) all = all.filter((c) => c.userId === userId);
  if (status) all = all.filter((c) => c.status === status);
  return all;
}

export function devGetClip(id: string): StoredClip | undefined {
  return getStore().clips.find((c) => c.id === id);
}

export function devCreateClip(data: Omit<StoredClip, "id" | "createdAt" | "updatedAt">): StoredClip {
  const store = getStore();
  const now = new Date().toISOString();

  const campaign = devGetCampaign(data.campaignId);
  const accounts = devGetAccounts(data.userId);
  const clipAccount = accounts.find((a) => a.id === data.clipAccountId);

  const clip: StoredClip = {
    ...data,
    id: uid(),
    createdAt: now,
    updatedAt: now,
    campaign: campaign ? { name: campaign.name, platform: campaign.platform } : null,
    clipAccount: clipAccount ? { username: clipAccount.username, platform: clipAccount.platform } : null,
    stats: [{ id: uid(), views: 0, likes: 0, comments: 0, shares: 0, checkedAt: now }],
  };
  store.clips.unshift(clip);
  persist();
  return clip;
}

export function devUpdateClip(id: string, data: Partial<StoredClip>): StoredClip | null {
  const store = getStore();
  const idx = store.clips.findIndex((c) => c.id === id);
  if (idx === -1) return null;
  store.clips[idx] = { ...store.clips[idx], ...data, updatedAt: new Date().toISOString() };
  persist();
  return store.clips[idx];
}

export function devFindClip(clipUrl: string, campaignId?: string, userId?: string): StoredClip | undefined {
  const all = getStore().clips;
  return all.find((c) => {
    if (c.clipUrl !== clipUrl) return false;
    if (campaignId && c.campaignId !== campaignId) return false;
    if (userId && c.userId !== userId) return false;
    return true;
  });
}

// ─── Campaign Accounts (join table) ────────────────────────

export function devGetCampaignAccounts(campaignId?: string, clipAccountId?: string): StoredCampaignAccount[] {
  let all = getStore().campaignAccounts;
  if (campaignId) all = all.filter((ca) => ca.campaignId === campaignId);
  if (clipAccountId) all = all.filter((ca) => ca.clipAccountId === clipAccountId);
  return all;
}

export function devJoinCampaign(clipAccountId: string, campaignId: string): StoredCampaignAccount | null {
  const store = getStore();
  const existing = store.campaignAccounts.find(
    (ca) => ca.clipAccountId === clipAccountId && ca.campaignId === campaignId
  );
  if (existing) return null;
  const entry: StoredCampaignAccount = {
    id: uid(),
    clipAccountId,
    campaignId,
    joinedAt: new Date().toISOString(),
  };
  store.campaignAccounts.push(entry);
  persist();
  return entry;
}

export function devLeaveCampaign(clipAccountId: string, campaignId: string): boolean {
  const store = getStore();
  const idx = store.campaignAccounts.findIndex(
    (ca) => ca.clipAccountId === clipAccountId && ca.campaignId === campaignId
  );
  if (idx === -1) return false;
  store.campaignAccounts.splice(idx, 1);
  persist();
  return true;
}

// ─── Payouts ───────────────────────────────────────────────

export function devGetPayouts(userId?: string, status?: string): StoredPayout[] {
  let all = getStore().payouts;
  if (userId) all = all.filter((p) => p.userId === userId);
  if (status) all = all.filter((p) => p.status === status);
  return all;
}

export function devCreatePayout(data: Omit<StoredPayout, "id" | "createdAt" | "updatedAt">): StoredPayout {
  const store = getStore();
  const now = new Date().toISOString();
  const payout: StoredPayout = {
    ...data,
    id: uid(),
    createdAt: now,
    updatedAt: now,
  };
  store.payouts.unshift(payout);
  persist();
  return payout;
}

export function devUpdatePayout(id: string, data: Partial<StoredPayout>): StoredPayout | null {
  const store = getStore();
  const idx = store.payouts.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  store.payouts[idx] = { ...store.payouts[idx], ...data, updatedAt: new Date().toISOString() };
  persist();
  return store.payouts[idx];
}
