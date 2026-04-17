"use client";

import { useEffect, useState, useCallback } from "react";
import { useSession } from "next-auth/react";
import type { SessionUser } from "@/lib/auth-types";
import { useRouter } from "next/navigation";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/empty-state";
import { Wallet, Plus, Info, Phone, Check, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { formatCurrency, formatRelative } from "@/lib/utils";
import { useAutoRefresh } from "@/lib/use-auto-refresh";

const ASSET_SUGGESTIONS = ["USDT", "USDC"];
const CHAIN_SUGGESTIONS = ["TRON (TRC-20)", "Solana", "Ethereum (ERC-20)"];

function ComboInput({ id, label, placeholder, value, onChange, suggestions }: {
  id: string; label: string; placeholder: string; value: string;
  onChange: (v: string) => void; suggestions: string[];
}) {
  const [open, setOpen] = useState(false);
  const filtered = suggestions.filter((s) =>
    !value || s.toLowerCase().includes(value.toLowerCase())
  );
  return (
    <div className="relative space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-[var(--text-secondary)]">{label}</label>
      <input
        id={id}
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        autoComplete="off"
        className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] transition-theme focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
      />
      {open && filtered.length > 0 && (
        <div className="absolute z-10 top-full left-0 right-0 mt-1 rounded-lg border border-[var(--border-color)] bg-[var(--bg-card)] shadow-lg overflow-hidden">
          {filtered.map((s) => (
            <button
              key={s}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); onChange(s); setOpen(false); }}
              className="w-full px-3 py-2 text-left text-sm text-[var(--text-primary)] hover:bg-accent/10 transition-colors cursor-pointer"
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function PayoutsPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const userRole = (session?.user as SessionUser)?.role;

  useEffect(() => {
    if (session && userRole && userRole !== "CLIPPER") {
      router.replace("/admin");
    }
  }, [session, userRole, router]);

  const [payouts, setPayouts] = useState<any[]>([]);
  const [earnings, setEarnings] = useState<any>(null);
  const [clips, setClips] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feePercent, setFeePercent] = useState<number | null>(null);
  const [bonusPercent, setBonusPercent] = useState<number>(0);
  const [form, setForm] = useState({
    campaignId: "",
    amount: "",
    walletAddress: "",
    walletAsset: "",
    walletChain: "",
    discordUsername: "",
    proofNote: "",
  });
  // Call scheduling state
  const [myCalls, setMyCalls] = useState<any[]>([]);
  const [callModal, setCallModal] = useState<string | null>(null);
  const [callDate, setCallDate] = useState("");
  const [callTime, setCallTime] = useState("");
  const [callDiscord, setCallDiscord] = useState("");
  const [callTimezone, setCallTimezone] = useState("");
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [bookingCall, setBookingCall] = useState(false);
  const [bookingStep, setBookingStep] = useState(1);
  const [tzSearch, setTzSearch] = useState("");

  const load = useCallback(async () => {
    const ts = Date.now();
    try {
      const [payoutsRes, earningsRes, clipsRes, gamRes, callsRes] = await Promise.all([
        fetch(`/api/payouts/mine?_t=${ts}`, { cache: "no-store" }),
        fetch(`/api/earnings?_t=${ts}`, { cache: "no-store" }),
        fetch(`/api/clips/mine?_t=${ts}`, { cache: "no-store" }),
        fetch(`/api/gamification?_t=${ts}`, { cache: "no-store" }),
        fetch(`/api/calls?my=true&_t=${ts}`, { cache: "no-store" }).catch(() => ({ json: () => [] })),
      ]);
      const [payoutsData, earningsData, clipsData, gamData, callsData] = await Promise.all([
        payoutsRes.json(), earningsRes.json(), clipsRes.json(), gamRes.json(), callsRes.json(),
      ]);
      setPayouts(Array.isArray(payoutsData) ? payoutsData : []);
      setEarnings(earningsData);
      setClips(Array.isArray(clipsData) ? clipsData : []);
      setMyCalls(Array.isArray(callsData) ? callsData : []);
      if (gamData?.platformFeePercent != null) setFeePercent(gamData.platformFeePercent);
      if (gamData?.bonusPercent != null) setBonusPercent(gamData.bonusPercent);
    } catch {
      // keep existing state
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);
  useAutoRefresh(load, 20000);

  // Compute campaign-specific balances from earnings API data
  const campaignBalances: Record<string, { available: number; name: string }> = {};
  if (earnings?.campaignBalances) {
    for (const cb of earnings.campaignBalances) {
      if ((cb.available || 0) > 0) {
        campaignBalances[cb.campaignId] = { available: cb.available || 0, name: cb.campaignName || "Unknown" };
      }
    }
  }
  const availableCampaigns = Object.entries(campaignBalances).map(([id, data]) => ({ id, ...data }));

  // Campaign is required — balance is always campaign-specific
  const selectedAvailable = form.campaignId
    ? (campaignBalances[form.campaignId]?.available ?? 0)
    : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.campaignId) {
      toast.error("Please select a campaign.");
      return;
    }
    const amount = parseFloat(form.amount);
    if (!amount || amount <= 0) {
      toast.error("Please enter a valid amount.");
      return;
    }
    if (amount < 10) {
      toast.error("Minimum payout is $10.");
      return;
    }
    if (!form.walletAddress.trim()) {
      toast.error("Please enter a wallet address.");
      return;
    }
    if (!form.discordUsername.trim()) {
      toast.error("Discord username is required.");
      return;
    }
    if (amount > selectedAvailable) {
      toast.error(`Amount exceeds available balance (${formatCurrency(selectedAvailable)}).`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/payouts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, amount }),
      });
      const respData = await res.json();
      if (!res.ok) {
        throw new Error(respData.error || "Failed to submit");
      }
      setShowModal(false);
      setForm({ campaignId: "", amount: "", walletAddress: "", walletAsset: "", walletChain: "", discordUsername: "", proofNote: "" });
      await load();
      toast.success("Payout request submitted.");
    } catch (err: any) {
      toast.error(err.message || "Submission failed.");
    }
    setSubmitting(false);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" />
      </div>
    );
  }

  const statusMap: Record<string, string> = {
    REQUESTED: "pending",
    UNDER_REVIEW: "pending",
    APPROVED: "approved",
    PAID: "active",
    REJECTED: "rejected",
    VOIDED: "voided",
  };

  // Earnings per campaign — only count APPROVED clips
  const campaignEarnings: Record<string, { name: string; earned: number }> = {};
  for (const clip of clips) {
    if (clip.status === "APPROVED" && clip.earnings > 0 && !clip.videoUnavailable && clip.campaignId) {
      if (!campaignEarnings[clip.campaignId]) {
        campaignEarnings[clip.campaignId] = { name: clip.campaign?.name || "Unknown", earned: 0 };
      }
      campaignEarnings[clip.campaignId].earned += clip.earnings;
    }
  }
  const campaignList = Object.entries(campaignEarnings).map(([id, data]) => ({ id, ...data }));

  const statusLabel: Record<string, string> = {
    REQUESTED: "Requested",
    UNDER_REVIEW: "Under review",
    APPROVED: "Approved",
    PAID: "Paid",
    REJECTED: "Rejected",
    VOIDED: "Voided",
  };

  const getCallForPayout = (payoutId: string, payout?: any) => {
    // Check myCalls first (from dedicated calls API)
    const fromCalls = myCalls.find((c: any) => c.payoutId === payoutId && c.status !== "CANCELLED");
    if (fromCalls) return fromCalls;
    // Fallback: check embedded scheduledCalls on the payout object
    if (payout?.scheduledCalls?.length > 0) {
      const embedded = payout.scheduledCalls.find((c: any) => c.status !== "CANCELLED");
      if (embedded) return embedded;
    }
    return null;
  };

  // Full timezone list
  const ALL_TIMEZONES = [
    { value: "(UTC-12:00) Baker Island", offset: -12 },
    { value: "(UTC-11:00) American Samoa", offset: -11 },
    { value: "(UTC-10:00) Hawaii", offset: -10 },
    { value: "(UTC-9:00) Alaska", offset: -9 },
    { value: "(UTC-8:00) Los Angeles, Vancouver", offset: -8 },
    { value: "(UTC-7:00) Denver, Phoenix", offset: -7 },
    { value: "(UTC-6:00) Chicago, Mexico City", offset: -6 },
    { value: "(UTC-5:00) New York, Toronto, Bogota", offset: -5 },
    { value: "(UTC-4:00) Santiago, Caracas, Halifax", offset: -4 },
    { value: "(UTC-3:00) Buenos Aires, Sao Paulo", offset: -3 },
    { value: "(UTC-2:00) Mid-Atlantic", offset: -2 },
    { value: "(UTC-1:00) Azores", offset: -1 },
    { value: "(UTC+0:00) London, Dublin, Lisbon", offset: 0 },
    { value: "(UTC+1:00) Paris, Berlin, Rome, Lagos, Madrid", offset: 1 },
    { value: "(UTC+2:00) Cairo, Athens, Johannesburg, Helsinki", offset: 2 },
    { value: "(UTC+3:00) Moscow, Istanbul, Nairobi, Riyadh", offset: 3 },
    { value: "(UTC+3:30) Tehran", offset: 3.5 },
    { value: "(UTC+4:00) Dubai, Baku", offset: 4 },
    { value: "(UTC+4:30) Kabul", offset: 4.5 },
    { value: "(UTC+5:00) Karachi, Tashkent", offset: 5 },
    { value: "(UTC+5:30) Mumbai, New Delhi, Colombo", offset: 5.5 },
    { value: "(UTC+5:45) Kathmandu", offset: 5.75 },
    { value: "(UTC+6:00) Dhaka, Almaty", offset: 6 },
    { value: "(UTC+7:00) Bangkok, Jakarta, Hanoi", offset: 7 },
    { value: "(UTC+8:00) Singapore, Hong Kong, Manila, Perth", offset: 8 },
    { value: "(UTC+9:00) Tokyo, Seoul", offset: 9 },
    { value: "(UTC+9:30) Adelaide", offset: 9.5 },
    { value: "(UTC+10:00) Sydney, Melbourne, Brisbane", offset: 10 },
    { value: "(UTC+11:00) Solomon Islands", offset: 11 },
    { value: "(UTC+12:00) Auckland, Fiji", offset: 12 },
    { value: "(UTC+13:00) Samoa, Tonga", offset: 13 },
  ];

  const filteredTimezones = tzSearch
    ? ALL_TIMEZONES.filter((tz) => tz.value.toLowerCase().includes(tzSearch.toLowerCase()))
    : ALL_TIMEZONES;

  const getTimezoneOffset = (tz: string): number => {
    const found = ALL_TIMEZONES.find((o) => o.value === tz);
    return found ? found.offset : 1;
  };

  /** Convert a team time slot (HH:MM, UTC+1) to the clipper's local time */
  const convertSlotToLocal = (teamSlot: string, tzOffset: number): { local: string; isLateNight: boolean; period: string } => {
    const teamOffset = 1; // UTC+1
    const [h, m] = teamSlot.split(":").map(Number);
    const utcMinutes = h * 60 + m - teamOffset * 60;
    let localMinutes = utcMinutes + tzOffset * 60;
    if (localMinutes < 0) localMinutes += 1440;
    if (localMinutes >= 1440) localMinutes -= 1440;
    const localH = Math.floor(localMinutes / 60);
    const localM = localMinutes % 60;
    const ampm = localH >= 12 ? "PM" : "AM";
    const h12 = localH === 0 ? 12 : localH > 12 ? localH - 12 : localH;
    const local = `${h12}:${String(localM).padStart(2, "0")} ${ampm}`;
    const isLateNight = localH >= 22 || localH < 6;
    const period = localH < 12 ? "Morning" : localH < 17 ? "Afternoon" : "Evening";
    return { local, isLateNight, period };
  };

  // Generate next 7 days for date picker
  const next7Days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i + 1);
    return { value: d.toISOString().split("T")[0], label: d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) };
  });

  const fetchSlots = async (date: string) => {
    setCallDate(date);
    setCallTime("");
    setLoadingSlots(true);
    try {
      const res = await fetch(`/api/calls?available=true&date=${date}`);
      const data = await res.json();
      setAvailableSlots(Array.isArray(data.slots) ? data.slots : []);
    } catch { /* silent */ setAvailableSlots([]); }
    setLoadingSlots(false);
  };

  const bookCall = async () => {
    if (!callModal || !callDate || !callTime || !callDiscord.trim()) {
      toast.error("Please fill in all fields.");
      return;
    }
    setBookingCall(true);
    try {
      const res = await fetch("/api/calls/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payoutId: callModal, date: callDate, time: callTime, discordUsername: callDiscord, clipperTimezone: callTimezone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Call booked! You'll receive a reminder.");
      setCallModal(null);
      setCallDate("");
      setCallTime("");
      setCallDiscord("");
      setCallTimezone("");
      load();
    } catch (err: any) { toast.error(err.message); }
    setBookingCall(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)]">Payout Requests</h1>
          <p className="text-sm text-[var(--text-secondary)]">
            Available balance: <span className="font-semibold text-accent">{formatCurrency(earnings?.available || 0)}</span>
            {earnings?.lockedInPayouts > 0 && (
              <span className="text-[var(--text-muted)]"> · {formatCurrency(earnings.lockedInPayouts)} in queue</span>
            )}
          </p>
        </div>
        <Button
          onClick={() => setShowModal(true)}
          icon={<Plus className="h-4 w-4" />}
          disabled={(earnings?.available || 0) <= 0}
          className="whitespace-nowrap"
        >
          Request Payout
        </Button>
      </div>

      {payouts.length === 0 ? (
        <EmptyState
          icon={<Wallet className="h-10 w-10" />}
          title="No payout requests"
          description="Request a payout when you have available earnings."
        />
      ) : (
        <div className="space-y-3">
          {payouts.map((payout: any) => (
            <Card key={payout.id}>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-lg lg:text-xl font-bold text-[var(--text-primary)]">
                    {payout.finalAmount != null ? formatCurrency(payout.finalAmount) : formatCurrency(payout.amount)}
                  </p>
                  {payout.finalAmount != null && payout.finalAmount !== payout.amount && (
                    <p className="text-[11px] lg:text-xs text-[var(--text-muted)] tabular-nums">
                      {formatCurrency(payout.amount)} requested
                      {payout.feeAmount > 0 && <> · <span className="text-red-400">-{formatCurrency(payout.feeAmount)} fee</span></>}
                      {payout.bonusAmount > 0 && <> · <span className="text-emerald-400">+{formatCurrency(payout.bonusAmount)} bonus</span></>}
                    </p>
                  )}
                  {payout.campaign?.name && (
                    <p className="text-xs lg:text-sm font-medium text-accent truncate">{payout.campaign.name}</p>
                  )}
                  <p className="text-xs lg:text-sm text-[var(--text-muted)] truncate">
                    {formatRelative(payout.createdAt)} · {payout.walletAddress}
                  </p>
                </div>
                <Badge variant={statusMap[payout.status] as any}>
                  {statusLabel[payout.status] || payout.status}
                </Badge>
              </div>
              {payout.status === "REJECTED" && payout.rejectionReason && (
                <div className="mt-3 rounded-lg bg-red-500/5 px-3 py-2 text-xs text-red-400">
                  Reason: {payout.rejectionReason}
                </div>
              )}
              {/* Call scheduling info */}
              {(() => {
                const call = getCallForPayout(payout.id, payout);
                if (!call) return null;
                if (call.status === "PENDING") return (
                  <div className="mt-3 rounded-lg border border-accent/20 bg-accent/5 px-4 py-3">
                    <p className="text-sm text-accent font-medium mb-2"><Phone className="h-4 w-4 text-accent inline-block -mt-0.5 mr-1" /> A verification call is required for this payout.</p>
                    <Button size="sm" onClick={() => { setCallModal(payout.id); setCallDiscord(payout.discordUsername || ""); }} icon={<Phone className="h-3.5 w-3.5" />}>
                      Select Call Time
                    </Button>
                  </div>
                );
                if (call.status === "CONFIRMED") {
                  const dt = call.scheduledAt ? new Date(call.scheduledAt).toLocaleString("en-US", { timeZone: "Europe/Belgrade", weekday: "short", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
                  return (
                    <div className="mt-3 rounded-lg border border-accent/20 bg-accent/5 px-4 py-3">
                      <p className="text-sm text-accent font-medium"><Phone className="h-4 w-4 text-accent inline-block -mt-0.5 mr-1" /> Call scheduled for {dt} (team time)</p>
                      <p className="text-xs text-[var(--text-muted)] mt-1">Discord: {call.discordUsername} — Make sure you're available!</p>
                    </div>
                  );
                }
                if (call.status === "COMPLETED") return <p className="mt-2 text-xs text-accent"><Check className="h-4 w-4 text-accent inline-block -mt-0.5 mr-1" /> Verification call completed</p>;
                if (call.status === "MISSED") return <p className="mt-2 text-xs text-red-400"><X className="h-4 w-4 text-red-400 inline-block -mt-0.5 mr-1" /> You missed the verification call</p>;
                return null;
              })()}
            </Card>
          ))}
        </div>
      )}

      {/* Call Booking Modal — Step-by-step */}
      <Modal open={!!callModal} onClose={() => { setCallModal(null); setBookingStep(1); }} title="Schedule Verification Call" className="max-w-lg">
        <div className="space-y-5">
          {/* Progress dots */}
          <div className="flex items-center justify-center gap-2">
            {[1, 2, 3, 4].map((s) => (
              <div key={s} className={`h-2 rounded-full transition-all ${s === bookingStep ? "w-6 bg-accent" : s < bookingStep ? "w-2 bg-accent" : "w-2 bg-[var(--border-color)]"}`} />
            ))}
          </div>

          {/* Step 1: Timezone */}
          {bookingStep === 1 && (
            <div className="space-y-3">
              <h3 className="text-base font-semibold text-[var(--text-primary)]">Select your timezone</h3>
              <input
                type="text"
                placeholder="Search by city or UTC offset..."
                value={tzSearch}
                onChange={(e) => setTzSearch(e.target.value)}
                className="w-full rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-accent focus:ring-1 focus:ring-accent focus:outline-none"
              />
              <div className="max-h-48 overflow-y-auto rounded-lg border border-[var(--border-color)] bg-[var(--bg-input)]">
                {filteredTimezones.map((tz) => (
                  <button key={tz.value} type="button" onClick={() => { setCallTimezone(tz.value); setCallTime(""); setTzSearch(""); }}
                    className={`w-full px-3 py-2 text-left text-sm transition-colors cursor-pointer ${callTimezone === tz.value ? "bg-accent/10 text-accent font-medium" : "text-[var(--text-secondary)] hover:bg-[var(--bg-card-hover)]"}`}>
                    {tz.value}
                  </button>
                ))}
                {filteredTimezones.length === 0 && <p className="px-3 py-2 text-sm text-[var(--text-muted)]">No results</p>}
              </div>
              <div className="flex justify-end">
                <Button onClick={() => setBookingStep(2)} disabled={!callTimezone}>Next</Button>
              </div>
            </div>
          )}

          {/* Step 2: Date */}
          {bookingStep === 2 && (
            <div className="space-y-3">
              <h3 className="text-base font-semibold text-[var(--text-primary)]">Pick a date</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {next7Days.map((d) => (
                  <button key={d.value} type="button" onClick={() => { fetchSlots(d.value); }}
                    className={`rounded-xl p-3 text-left transition-all cursor-pointer ${callDate === d.value ? "bg-accent text-white border-2 border-accent" : "border border-[var(--border-color)] hover:bg-[var(--bg-input)]"}`}>
                    <p className={`text-sm font-semibold ${callDate === d.value ? "text-white" : "text-[var(--text-primary)]"}`}>{d.label.split(",")[0]}</p>
                    <p className={`text-xs ${callDate === d.value ? "text-white/70" : "text-[var(--text-muted)]"}`}>{d.label}</p>
                  </button>
                ))}
              </div>
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setBookingStep(1)}>Back</Button>
                <Button onClick={() => setBookingStep(3)} disabled={!callDate}>Next</Button>
              </div>
            </div>
          )}

          {/* Step 3: Time */}
          {bookingStep === 3 && (
            <div className="space-y-3">
              <h3 className="text-base font-semibold text-[var(--text-primary)]">Pick a time</h3>
              {loadingSlots ? (
                <div className="flex justify-center py-6"><div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--border-color)] border-t-accent" /></div>
              ) : availableSlots.length === 0 ? (
                <div className="py-4 text-center">
                  <p className="text-sm text-[var(--text-muted)]">No slots available for this date.</p>
                  <Button variant="ghost" size="sm" onClick={() => setBookingStep(2)} className="mt-2">Pick another date</Button>
                </div>
              ) : (() => {
                const tzOffset = getTimezoneOffset(callTimezone);
                const grouped: Record<string, { slot: string; local: string; isLateNight: boolean }[]> = {};
                for (const slot of availableSlots) {
                  const { local, isLateNight, period } = convertSlotToLocal(slot, tzOffset);
                  if (!grouped[period]) grouped[period] = [];
                  grouped[period].push({ slot, local, isLateNight });
                }
                return (
                  <div className="space-y-3">
                    {Object.entries(grouped).map(([period, slots]) => (
                      <div key={period}>
                        <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)] mb-1.5">{period}</p>
                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1.5">
                          {slots.map(({ slot, local, isLateNight }) => (
                            <button key={slot} type="button" onClick={() => setCallTime(slot)}
                              className={`rounded-lg px-2 py-2.5 text-center transition-all cursor-pointer ${
                                callTime === slot ? "bg-accent text-white"
                                : isLateNight ? "border border-[var(--border-color)] text-[var(--text-muted)] opacity-50 hover:opacity-100"
                                : "border border-[var(--border-color)] text-[var(--text-secondary)] hover:bg-[var(--bg-input)]"
                              }`}>
                              <span className="block text-sm font-medium">{local}</span>
                              {isLateNight && <span className="block text-[9px] text-yellow-400">late night</span>}
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                    <p className="text-xs text-[var(--text-muted)]">Available hours: 8:00 AM – 8:00 PM. Times shown in your timezone.</p>
                  </div>
                );
              })()}
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setBookingStep(2)}>Back</Button>
                <Button onClick={() => setBookingStep(4)} disabled={!callTime}>Next</Button>
              </div>
            </div>
          )}

          {/* Step 4: Confirm */}
          {bookingStep === 4 && (
            <div className="space-y-4">
              <h3 className="text-base font-semibold text-[var(--text-primary)]">Confirm your call</h3>
              <div className="rounded-xl border border-accent/20 bg-accent/5 p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-muted)]">Date</span>
                  <span className="text-[var(--text-primary)] font-medium">{next7Days.find((d) => d.value === callDate)?.label || callDate}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-muted)]">Time (your timezone)</span>
                  <span className="text-accent font-semibold">{callTime && callTimezone ? convertSlotToLocal(callTime, getTimezoneOffset(callTimezone)).local : ""}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[var(--text-muted)]">Duration</span>
                  <span className="text-[var(--text-primary)]">15 minute Discord call</span>
                </div>
              </div>
              <Input id="callDiscord" label="Your Discord username *" placeholder="username" value={callDiscord} onChange={(e) => setCallDiscord(e.target.value)} />
              <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--bg-secondary)] px-3 py-2.5">
                <p className="text-xs text-[var(--text-muted)]">Make sure your Discord account can receive calls. We&apos;ll reach out from our team account.</p>
              </div>
              <div className="flex justify-between">
                <Button variant="ghost" onClick={() => setBookingStep(3)}>Back</Button>
                <Button onClick={bookCall} loading={bookingCall} disabled={!callDiscord.trim()} icon={<Phone className="h-4 w-4" />}>
                  Confirm Call
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Request Modal */}
      <Modal open={showModal} onClose={() => setShowModal(false)} title="Request Payout">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-xl border border-accent/20 bg-accent/5 px-4 py-3 mb-2">
            <p className="text-xs text-[var(--text-muted)]">
              {form.campaignId ? "Available balance" : "Select a campaign below"}
            </p>
            <p className="text-xl lg:text-2xl font-bold text-accent">
              {form.campaignId ? formatCurrency(selectedAvailable) : "-"}
            </p>
          </div>

          <Select
            id="campaignId"
            label="Campaign *"
            options={availableCampaigns.map((c) => ({
              value: c.id, label: `${c.name} (${formatCurrency(c.available)} available)`,
            }))}
            placeholder="Select a campaign"
            value={form.campaignId}
            onChange={(e) => setForm({ ...form, campaignId: e.target.value, amount: "" })}
          />
          <Input
            id="amount"
            label="Amount *"
            type="number"
            step="0.01"
            placeholder="0.00"
            value={form.amount}
            onChange={(e) => setForm({ ...form, amount: e.target.value })}
          />

          {/* Payout breakdown */}
          {feePercent != null && (() => {
            const amt = parseFloat(form.amount) || 0;
            const fee = Math.round(amt * feePercent / 100 * 100) / 100;
            const final_ = Math.round((amt - fee) * 100) / 100;
            const show = amt > 0;
            return (
              <div className="rounded-xl border border-[var(--border-color)] bg-[var(--bg-input)] px-4 py-3 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">Requested</span>
                  <span className="text-[var(--text-primary)] tabular-nums">{show ? formatCurrency(amt) : "-"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[var(--text-secondary)]">Platform fee ({feePercent}%)</span>
                  <span className="text-red-400 tabular-nums">{show ? `-${formatCurrency(fee)}` : "-"}</span>
                </div>
                <div className="flex justify-between border-t border-[var(--border-color)] pt-1.5">
                  <span className="text-[var(--text-primary)] font-semibold">You&apos;ll receive</span>
                  <span className="text-accent font-bold tabular-nums">{show ? formatCurrency(final_) : "-"}</span>
                </div>
                {bonusPercent > 0 && (
                  <p className="text-xs text-emerald-400 pt-1">Your earnings already include your +{bonusPercent}% bonus</p>
                )}
              </div>
            );
          })()}

          {/* Wallet section */}
          <div className="space-y-3 rounded-xl border border-[var(--border-color)] p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--text-muted)]">Wallet details</p>
            <Input
              id="walletAddress"
              label="Wallet address *"
              placeholder="Your wallet address"
              value={form.walletAddress}
              onChange={(e) => setForm({ ...form, walletAddress: e.target.value })}
            />
            <div className="grid gap-3 sm:grid-cols-2">
              <ComboInput
                id="walletAsset"
                label="Asset"
                placeholder="e.g. USDT, USDC"
                value={form.walletAsset}
                onChange={(v) => setForm({ ...form, walletAsset: v })}
                suggestions={ASSET_SUGGESTIONS}
              />
              <ComboInput
                id="walletChain"
                label="Chain / Network"
                placeholder="e.g. TRON, Solana"
                value={form.walletChain}
                onChange={(v) => setForm({ ...form, walletChain: v })}
                suggestions={CHAIN_SUGGESTIONS}
              />
            </div>
          </div>

          <Input
            id="discordUsername"
            label="Discord username *"
            placeholder="your_discord_name"
            value={form.discordUsername}
            onChange={(e) => setForm({ ...form, discordUsername: e.target.value })}
          />
          <Textarea
            id="proofNote"
            label="Proof note"
            placeholder="Include any relevant notes or proof description"
            value={form.proofNote}
            onChange={(e) => setForm({ ...form, proofNote: e.target.value })}
          />
          <p className="text-xs text-[var(--text-muted)]">
            Minimum payout is $10. A screen recording of your analytics may be required for verification.
          </p>
          <div className="sticky bottom-0 bg-[var(--bg-card)] pt-3 pb-1 border-t border-[var(--border-color)] -mx-6 px-6 -mb-6">
            <div className="flex justify-end gap-3">
              <Button type="button" variant="ghost" onClick={() => setShowModal(false)}>Cancel</Button>
              <Button type="submit" loading={submitting}>Submit Request</Button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}
