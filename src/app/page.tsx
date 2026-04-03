import Link from "next/link";
import { auth } from "@/lib/auth";
import { redirect } from "next/navigation";
import { isDevBypassEnabled, DEV_AUTH_COOKIE } from "@/lib/dev-auth";
import { cookies } from "next/headers";

export default async function LandingPage() {
  // Check dev bypass first
  if (isDevBypassEnabled()) {
    const cookieStore = await cookies();
    const devRole = cookieStore.get(DEV_AUTH_COOKIE)?.value;
    if (devRole) {
      if (devRole === "ADMIN" || devRole === "OWNER") redirect("/admin");
      redirect("/dashboard");
    }
    redirect("/dev-login");
  }

  // Normal auth flow
  const session = await auth();
  if (session?.user) {
    const role = (session.user as any).role;
    if (role === "ADMIN" || role === "OWNER") redirect("/admin");
    redirect("/dashboard");
  }

  return (
    <div className="relative min-h-screen bg-[#050507] text-white overflow-hidden">
      {/* ── Animated background layers ── */}

      {/* Gradient mesh — 3 drifting radial gradients */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[70vw] h-[70vw] rounded-full bg-[#0ea5e9]/[0.07] blur-[120px] animate-[drift1_20s_ease-in-out_infinite]" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[60vw] h-[60vw] rounded-full bg-[#8b5cf6]/[0.06] blur-[120px] animate-[drift2_25s_ease-in-out_infinite]" />
        <div className="absolute top-[40%] left-[50%] w-[50vw] h-[50vw] rounded-full bg-[#1e3a5f]/[0.08] blur-[100px] animate-[drift3_18s_ease-in-out_infinite]" />
      </div>

      {/* Dot grid overlay */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.04]" style={{
        backgroundImage: "radial-gradient(circle, #ffffff 1px, transparent 1px)",
        backgroundSize: "40px 40px",
      }} />

      {/* Floating geometric shapes */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[15%] left-[10%] w-32 h-32 rounded-full border border-white/[0.04] animate-[float1_12s_ease-in-out_infinite]" />
        <div className="absolute top-[60%] right-[15%] w-20 h-20 rounded-2xl border border-white/[0.03] animate-[float2_15s_ease-in-out_infinite]" />
        <div className="absolute top-[30%] right-[25%] w-48 h-48 rounded-full border border-cyan-500/[0.04] animate-[float3_18s_ease-in-out_infinite]" />
        <div className="absolute bottom-[20%] left-[20%] w-24 h-24 rounded-xl border border-violet-500/[0.04] animate-[float2_14s_ease-in-out_infinite_reverse]" />
        <div className="absolute top-[70%] left-[60%] w-16 h-16 rounded-full bg-white/[0.02] animate-[float1_10s_ease-in-out_infinite]" />
      </div>

      {/* ── Nav ── */}
      <nav className="relative z-10 flex items-center justify-between px-6 sm:px-10 py-5">
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 100 100" className="h-7 w-7" fill="#2596be">
            <polygon points="50,10 90,85 10,85" />
          </svg>
          <span className="text-lg font-bold tracking-tight">CLIPPERS HQ</span>
        </div>
        <Link
          href="/login"
          className="rounded-xl bg-white/[0.06] border border-white/[0.08] px-5 py-2 text-sm font-medium hover:bg-white/[0.1] transition-all"
        >
          Sign In
        </Link>
      </nav>

      {/* ── Hero ── */}
      <main className="relative z-10 flex flex-col items-center justify-center px-4 pt-16 sm:pt-24 pb-16 text-center">
        {/* Logo with glow */}
        <div className="relative mb-8">
          <div className="absolute inset-0 w-24 h-24 rounded-full bg-[#2596be]/20 blur-[40px]" />
          <svg viewBox="0 0 100 100" className="relative h-20 w-20" fill="#2596be">
            <polygon points="50,10 90,85 10,85" />
          </svg>
        </div>

        <h1 className="mb-4 text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight bg-gradient-to-b from-white via-white to-zinc-400 bg-clip-text text-transparent animate-[fadeUp_0.8s_ease-out]">
          CLIPPERS HQ
        </h1>

        <p className="mb-3 max-w-lg text-lg sm:text-xl text-zinc-400 animate-[fadeUp_0.8s_ease-out_0.1s_both]">
          The all-in-one platform for managing clips, campaigns, and payouts.
        </p>

        <p className="mb-8 text-sm text-zinc-500 animate-[fadeUp_0.8s_ease-out_0.2s_both]">
          Simple, fast, powerful.
        </p>

        <Link
          href="/login"
          className="group relative rounded-xl px-8 py-3.5 text-base font-semibold text-white transition-all duration-300 animate-[fadeUp_0.8s_ease-out_0.3s_both]"
        >
          <span className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#0ea5e9] to-[#2596be] opacity-100 group-hover:opacity-90 transition-opacity" />
          <span className="absolute inset-0 rounded-xl bg-gradient-to-r from-[#0ea5e9] to-[#2596be] blur-lg opacity-40 group-hover:opacity-60 transition-opacity" />
          <span className="relative">Get Started</span>
        </Link>

        <p className="mt-6 text-sm text-zinc-600 animate-[fadeUp_0.8s_ease-out_0.4s_both]">
          Sign in with Discord to start clipping.
        </p>
      </main>

      {/* ── Stats bar ── */}
      <section className="relative z-10 border-y border-white/[0.06] py-10 my-8">
        <div className="max-w-4xl mx-auto px-4 grid grid-cols-3 gap-6 text-center">
          {[
            { number: "1,000+", label: "Clips Tracked" },
            { number: "50+", label: "Active Campaigns" },
            { number: "24/7", label: "Automated Tracking" },
          ].map((stat, i) => (
            <div key={i} className="animate-[fadeUp_0.8s_ease-out_both]" style={{ animationDelay: `${0.5 + i * 0.1}s` }}>
              <p className="text-2xl sm:text-3xl font-bold bg-gradient-to-b from-white to-zinc-400 bg-clip-text text-transparent">{stat.number}</p>
              <p className="text-xs sm:text-sm text-zinc-500 mt-1">{stat.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Features ── */}
      <section className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 pb-20">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: "📋", title: "Campaign Management", desc: "Create and manage clipping campaigns with custom rates and requirements." },
            { icon: "📊", title: "Real-Time Tracking", desc: "Automated view tracking across TikTok, Instagram, and YouTube." },
            { icon: "💰", title: "Instant Payouts", desc: "CPM-based earnings calculated and paid out automatically." },
            { icon: "🚀", title: "Built for Scale", desc: "From solo creators to full agencies — scales with your growth." },
          ].map((f, i) => (
            <div
              key={i}
              className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm p-6 hover:bg-white/[0.04] hover:border-white/[0.1] transition-all duration-300 animate-[fadeUp_0.8s_ease-out_both]"
              style={{ animationDelay: `${0.7 + i * 0.1}s` }}
            >
              <span className="text-2xl block mb-3">{f.icon}</span>
              <h3 className="text-sm font-semibold text-white mb-1">{f.title}</h3>
              <p className="text-xs text-zinc-500 leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── Footer ── */}
      <footer className="relative z-10 border-t border-white/[0.06] py-6 px-6">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
          <p className="text-xs text-zinc-600">CLIPPERS HQ &copy; {new Date().getFullYear()}</p>
          <div className="flex gap-4 text-xs text-zinc-600">
            <a href="#" className="hover:text-zinc-400 transition-colors">Terms</a>
            <a href="#" className="hover:text-zinc-400 transition-colors">Privacy</a>
            <a href="#" className="hover:text-zinc-400 transition-colors">Contact</a>
          </div>
        </div>
      </footer>

      {/* ── CSS Animations ── */}
      <style dangerouslySetInnerHTML={{ __html: `
        @keyframes drift1 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(40px, -30px); }
        }
        @keyframes drift2 {
          0%, 100% { transform: translate(0, 0); }
          50% { transform: translate(-50px, 30px); }
        }
        @keyframes drift3 {
          0%, 100% { transform: translate(-50%, 0); }
          50% { transform: translate(-50%, -40px); }
        }
        @keyframes float1 {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(-20px) rotate(5deg); }
        }
        @keyframes float2 {
          0%, 100% { transform: translateY(0) rotate(0deg); }
          50% { transform: translateY(15px) rotate(-3deg); }
        }
        @keyframes float3 {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-25px); }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}} />
    </div>
  );
}
